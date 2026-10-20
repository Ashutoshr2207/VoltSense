"""Build a provenance-preserving discharge observation catalogue, not a model release.

Run from repository root. Refuses overwrites. Only writes the three requested outputs.
"""
import csv
import hashlib
import io
import json
import math
import sys
import platform
import shutil
import uuid
import importlib.metadata
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.io import loadmat

ROOT = Path.cwd().resolve()
sys.path.insert(0, str(ROOT / 'ml-service'))
from features import FEATURE_CONTRACT, build_row, first_eol, soh, validate_history

FINAL = ROOT / 'data/processed'
OUT = ROOT / '.cache' / ('unified-build-' + uuid.uuid4().hex)
NAMES = ['voltsense_unified_battery_dataset.csv', 'voltsense_unified_dataset_manifest.json',
         'voltsense_unified_dataset_README.md']
COLS = {
    'observation_id': 'Stable dataset/native-cell/source-member-hash/record/stream identifier; primary row key.',
    'dataset_id': 'nasa_aging_arc, nasa_randomized_usage, xjtu, oxford_degradation or oxford_example.',
    'battery_uid': 'Dataset-scoped physical-cell grouping key; blank for the unidentified example.',
    'native_battery_id': 'Original B/RW/Cell ID or batch-qualified XJTU filename stem.',
    'measurement_stream': 'Capacity measurement protocol; never pool different streams as successive cycles.',
    'observation_kind': 'Dense discharge, reference check, partial/other discharge operation, or example profile.',
    'source_file': 'Repository-relative source ZIP or MAT path.',
    'source_file_sha256': 'SHA-256 of original source container/file.',
    'source_member': 'ZIP member, if applicable; blank for an unarchived MAT.',
    'source_member_sha256': 'Hash of decoded member bytes, or same as file hash for direct MAT.',
    'source_record_index': 'Original 1-based MATLAB operation/cycle/step index; never compressed.',
    'source_cycle_index': 'Original completed-discharge ordinal (NASA), XJTU record index, or Oxford drive-cycle key; blank for RW steps.',
    'source_cycle_unit': 'completed_discharge_cycles, mixed_experimental_cycles, drive_cycles, or unavailable.',
    'capacity_check_ordinal': '1-based measurement-stream index; NOT an aging-cycle identifier.',
    'source_time': 'Original/normalized source timestamp string; no fabricated timezone.',
    'source_timezone': 'unknown: source clock is not asserted UTC.',
    'discharge_capacity_Ah': 'Supplied complete-discharge capacity or full-test integral/counter delta, Ah; blank for partial/invalid measurements. Inspect quality/status before use.',
    'discharge_throughput_Ah': 'Integrated delivered charge over this observed operation, Ah; partial throughput is NOT health capacity.',
    'capacity_method': 'Source scalar, reference current integral, or signed mAh-counter delta.',
    'reference_capacity_Ah': 'First credible/provisionally screened full discharge in the SAME stream, Ah; never a maximum/later replacement.',
    'reference_source_record_index': 'Source record of reference; identifies sparse/noninitial references explicitly.',
    'reference_status': 'existing_nasa_quality_manifest, screened_first_full_candidate, or unavailable.',
    'soh_percent': 'min(100,100*discharge_capacity_Ah/reference_capacity_Ah); blank when measurement/reference is not acceptable.',
    'soh_status': 'existing_dense_label, candidate_dense_label, candidate_rate_confounded_label, candidate_sparse_label, or unavailable.',
    'eol_threshold_percent': '80; unchanged project relative SOH threshold.',
    'eol_observation_status': 'observed_dense, censored_dense, observed_sparse, not_observed_sparse, or unavailable.',
    'first_observed_eol_source_cycle': 'First observed crossing on original source cycle axis; NOT an estimator feature; blank if axis/unobserved outcome unavailable.',
    'first_observed_eol_source_record': 'Source operation/step index of first observed crossing; sparse detection, not continuous physical crossing.',
    'rul_cycles': 'max(0,E-t), ONLY for compatible dense completed-discharge histories with observed EOL. Blank for censored/sparse/invalid histories.',
    'rul_status': 'observed_dense_label, censored_unobserved, sparse_units_not_compatible, rate_confounded_unreviewed, or unavailable.',
    'is_censored': 'true/false for a usable label stream; blank when reference/quality prevents that assessment. Sparse true means no observed detection, not dense RUL eligibility.',
    'dense_history_valid': 'true only for an uninterrupted screened 1..t complete-discharge history under the dense contract.',
    'current_contract_eligible': 'true only for dense_history_valid and t>=7; prospective data suitability, NOT model approval or permission to train on a holdout.',
    'eligibility_reason': 'Explicit compatibility/exclusion reason.',
    'existing_partition': 'Original NASA train/validation/test or excluded; new corpora unassigned. Never overwrite existing split.',
    'recommended_use': 'NASA development/validation/previously-inspected test, or external_validation_candidate; advisory, not a new split.',
    'quality_flags': 'Pipe-separated per-observation/reference/prefix warnings. Empty does not imply production certification.',
    'protocol': 'Source protocol/description; retain discharge rates and cutoff distinctions.',
    'chemistry': 'XJTU NCM523 if documented; otherwise lithium_ion_subtype_unspecified.',
    'nominal_capacity_Ah': '2.0 for documented NASA aging/XJTU cells; 0.740 Oxford; blank RW (not assumed).',
    'ambient_temperature_C': 'Source-declared ambient/chamber setting, Celsius; blank unknown. Not measured cell temperature.',
    'discharge_cutoff_V': 'Source protocol cutoff, V; blank where not a full test/unspecified.',
    'signal_count': 'Number of samples in observation.',
    'duration_s': 'Observed operation duration, seconds; blank for unresolved timing.',
    'mean_voltage_V': 'Observation mean voltage, V; contemporaneous diagnostic, not a causal feature for the same target.',
    'mean_discharge_current_A': 'Mean discharge-current magnitude, A; always discharge-positive after documented sign mapping.',
    'mean_temperature_C': 'Mean cell temperature over observation, C; not substituted from ambient.',
}


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def array(x):
    return np.asarray(x, dtype=float).reshape(-1)


def scalar(x):
    try:
        a = array(x)
        return float(a[0]) if len(a) == 1 and np.isfinite(a[0]) else None
    except (ValueError, TypeError):
        return None


def finite_mean(a):
    return float(np.mean(a)) if len(a) and np.isfinite(a).all() else None


