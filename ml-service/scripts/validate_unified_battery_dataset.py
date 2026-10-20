"""Independent read-back checks on the three unified deliverables."""
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

root=Path.cwd()
p=root/'data/processed'
m=json.loads((p/'voltsense_unified_dataset_manifest.json').read_text(encoding='utf-8'))
digest=lambda f: hashlib.file_digest(Path(f).open('rb'),'sha256').hexdigest()
assert digest(root/m['files']['csv']['path'])==m['files']['csv']['sha256']
assert digest(root/m['files']['readme']['path'])==m['files']['readme']['sha256']
assert hashlib.sha256(m['reproduction']['generator_source'].encode()).hexdigest()==m['reproduction']['generator_sha256']
source={s['path']:s['sha256'] for s in m['source_files']}
assert all(digest(root/path)==sha for path,sha in source.items())
split=json.loads((root/'data/validated/nasa-20261016/split-manifest.json').read_text())['partitions']
by_id={b:part for part,ids in split.items() for b in ids}
counts=Counter();kinds=Counter();uids=set();ids=set();dense=defaultdict(list);labelled=Counter();blanks=Counter();temperature_flags=0
with (p/'voltsense_unified_battery_dataset.csv').open(encoding='utf-8',newline='') as f:
    reader=csv.DictReader(f)
    assert reader.fieldnames==list(m['columns'])
    for r in reader:
        assert r['observation_id'] not in ids;ids.add(r['observation_id'])
        counts[r['dataset_id']]+=1;kinds[r['observation_kind']]+=1
        assert r['source_file_sha256']==source[r['source_file']]
        if r['battery_uid']:uids.add(r['battery_uid'])
        if r['dataset_id']=='nasa_aging_arc':
            assert r['existing_partition']==by_id.get(r['native_battery_id'],'excluded')
        else:assert r['existing_partition']=='unassigned'
        cap=r['discharge_capacity_Ah'];ref=r['reference_capacity_Ah'];soh=r['soh_percent'];rul=r['rul_cycles']
        if cap:assert math.isfinite(float(cap)) and float(cap)>0
        if soh:
            assert cap and ref
            assert abs(float(soh)-min(100,100*float(cap)/float(ref)))<1e-10
            labelled['soh']+=1
        if r['observation_kind'] in ['partial_discharge_cycle','partial_or_other_discharge_step','unidentified_example_profile']:
            assert not cap and not soh and not rul
        if r['is_censored']=='true':assert not rul
        bad_temp=bool(r['mean_temperature_C'] and not -50<=float(r['mean_temperature_C'])<=100)
        assert bad_temp==('implausible_temperature_C_retained_raw' in r['quality_flags'])
        temperature_flags+=bad_temp
        if rul:
            assert r['source_cycle_unit']=='completed_discharge_cycles' and r['dense_history_valid']=='true'
            expected=max(0,int(r['first_observed_eol_source_cycle'])-int(r['source_cycle_index']))
            assert int(rul)==expected
            labelled['rul']+=1
        if r['dense_history_valid']=='true':
            dense[r['battery_uid']].append(r)
        if not soh:blanks['soh']+=1
        if not rul:blanks['rul']+=1
expected={'nasa_aging_arc':2750,'nasa_randomized_usage':423810,'xjtu':13206,'oxford_degradation':1038,'oxford_example':1}
assert dict(counts)==expected,(counts,expected)
assert len(ids)==440805 and len(uids)==97
for uid,rows in dense.items():
    assert [int(r['source_cycle_index']) for r in rows]==list(range(1,len(rows)+1))
    q=[float(r['discharge_capacity_Ah']) for r in rows]
    event=next((i for i,v in enumerate(q,1) if min(100,100*v/q[0])<=80),None)
    for i,r in enumerate(rows,1):
        if event:assert int(r['rul_cycles'])==max(0,event-i)
        else:assert r['is_censored']=='true' and r['rul_cycles']==''
        assert (r['current_contract_eligible']=='true')==(i>=7)
assert dict(counts)=={k:v['rows'] for k,v in m['dataset_statistics'].items()}
assert len(ids)==m['validation']['unique_observation_ids']==m['files']['csv']['rows']
assert labelled['soh']==m['validation']['soh_label_rows']
assert labelled['rul']==m['validation']['rul_label_rows']
assert temperature_flags==12382==m['validation']['implausible_temperature_rows_flagged']
original=root/'.cache/unified-before-diagnostic-annotation.csv'
if original.exists():
    with original.open(encoding='utf-8',newline='') as a,(p/'voltsense_unified_battery_dataset.csv').open(encoding='utf-8',newline='') as b:
        differences=0;checked=0
        for before,after in zip(csv.DictReader(a),csv.DictReader(b),strict=True):
            assert all(before[k]==after[k] for k in before if k!='quality_flags')
            differences+=before['quality_flags']!=after['quality_flags'];checked+=1
        assert checked==440805 and differences==12382
print(json.dumps({'passed':True,'rows':len(ids),'known_cells':len(uids),'datasets':counts,'observation_kinds':kinds,
                  'labels':labelled,'blank_labels':blanks,'dense_cells':len(dense),'all_source_hashes_unchanged':True,
                  'temperature_flags_verified':temperature_flags,'post_annotation_measurements_labels_and_ids_unchanged':True},indent=2))