def metrics(t, v, i, temp, sign=1, scale=1):
    flags = []
    same = len(t) > 1 and len({len(t), len(v), len(i), len(temp)}) == 1
    finite = same and all(np.isfinite(a).all() for a in [t, v, i, temp])
    if not same:
        flags.append('missing_or_unequal_signal_arrays')
    if not finite:
        flags.append('invalid_signal_values')
    ordered = finite and bool((np.diff(t) > 0).all())
    if finite and not ordered:
        flags.append('nonincreasing_signal_time')
    positive = sign * i
    return {'signal_count': len(t), 'duration_s': float((t[-1]-t[0])*scale) if ordered else None,
            'mean_voltage_V': finite_mean(v), 'mean_discharge_current_A': finite_mean(positive),
            'mean_temperature_C': finite_mean(temp),
            'discharge_throughput_Ah': float(np.trapezoid(np.maximum(positive, 0), t)*scale/3600) if ordered else None}, flags


def base(dataset, cell, path, member='', member_hash=None, index=1, stream='discharge'):
    native = cell
    uid = dataset + '/' + cell if cell else None
    digest = member_hash or FILE_HASH[path]
    return {k: None for k in COLS} | {
        'observation_id': dataset + ':' + (cell or 'unassigned') + ':' + digest + ':' + str(index) + ':' + stream,
        'dataset_id': dataset, 'battery_uid': uid, 'native_battery_id': native,
        'measurement_stream': stream, 'source_file': path, 'source_file_sha256': FILE_HASH[path],
        'source_member': member or None, 'source_member_sha256': digest, 'source_record_index': index,
        'source_timezone': 'unknown', 'eol_threshold_percent': 80.0, 'soh_status': 'unavailable',
        'reference_status': 'unavailable', 'eol_observation_status': 'unavailable', 'rul_status': 'unavailable',
        'dense_history_valid': False, 'current_contract_eligible': False,
        'existing_partition': 'unassigned', 'recommended_use': 'external_validation_candidate',
        'chemistry': 'lithium_ion_subtype_unspecified', 'quality_flags': ''}


def flag(row, *values):
    row['quality_flags'] = '|'.join(sorted(set(filter(None, row['quality_flags'].split('|') + list(values)))))


def label_stream(rows, quality_ok, dense=False, reference_status='screened_first_full_candidate', soh_status='candidate_sparse_label'):
    """First reference only. Never seek a later or maximum reference after failure."""
    if not rows:
        return
    if not quality_ok[0] or not rows[0]['discharge_capacity_Ah'] or rows[0]['discharge_capacity_Ah'] <= 0:
        for r in rows:
            flag(r, 'first_full_reference_unvalidated')
        return
    ref = rows[0]['discharge_capacity_Ah']
    # A failed full-capacity observation closes the contiguous outcome-label prefix.
    prefix = []
    for r, ok in zip(rows, quality_ok):
        if not ok:
            break
        prefix.append(r)
    event = next((r for r in prefix if soh(r['discharge_capacity_Ah'], ref) <= 80), None)
    for r, ok in zip(rows, quality_ok):
        r.update(reference_capacity_Ah=ref, reference_source_record_index=rows[0]['source_record_index'],
                 reference_status=reference_status)
        if ok:
            r.update(soh_percent=soh(r['discharge_capacity_Ah'], ref), soh_status=soh_status)
        r['dense_history_valid'] = dense and r in prefix
        r['current_contract_eligible'] = bool(r['dense_history_valid'] and r['source_cycle_index'] >= 7)
        if r in prefix:
            r['is_censored'] = event is None
            r['eol_observation_status'] = ('observed_dense' if event else 'censored_dense') if dense else ('observed_sparse' if event else 'not_observed_sparse')
            if event:
                r['first_observed_eol_source_cycle'] = event['source_cycle_index']
                r['first_observed_eol_source_record'] = event['source_record_index']
            if dense:
                r['rul_cycles'] = max(0, event['source_cycle_index'] - r['source_cycle_index']) if event else None
                r['rul_status'] = 'observed_dense_label' if event else 'censored_unobserved'
            else:
                r['rul_status'] = 'sparse_units_not_compatible'
        else:
            flag(r, 'history_after_unresolved_full_test_gap')
        if dense:
            r['eligibility_reason'] = ('compatible_dense_candidate' if r['current_contract_eligible'] else
                'needs_seven_valid_consecutive_discharges' if r['dense_history_valid'] else 'unresolved_capacity_or_reference_gap')


EXCLUSIONS = defaultdict(lambda: {'count': 0, 'example_source_records': []})
MEMBERS = []
STATS = defaultdict(Counter)
CELLS = []
SEEN_IDS = set()
VALIDATION = Counter()


def excluded(path, member, reason, count, examples=()):
    item = EXCLUSIONS[(path, member, reason)]
    item['count'] += int(count)
    item['example_source_records'] = (item['example_source_records'] + list(examples))[:10]


def emit(writer, rows):
    groups = defaultdict(list)
    for r in rows:
        if r['mean_temperature_C'] is not None and not -50 <= r['mean_temperature_C'] <= 100:
            flag(r,'implausible_temperature_C_retained_raw')
            VALIDATION['implausible_temperature_rows_flagged'] += 1
        identity = r['observation_id']
        assert identity not in SEEN_IDS, identity
        SEEN_IDS.add(identity)
        if r['discharge_capacity_Ah'] is not None:
            assert math.isfinite(r['discharge_capacity_Ah']) and r['discharge_capacity_Ah'] > 0
        if r['soh_percent'] is not None:
            assert r['reference_capacity_Ah'] > 0 and 0 < r['soh_percent'] <= 100
            assert math.isclose(r['soh_percent'], soh(r['discharge_capacity_Ah'], r['reference_capacity_Ah']), abs_tol=1e-12)
        if r['rul_cycles'] is not None:
            assert r['dense_history_valid'] and r['source_cycle_unit'] == 'completed_discharge_cycles'
            assert r['rul_cycles'] == max(0, r['first_observed_eol_source_cycle']-r['source_cycle_index'])
            assert not r['is_censored']
            VALIDATION['rul_label_rows'] += 1
        if r['is_censored'] is True:
            assert r['rul_cycles'] is None
        if r['soh_percent'] is not None:
            VALIDATION['soh_label_rows'] += 1
        if r['current_contract_eligible']:
            VALIDATION['current_contract_rows'] += 1
        if r['quality_flags']:
            STATS[r['dataset_id']]['quality_flagged_rows'] += 1
        for v in r.values():
            if isinstance(v, float):
                assert math.isfinite(v), (identity, v)
        writer.writerow({k: str(v).lower() if isinstance(v, bool) else v for k, v in r.items()})
        STATS[r['dataset_id']]['rows'] += 1
        STATS[r['dataset_id']]['soh_labels'] += r['soh_percent'] is not None
        STATS[r['dataset_id']]['rul_labels'] += r['rul_cycles'] is not None
        STATS[r['dataset_id']]['current_contract_rows'] += r['current_contract_eligible']
        groups[(r['battery_uid'], r['measurement_stream'])].append(r)
    for (uid, stream), group in groups.items():
        candidates = [r for r in group if r['dense_history_valid']]
        if candidates:
            assert [r['source_cycle_index'] for r in candidates] == list(range(1,len(candidates)+1))
            caps = [r['discharge_capacity_Ah'] for r in candidates]
            if len(caps) >= 7:
                assert len(build_row(validate_history([{'cycle':i+1,'capacity':q} for i,q in enumerate(caps)]))) == 13
                assert build_row(caps[:6]+[caps[6]*2]) == build_row(caps[:7])
                VALIDATION['dense_streams_checked'] += 1
            actual = first_eol(caps)
            if actual:
                assert all(r['rul_cycles'] == 0 for r in candidates[actual-1:])
                VALIDATION['terminal_zero_rows_checked'] += len(candidates)-actual+1
        CELLS.append({'battery_uid':uid,'stream':stream,'rows':len(group),'soh_labels':sum(r['soh_percent'] is not None for r in group),
                      'rul_labels':sum(r['rul_cycles'] is not None for r in group),'current_contract_rows':sum(r['current_contract_eligible'] for r in group),
                      'existing_partition':group[0]['existing_partition'],'recommended_use':group[0]['recommended_use'],
                      'reference_status':next((r['reference_status'] for r in group if r['reference_capacity_Ah']), 'unavailable')})


def nasa_aging(writer):
    quality = json.loads((ROOT/'data/validated/nasa-20261016/battery-quality-manifest.json').read_text())
    split_manifest = json.loads((ROOT/'data/validated/nasa-20261016/split-manifest.json').read_text())
    split = split_manifest['partitions']
    assert quality['dataset_sha256'] == split_manifest['source_sha256'] == FILE_HASH['data/validated/nasa-20261016/validated_cycles.csv']
    with (ROOT/'data/validated/nasa-20261016/validated_cycles.csv').open(encoding='utf-8',newline='') as f:
        old_rows = {(r['battery_id'],int(r['cycle'])):float(r['Capacity']) for r in csv.DictReader(f)}
    seen = {}
    for path in sorted((ROOT/'data/hstu').glob('*.zip')):
        rel = path.relative_to(ROOT).as_posix()
        with zipfile.ZipFile(path) as z:
            for member in z.namelist():
                if not member.endswith('.mat'):
                    continue
                raw = z.read(member); digest = hashlib.sha256(raw).hexdigest(); cell = Path(member).stem
                assert digest == quality['source_hashes'][Path(member).name]
                audit = next(b for b in quality['batteries'] if b['battery_id'] == cell)
                MEMBERS.append({'source_file':rel,'member':member,'sha256':digest,'battery_uid':'nasa_aging_arc/'+cell})
                if cell in seen:
                    assert seen[cell] == digest
                    excluded(rel, member, 'exact_duplicate_cell_archive_member', audit['operations'])
                    continue
                seen[cell] = digest
                # Existing audited measurements are bound by the exact raw-member hash.
                rows = []
                for record in audit['records']:
                    idx = record['source_operation_id']; q = record['capacity_Ah']
                    if q is None or q <= 0:
                        excluded(rel,member,'invalid_discharge_capacity',1,[idx]); continue
                    r = base('nasa_aging_arc',cell,rel,member,digest,idx,'audited_discharge')
                    r.update(source_cycle_index=record['discharge_ordinal'],source_cycle_unit='completed_discharge_cycles',
                             capacity_check_ordinal=record['discharge_ordinal'],source_time=record['start_time'],
                             observation_kind='dense_discharge' if record['exported_for_training'] else 'unvalidated_discharge_measurement',
                             discharge_capacity_Ah=q, capacity_method='source_capacity_scalar_Ah',
                             discharge_throughput_Ah=record.get('integrated_discharge_Ah'),
                             protocol=audit['protocol_group'],discharge_cutoff_V=audit['cutoff_V'],nominal_capacity_Ah=2.0,
                             signal_count=record['samples'],duration_s=record.get('duration_s'),
                             mean_voltage_V=record.get('mean_voltage_V'),mean_discharge_current_A=abs(record['mean_current_A']) if record.get('mean_current_A') is not None else None,
                             mean_temperature_C=record.get('mean_temperature_C'),
                             existing_partition=next((name for name,ids in split.items() if cell in ids),'excluded'),
                             eligibility_reason='outside_existing_nasa_quality_prefix')
                    r['recommended_use'] = {'train':'existing_development','validation':'existing_validation','test':'previously_inspected_test','excluded':'diagnostics_only'}[r['existing_partition']]
                    flag(r,*record['validation_failures'])
                    if not record['exported_for_training']:
                        flag(r,'outside_existing_nasa_quality_prefix')
                    rows.append(r)
                accepted = [r for r in rows if r['source_cycle_index'] <= audit['exported_cycles'] and audit['eligible']]
                for r in accepted:
                    assert r['discharge_capacity_Ah'] == old_rows[(cell,r['source_cycle_index'])]
                label_stream(accepted,[True]*len(accepted),True,'existing_nasa_quality_manifest','existing_dense_label')
                excluded(rel,member,'non_discharge_operation',audit['operations']-audit['discharges'])
                emit(writer,rows)
                print('NASA aging',cell,len(rows),flush=True)


def nasa_rw(writer):
    for path in sorted((ROOT/'data/Nasa dataset').glob('*.zip')):
        rel=path.relative_to(ROOT).as_posix()
        with zipfile.ZipFile(path) as z:
            for member in z.namelist():
                if member.endswith('.Rda'):
                    excluded(rel,member,'redundant_R_representation_documented_by_source',1)
                if not member.endswith('.mat'):
                    continue
                raw=z.read(member); digest=hashlib.sha256(raw).hexdigest(); cell=Path(member).stem
                d=loadmat(io.BytesIO(raw),simplify_cells=True)['data'];steps=d['step'];rows=[];refs=[];ref_ok=[];ordinal=0;reversed_steps=set();prev=None
                MEMBERS.append({'source_file':rel,'member':member,'sha256':digest,'battery_uid':'nasa_randomized_usage/'+cell})
                # Preserve cross-step clock failures even when the affected row is a rest.
                reversal_seen=False
                for idx,s in enumerate(steps,1):
                    absolute=array(s['time'])
                    if len(absolute) and prev is not None and absolute[0] < prev:
                        reversal_seen=True
                    if len(absolute):prev=absolute[-1]
                    if s['type'] != 'D':
                        continue
                    t,v,i,temp=[array(s[k]) for k in ['relativeTime','voltage','current','temperature']]
                    stat,flags=metrics(t,v,i,temp)
                    r=base('nasa_randomized_usage',cell,rel,member,digest,idx,'operation_discharge')
                    comment=s['comment'];is_ref=comment.lower()=='reference discharge'
                    r.update(stat);r.update(source_time=str(s.get('date','')),source_cycle_unit='unavailable',
                        protocol=comment,observation_kind='reference_capacity_check' if is_ref else 'partial_or_other_discharge_step',
                        eligibility_reason='sparse_reference_history_and_unresolved_aging_cycle_axis')
                    flag(r,*flags)
                    if reversal_seen:flag(r,'history_contains_experiment_time_reversal')
                    if is_ref:
                        ordinal+=1;r['capacity_check_ordinal']=ordinal;r['measurement_stream']='reference_discharge'
                        r['capacity_method']='reference_current_integral_seconds_A_to_Ah'
                        r['discharge_cutoff_V']=3.2
                        # Loaded start-voltage screen is conservative, not proof of full-charge context.
                        valid=not flags and stat['discharge_throughput_Ah'] is not None and stat['discharge_throughput_Ah']>0
                        if valid:
                            r['discharge_capacity_Ah']=stat['discharge_throughput_Ah']
                        complete=valid and v[0]>=4.0 and v[-1]<=3.25 and np.median(i)>0
                        if not complete:flag(r,'unvalidated_reference_completeness')
                        flag(r,'reference_charge_context_requires_review')
                        refs.append(r);ref_ok.append(bool(complete and not reversal_seen))
                    else:
                        flag(r,'partial_or_nonstandard_test_not_health_capacity')
                    rows.append(r)
                label_stream(refs,ref_ok)
                conflicts=[j for j,s in enumerate(steps,1) if s['type']!='D' and s['comment'].lower()=='reference discharge']
                excluded(rel,member,'charge_or_rest_step_not_discharge_observation',sum(s['type']!='D' for s in steps)-len(conflicts))
                for j in conflicts:excluded(rel,member,'rest_or_other_type_mislabeled_reference_discharge',1,[j])
                emit(writer,rows)
                print('NASA RW',cell,len(rows),flush=True)


def xjtu(writer):
    for path in sorted((ROOT/'data/XJTU dataset').glob('Batch-*/*.mat')):
        rel=path.relative_to(ROOT).as_posix();batch=path.parent.name;cell=batch+'/'+path.stem
        d=loadmat(path,simplify_cells=True);q=array(d['summary']['discharge_capacity_Ah']);records=d['data'];rows=[];full=[];ok=[];dense=batch in ['Batch-1','Batch-2'];last_clock=None;chronology=True
        assert len(q)==len(records)==int(d['summary']['cycle_life'])
        for idx,s in enumerate(records,1):
            r=base('xjtu',cell,rel,index=idx,stream='discharge')
            t,v,i,temp,c=[array(s[k]) for k in ['relative_time_min','voltage_V','current_A','temperature_C','capacity_Ah']]
            flags=[]
            if len({len(t),len(v),len(i),len(temp),len(c)})!=1 or not all(np.isfinite(a).all() for a in [t,v,i,temp,c]):
                flags.append('invalid_cycle_signal_arrays')
            raw_clock=np.atleast_1d(s.get('system_time',[]))
            stamp=str(raw_clock[0]) if len(raw_clock) else None
            try:
                clock=datetime.strptime(stamp,'%Y-%m-%d,%H:%M:%S')
                if last_clock and clock<=last_clock:chronology=False
                last_clock=clock
            except (ValueError,TypeError):
                stamp=None
                flags.append('missing_or_invalid_source_time')
            if not chronology:flags.append('unresolved_cycle_chronology')
            desc=s['description'];is_full=dense or batch=='Batch-3' or '[test capacity]' in desc
            positions=np.flatnonzero(i<-.1);throughput=None;start_v=end_v=None
            if len(positions)>1 and not flags:
                cuts=np.flatnonzero((np.diff(positions)>1) | (np.diff(t[positions])<=0))+1
                segments=np.split(positions,cuts)
                throughput=sum(float(np.trapezoid(-i[seg],t[seg])*60/3600) for seg in segments if len(seg)>1)
                start_v=float(v[positions[0]]);end_v=float(v[positions[-1]])
            qval=scalar(q[idx-1]);valid=bool(is_full and qval and qval>0 and throughput and not flags and start_v>=4.0 and end_v<=2.65
                and abs(qval-throughput)<=max(.03,.05*qval))
            if is_full and not valid:flags.append('unvalidated_full_discharge_capacity')
            r.update(source_cycle_index=idx,source_cycle_unit='completed_discharge_cycles' if dense or batch=='Batch-3' else 'mixed_experimental_cycles',source_time=stamp,
                observation_kind='dense_discharge' if dense else 'full_discharge_check' if is_full else 'partial_discharge_cycle',
                measurement_stream='full_discharge' if is_full else 'partial_discharge',
                discharge_capacity_Ah=qval if is_full and qval and qval>0 else None,
                discharge_throughput_Ah=throughput,capacity_method='source_summary_discharge_capacity_Ah' if is_full else None,
                protocol=batch+': '+desc,chemistry='NCM523_LiNi0.5Co0.2Mn0.3O2',nominal_capacity_Ah=2.0,
                discharge_cutoff_V=2.5 if is_full else 3.0 if batch in ['Batch-4','Batch-5'] else None,
                signal_count=len(t),duration_s=None,mean_voltage_V=finite_mean(v[positions]),
                mean_discharge_current_A=finite_mean(-i[positions]),mean_temperature_C=finite_mean(temp[positions]),
                eligibility_reason='candidate_dense_history' if dense else 'rate_confounded_discharge' if batch=='Batch-3' else 'mixed_partial_cycles_and_sparse_capacity_checks')
            # relative_time resets are legitimate stage boundaries; no whole-cycle duration guessed.
            flag(r,*flags,'source_stitched_experiment_chronology_requires_review')
            if batch=='Batch-3':flag(r,'variable_discharge_rate_confounds_capacity')
            if not is_full:flag(r,'partial_throughput_not_health_capacity')
            if is_full:
                r['capacity_check_ordinal']=len(full)+1;full.append(r);ok.append(valid)
            rows.append(r)
        label_stream(full,ok,dense,soh_status='candidate_dense_label' if dense else 'candidate_rate_confounded_label' if batch=='Batch-3' else 'candidate_sparse_label')
        if batch=='Batch-3':
            for r in rows:r['rul_status']='rate_confounded_unreviewed'
        if batch=='Batch-5':
            for r in rows:flag(r,'initial_full_reference_not_at_original_cycle_1')
        emit(writer,rows)
        print('XJTU',cell,len(rows),flush=True)


def oxford(writer):
    path='data/oxford/Oxford_Battery_Degradation_Dataset_1.mat'
    data=loadmat(ROOT/path,simplify_cells=True)
    for cell,records in data.items():
        if cell.startswith('__'):continue
        rows=[]
        for stream,cutoff in [('C1dc',2.7),('OCVdc',2.7)]:
            checks=[];valid=[]
            for ordinal,(key,record) in enumerate(sorted(records.items()),1):
                if stream not in record:
                    excluded(path,'','missing_'+stream,1,[key]);continue
                s=record[stream];t,v,q,temp=[array(s[k]) for k in ['t','v','q','T']]
                stat,flags=metrics(t,v,np.zeros(len(t)),temp,scale=86400)
                if len(q)!=len(t) or not np.isfinite(q).all() or (np.diff(q)>1e-9).any():flags.append('invalid_signed_charge_counter')
                capacity=float(-(q[-1]-q[0])/1000) if len(q)>1 and np.isfinite(q).all() else None
                good=not flags and capacity and capacity>0 and v[0]>=4.0 and v[-1]<=2.85
                r=base('oxford_degradation',cell,path,index=ordinal,stream=stream)
                stat.update(mean_discharge_current_A=(capacity/(stat['duration_s']/3600)) if capacity and stat['duration_s'] else None,
                            discharge_throughput_Ah=capacity if capacity and capacity>0 else None)
                r.update(stat);r.update(source_cycle_index=int(key[3:]),source_cycle_unit='drive_cycles',capacity_check_ordinal=ordinal,
                    source_time='MATLAB_datenum:'+format(float(t[0]),'.17g') if len(t) else None,observation_kind='sparse_characterization_discharge',
                    discharge_capacity_Ah=capacity if capacity and capacity>0 else None,capacity_method='negative_signed_mAh_counter_delta_div_1000',
                    protocol=stream+': Urban Artemis aging / 40 C chamber',ambient_temperature_C=40.0,nominal_capacity_Ah=.740,
                    discharge_cutoff_V=cutoff,eligibility_reason='sparse_100_drive_cycle_checks_not_consecutive_completed_discharges')
                flag(r,*flags,'source_characterization_time_interpreted_as_matlab_serial_days')
                checks.append(r);valid.append(bool(good))
            label_stream(checks,valid)
            rows.extend(checks)
        excluded(path,'','charge_characterization_not_discharge_observation',2*len(records))
        emit(writer,rows);print('Oxford',cell,len(rows),flush=True)
    path='data/oxford/ExampleDC_C1.mat'
    d=loadmat(ROOT/path,simplify_cells=True)['ExampleDC_C1']['dc'];t,v,i,temp,q=[array(d[k]) for k in ['t','v','i','T','q']]
    stat,flags=metrics(t,v,i/1000,temp,sign=-1)
    r=base('oxford_example',None,path,index=1,stream='example_drive_discharge')
    r.update(stat);r.update(observation_kind='unidentified_example_profile',source_cycle_unit='unavailable',
        source_time='source_seconds:'+str(t[0]),protocol='single example drive-cycle discharge',
        eligibility_reason='no_verified_cell_identity_or_full_lifetime_history',recommended_use='diagnostics_only')
    flag(r,*flags,'no_verified_cell_identity','partial_example_not_health_capacity')
    emit(writer,[r]);excluded(path,'','example_charge_not_discharge_observation',1)


def resume_non_oxford(writer, stage):
    """Reuse this run's validated intermediates; fresh reproduction needs no cache."""
    ints={'source_record_index','source_cycle_index','capacity_check_ordinal','reference_source_record_index',
          'first_observed_eol_source_cycle','first_observed_eol_source_record','rul_cycles','signal_count'}
    floats={'discharge_capacity_Ah','discharge_throughput_Ah','reference_capacity_Ah','soh_percent','eol_threshold_percent',
            'nominal_capacity_Ah','ambient_temperature_C','discharge_cutoff_V','duration_s','mean_voltage_V','mean_discharge_current_A','mean_temperature_C'}
    bools={'is_censored','dense_history_valid','current_contract_eligible'}
    group=[];uid=None;count=Counter();source_map={}
    with stage.open(encoding='utf-8',newline='') as f:
        reader=csv.DictReader(f)
        assert reader.fieldnames==list(COLS)
        for raw in reader:
            if raw['dataset_id'].startswith('oxford'):continue
            assert raw['source_file_sha256']==FILE_HASH[raw['source_file']]
            r={k:(None if v=='' else int(v) if k in ints else float(v) if k in floats else v=='true' if k in bools else v) for k,v in raw.items()}
            r['quality_flags']=raw['quality_flags']
            r['observation_id']=raw['observation_id'].replace(r['dataset_id']+':',r['dataset_id']+':'+r['native_battery_id']+':',1)
            if r['dataset_id']=='xjtu' and r['native_battery_id'].startswith('Batch-3/'):
                r['source_cycle_unit']='completed_discharge_cycles';r['rul_status']='rate_confounded_unreviewed'
            if group and uid!=r['battery_uid']:emit(writer,group);group=[]
            uid=r['battery_uid'];group.append(r);count[r['dataset_id']]+=1
            source_map[(r['dataset_id'],r['native_battery_id'])]=(r['source_file'],r['source_member'])
        if group:emit(writer,group)
    assert dict(count)=={'nasa_aging_arc':2750,'nasa_randomized_usage':423810,'xjtu':13206}
    quality=json.loads((ROOT/'data/validated/nasa-20261016/battery-quality-manifest.json').read_text())
    # Reconstruct exclusion controls from hash-bound original metadata / prior raw scan.
    raw_scan=ROOT/'.cache/dataset-suitability/rw.json'
    inventory=json.loads((ROOT/'.cache/dataset-suitability/inventory.json').read_text())
    assert all(FILE_HASH[s['path']]==s['sha256'] for s in inventory)
    seen=set()
    for directory in ['hstu','Nasa dataset']:
        for p in sorted((ROOT/'data'/directory).glob('*.zip')):
            rel=p.relative_to(ROOT).as_posix()
            with zipfile.ZipFile(p) as z:
                for member in z.namelist():
                    if member.endswith('.Rda'):excluded(rel,member,'redundant_R_representation_documented_by_source',1)
                    if not member.endswith('.mat'):continue
                    digest=hashlib.sha256(z.read(member)).hexdigest();cell=Path(member).stem
                    dataset='nasa_aging_arc' if directory=='hstu' else 'nasa_randomized_usage'
                    MEMBERS.append({'source_file':rel,'member':member,'sha256':digest,'battery_uid':dataset+'/'+cell})
                    if directory=='hstu':
                        a=next(x for x in quality['batteries'] if x['battery_id']==cell)
                        assert digest==a['source_sha256']
                        if cell in seen:
                            excluded(rel,member,'exact_duplicate_cell_archive_member',a['operations']);continue
                        seen.add(cell)
                        excluded(rel,member,'non_discharge_operation',a['operations']-a['discharges'])
                        for r in a['records']:
                            if r['capacity_Ah'] is None or r['capacity_Ah']<=0:
                                excluded(rel,member,'invalid_discharge_capacity',1,[r['source_operation_id']])
                    else:
                        scan=next(x for x in json.loads(raw_scan.read_text()) if x['battery']==cell)
                        assert (scan['member'],scan['archive'])==(member,p.name)
                        assert sum(1 for g in CELLS if g['battery_uid']==dataset+'/'+cell)>=1
                        conflicts=[r['source_step'] for r in scan['reference_discharges'] if not r['valid_integral']]
                        # Direct source verification: these three markers are R/rest with zero current, not D tests.
                        assert conflicts=={'RW17':[3383],'RW18':[3150],'RW19':[3374]}.get(cell,[])
                        excluded(rel,member,'charge_or_rest_step_not_discharge_observation',scan['steps']-scan['types']['D']-len(conflicts))
                        for j in conflicts:excluded(rel,member,'rest_or_other_type_mislabeled_reference_discharge',1,[j])
    return {'staged_csv_sha256':sha(stage),'reused_rows':sum(count.values()),'row_counts':dict(count),
            'prior_read_only_raw_scan_sha256':sha(raw_scan),
            'scope':'Reused only this task staging NASA/XJTU rows, validated on emit and source hashes; Oxford parsed afresh. Fresh no-argument reproduction uses original files only.'}


def main():
    global FILE_HASH
    assert not any((FINAL/n).exists() for n in NAMES), 'Refusing to overwrite any existing deliverable'
    sources=[]
    for directory in ['hstu','Nasa dataset','XJTU dataset','oxford','validated']:
        for path in sorted((ROOT/'data'/directory).rglob('*')):
            if path.is_file():sources.append({'path':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':sha(path)})
    FILE_HASH={s['path']:s['sha256'] for s in sources}
    OUT.mkdir(exist_ok=False)
    csv_path=OUT/NAMES[0]
    with csv_path.open('x',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(COLS));writer.writeheader()
        if len(sys.argv)>1:
            assert len(sys.argv)==3 and sys.argv[1]=='--resume-reviewed-stage'
            resume=resume_non_oxford(writer,Path(sys.argv[2]).resolve())
        else:
            nasa_aging(writer);nasa_rw(writer);xjtu(writer);resume=None
        oxford(writer)
    unchanged=all(sha(ROOT/s['path'])==s['sha256'] for s in sources)
    assert unchanged
    # Independent CSV decoding/finite/identity/row-count check after serialization.
    parsed=0;ids=set()
    with csv_path.open(encoding='utf-8',newline='') as f:
        reader=csv.DictReader(f);assert reader.fieldnames==list(COLS)
        for r in reader:
            assert len(r)==len(COLS) and None not in r
            assert r['observation_id'] not in ids;ids.add(r['observation_id']);parsed+=1
            for k in ['discharge_capacity_Ah','soh_percent','rul_cycles','discharge_throughput_Ah','reference_capacity_Ah']:
                if r[k]:assert math.isfinite(float(r[k]))
            if r['is_censored']=='true':assert r['rul_cycles']==''
            if r['rul_cycles']:assert r['source_cycle_unit']=='completed_discharge_cycles'
    assert parsed==sum(s['rows'] for s in STATS.values())
    code=Path(__file__).read_text(encoding='utf-8')
    manifest={
        'schema_version':'voltsense-unified-observations-v1','created_utc':datetime.now(timezone.utc).isoformat(),
        'purpose':'Future research observation catalogue, NOT an approved pooled training table, model artifact, or frontend demo upload',
        'model_training_performed':False,'serving_approval_granted':False,'eol_threshold_percent':80,
        'files':{'csv':{'path':'data/processed/'+NAMES[0],'sha256':sha(csv_path),'bytes':csv_path.stat().st_size,'rows':parsed}},
        'source_files':sources,'archive_mat_members':MEMBERS,
        'validated_intermediate_reuse':resume,
        'columns':COLS,'dataset_statistics':{k:dict(v) for k,v in STATS.items()},'cell_stream_statistics':CELLS,
        'excluded_records':[{'source_file':k[0],'source_member':k[1] or None,'reason':k[2],**v} for k,v in EXCLUSIONS.items()],
        'excluded_records_note':'Counts are source-record counts for operation exclusions; redundant R representations are files, not additional cells. Examples capped at 10; source index reconstruction is deterministic in embedded generator.',
        'label_rules':{
            'soh':'min(100,100*Q/Q_first_full_same_stream); never nominal/max/later replacement',
            'reference_failure':'No reference/labels if first full check fails; no search for a later healthy reference',
            'dense_rul':'max(0,E-t) only on uninterrupted full-discharge histories with observed 80 percent crossing',
            'censoring':'No crossing in validated prefix => RUL blank; terminal zero only for an observed dense crossing',
            'sparse':'SOH candidates retained per protocol; RUL blank, source EOL detection indices separate; no checkpoint-to-aging-cycle substitution',
            'gaps':'First failed full check closes contiguous EOL/dense prefix; later independent SOH candidates can exist but cannot bridge missing history',
            'partial':'Throughput may be retained; discharge_capacity_Ah, SOH and RUL are blank for partial operations',
            'nasa':'Exact member hashes bind previous battery-quality decisions. Only prior exported prefix gets labels; no exclusions reversed.',
            'xjtu':'Batches 1/2 are candidate dense labels after array/end-voltage/integral/clock checks. Batch3 rate-confounded; Batches4-6 sparse/mixed.',
            'rw':'Exact reference discharge comments, positive-discharge current integral in seconds; screened completeness and charge-context caveat; no RUL cycle mapping',
            'oxford':'Separate C1dc/OCVdc streams; signed mAh counter delta /1000; main t serial days, example t seconds',
            'new_data_status':'Candidate/screened labels are not a production approval or proof of source chronology/licensing',
        },
        'feature_contract':FEATURE_CONTRACT,
        'feature_source_sha256':sha(ROOT/'ml-service/features.py'),
        'leakage_prevention':{'existing_nasa_split_preserved':True,'new_cells_assigned_to_train_validation_test':False,
            'new_cell_recommendation':'Reserve for external validation until a versioned battery-level plan is approved',
            'grouping':'battery_uid across ALL streams and derived representations; unknown example never train',
            'no_interpolation_or_imputation':True,'no_row_random_split':True,
            'never_features':['rul_cycles','soh_percent','first_observed_eol_source_cycle','first_observed_eol_source_record','is_censored','eol_observation_status','contemporaneous signals or capacity at target t'],
            'usage':'Build only existing 13 features from complete prior capacity prefixes; metadata/labels are not predictor columns'},
        'validation':{'passed':True,'csv_decoded_rows':parsed,'unique_observation_ids':len(ids),'source_files_unchanged':unchanged,
            'finite_numeric_labels':True,'positive_capacity_values':True,'censored_rul_blank':True,'dense_rul_units_verified':True,
            'current_capacity_excluded_feature_probe':True,**dict(VALIDATION)},
        'limitations':['Not an EV-pack dataset or evaluation','Sparse/partial protocols cannot use current dense ML contract',
            'XJTU stitched chronology and protocol/reference-rate differences need review','RW full-charge context and steps-to-aging-cycle mapping unresolved',
            'Oxford cathode subtype/time discrepancy; no dense intervening observations','Ambient MATLAB MCOS datetime unresolved; no ambient vectors joined',
            'NASA/XJTU explicit dataset licenses not established locally; Oxford supplied README declares ODbL/DbCL',
            'Known legacy split already inspected; new quality-inspected cells have not been scored by a model in this workflow'],
        'reproduction':{'run_from':'repository root','python':platform.python_version(),
            'versions':{n:importlib.metadata.version(n) for n in ['numpy','scipy']},
            'generator_sha256':hashlib.sha256(code.encode()).hexdigest(),'generator_source':code,
            'instructions':'Restore generator_source verbatim to .cache/reproduce_unified.py; run python -B .cache/reproduce_unified.py from repository root only in a COPY where all three output paths are absent. Originals are never overwritten.'}}
    # Explicit exclusions of non-cell/double-counted evidence.
    manifest['excluded_non_observation_sources']=[
        {'source':'data/validated/nasa-20261016/validated_cycles.csv','reason':'Derivative of NASA aging cells, not appended a second time; used through bound quality manifest'},
        {'source':'data/XJTU dataset/Temperature_Compensation_Data.mat','reason':'6 stationary ambient streams, opaque datetime alignment; not aging cells, not joined'},
        {'source':'README/PDF/MATLAB scripts','reason':'Provenance/protocol documents; not observation records; MATLAB interpolation examples not executed'}]
    readme=README.replace('{ROW_COUNT}',str(parsed)).replace('{CSV_SHA}',manifest['files']['csv']['sha256'])
    readme += '\n## Complete data dictionary\n\n| Column | Definition / units |\n|---|---|\n'
    readme += ''.join('| `'+k+'` | '+v.replace('|','\\|')+' |\n' for k,v in COLS.items())
    (OUT/NAMES[2]).write_text(readme,encoding='utf-8')
    manifest['files']['readme']={'path':'data/processed/'+NAMES[2],'sha256':sha(OUT/NAMES[2])}
    (OUT/NAMES[1]).write_text(json.dumps(manifest,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    FINAL.mkdir(exist_ok=True)
    for name in NAMES:
        with (OUT/name).open('rb') as src, (FINAL/name).open('xb') as dst:
            shutil.copyfileobj(src,dst)
        assert sha(FINAL/name) == sha(OUT/name)
    print(json.dumps({'rows':parsed,'datasets':manifest['dataset_statistics'],'validation':manifest['validation']},indent=2),flush=True)


README = '''# VoltSense unified battery discharge observations

This master CSV contains **{ROW_COUNT} discharge observations** from four supplied corpora. It is a research catalogue, **not a ready-to-fit pooled training matrix, model approval, or frontend upload file**. No model was trained. Raw files, original artifacts, existing public/API/database contracts and deployment gates are unchanged.

CSV SHA-256: `{CSV_SHA}`. UTF-8, comma-separated, RFC-compatible quoting; empty cells mean unavailable/not applicable, never zero. Numeric capacities are Ah; booleans are `true`/`false`.

## Scope and identity

- `nasa_aging_arc`: unique B-cells from `data/hstu` (this is NASA, not verified HUST). Exact duplicate archive copies suppressed. Positive supplied discharge-capacity observations retained, even when not accepted for training; previous quality-prefix labels preserved.
- `nasa_randomized_usage`: all D-type step observations from 28 RW cells, including partial/pulsed/other steps as diagnostics. Only exact reference-discharge tests can carry candidate full capacity/SOH; partial throughput is never health capacity. Most rows therefore have no targets.
- `xjtu`: all 27 supplied cell cycle records. Full/partial cycles explicitly distinguished. Batches1/2 are dense candidates, Batch3 is rate-confounded, Batches4–6 have sparse full tests/mixed partial cycles.
- `oxford_degradation`: both C1dc and OCVdc characterizations, separate protocols but the SAME eight physical grouping IDs. These are sparse drive-cycle checks, not dense aging cycles.
- `oxford_example`: one dc example with no verified physical-cell assignment; diagnostics only, not another independent battery.
- Charge/rest/impedance-only records are excluded from this discharge-level table and counted in the manifest. Raw sample waveforms are not flattened; sample count, aggregate signals and exact source pointers support later inspection. Ambient compensation channels and redundant R/derived CSV representations are not independent observations.

## Column definitions

The manifest's `columns` dictionary is the exhaustive definition of every CSV column. Main groups:

| Group | Columns / meaning |
|---|---|
| Identity | observation_id; dataset_id; battery_uid; native_battery_id; measurement_stream; observation_kind |
| Provenance | source_file/member plus both SHA256 values; original source_record_index; source_cycle_index/unit; capacity_check_ordinal |
| Time | source_time; source_timezone=unknown; no fabricated UTC conversion. Oxford main t uses serial days; example seconds; XJTU stage minutes are converted only within segments |
| Capacity | discharge_capacity_Ah (full-test/source capacity); discharge_throughput_Ah (may be PARTIAL); capacity_method; reference_capacity_Ah and reference source/status |
| Labels | soh_percent/status; eol_threshold_percent=80; eol_observation_status; first_observed_eol_source_cycle/record; rul_cycles/status; is_censored |
| Eligibility/use | dense_history_valid; current_contract_eligible; eligibility_reason; existing_partition; recommended_use; quality_flags |
| Protocol/signals | protocol; chemistry; nominal_capacity_Ah; ambient_temperature_C; discharge_cutoff_V; signal_count; duration_s; mean_voltage_V; mean_discharge_current_A; mean_temperature_C |

Time units: duration seconds; voltage V; mean current discharge-positive A; temperatures C. The original time string/index and documented sign mapping remain traceable to source. Blank duration for XJTU is intentional: relative time resets between stages, so a whole-record span is not guessed. Ambient settings and cell temperatures stay separate; unsupported MCOS-clock ambient records were not joined.

`source_cycle_unit` is essential. NASA and XJTU Batches1–3 count completed discharges, but Batch3 is rate-confounded and ineligible for the current model despite that unit. Other XJTU records mix partial experiments; Oxford keys count drive cycles starting at baseline0; RW steps have no validated aging-cycle axis. `capacity_check_ordinal` is an observation index, never a replacement cycle count.

## Labels and quality

SOH = min(100,100*Q/Q_first_full_same_stream). Raw capacities are never capped, imputed or overwritten. No nominal/max/later favorable reference replaces a bad initial full reference. Sparse references (including XJTU Batch5's first full test at original record21) retain their actual location and cannot become dense cycle1.

`rul_cycles` is populated ONLY for compatible dense histories with an observed first80% crossing: max(0,E-t). No crossing means empty RUL, not zero. At/after an observed crossing RUL is zero, including recovery. Sparse detection indices remain descriptive in source units; no sparse check-count or interpolated physical crossing is passed off as cycle-based RUL.

The first failed full test closes the contiguous EOL/dense prefix. Later independent SOH candidates can still exist, but they cannot bridge an unresolved history gap. Existing NASA labels apply only to previously exported quality prefixes; invalid/other NASA observations remain diagnostics. New screened labels are candidates needing review, not a new approved scientific release. Review quality_flags and reference/soh_status, not just nonempty numbers. In particular RW references still require charge-context review and XJTU protocols contain reference-rate/stitching caveats.

Additional source-quality findings: three RW rows have comment=reference discharge but type=R and zero current (RW17 source3383, RW18 source3150, RW19 source3374). They are excluded as mislabeled rest markers, not converted into zero-capacity tests. There are947 actual D-type reference checks. Some RW temperature values are finite but physically implausible (sensor-like values around -4099 C). Their raw diagnostic means remain traceable and are flagged `implausible_temperature_C_retained_raw` when outside -50..100 C; this is a diagnostic screen, not a revised model acceptance gate. Do not use them as valid thermal features. Capacity-based candidate SOH does not consume temperature. Missing XJTU source timestamps remain blank and flagged; no timestamp is invented.

## Safe future training/evaluation

1. Do NOT fit directly on this file or call dropna then renumber. Select ONE dataset/protocol/stream with compatible dense full-discharge semantics and reviewed quality. Keep all original history rows 1..t; current_contract_eligible marks target-row eligibility after seven cycles, not rows to remove before feature generation. Never treat partial throughput as complete capacity.
2. For classic NASA, preserve existing train/validation/test identities and the original quality prefix. New rows outside that prefix are not a reason to undo previous exclusions. The prior test has already been inspected.
3. New cells remain `existing_partition=unassigned`. `recommended_use=external_validation_candidate` is advisory: do not silently put them in training. In particular reserve the13 fixed-protocol XJTU cells prospectively unless a different battery-level plan is explicitly agreed. There are only four observed event cells there, insufficient for standalone RUL train+validation+three-event test partitions.
4. Group splits by battery_uid across ALL streams, windows, representations and derived data. Exclude unidentified_example from modeling. Freeze hashes/IDs with seed42 before fitting; never random-split rows, checkpoints or pulses.
5. Create feature rows using unchanged ml-service/features.py from capacities STRICTLY BEFORE target t. The current capacity is a label/observation, not a same-target feature. Never feed SOH/RUL/EOL/censor flags, whole-life/source-length information or contemporaneous summary signals to the estimator. Fit preprocessing on train batteries only; select on validation, evaluate held-out once with baselines and per-battery counts.
6. To use the current NASA metadata loader, explicitly export ONLY a reviewed dense cell history to battery_id,test_id,type=discharge,Capacity,cycle, retaining source pointers and without closing gaps. This master intentionally lacks that deceptively generic loader shape; MAT/ZIP/master CSV is not a web demo upload contract.
7. Sparse RW/Oxford/XJTU checks need a separately reviewed feature/target/cycle-unit design. Do not change existing targets, gates or validators to make them fit. Candidate artifacts and inference remain unapproved until every existing gate and explicit approval passes.

No source here demonstrates EV-pack performance. Chemistry/protocol differences remain: XJTU NCM523/2Ah room-temperature cells versus Oxford740mAh pouch/40C and NASA protocols with incompletely specified chemistry. Current features have raw-Ah terms; percentage SOH alone does not erase domain shift.

## Manifest and reproducibility

The JSON records all59 source-file hashes, original NASA archive member hashes, grouped exclusions with counts/examples, per-cell/stream counts, label definitions, validation and exact generator source with its hash. Counts of redundant representations are files, not extra battery records. All source-file hashes are checked again after generation. No archives are extracted over raw data.

Use the existing Python NumPy/SciPy environment. To reproduce in a COPY of the repository, restore manifest.reproduction.generator_source to `.cache/reproduce_unified.py`, verify its SHA256 against generator_sha256, and run `python -B .cache/reproduce_unified.py` from that copy's repository root. ALL THREE output paths must be absent: the generator refuses overwrites. Source hashes/source-code contracts must match; do not delete or overwrite the supplied outputs to experiment. Generation timestamps differ but deterministic CSV bytes should match under recorded packages and unchanged inputs. The manifest embeds the generator so reproduction does not depend on retaining ignored scratch scripts.

See `docs/battery-dataset-suitability-report.md` for source/PDF inspection, missing release files, sparse-EOL uncertainty and local licensing findings. Oxford's supplied README declares ODbL/DbCL; NASA/XJTU explicit licenses were not established locally. Confirm permissions before redistribution. Raw Rda duplicates and ambient MCOS datetime were not independently decoded/aligned. No interpolation or future-filled MATLAB example features were used.
'''

if __name__ == '__main__':
    main()
