"""Post-build diagnostic annotation; never changes source values or scientific labels."""
import csv
import hashlib
import importlib.util
import json
from collections import Counter,defaultdict
from pathlib import Path

root=Path.cwd();out=root/'data/processed';mp=out/'voltsense_unified_dataset_manifest.json'
m=json.loads(mp.read_text(encoding='utf-8'));csvp=out/'voltsense_unified_battery_dataset.csv'
sha=lambda p:hashlib.file_digest(Path(p).open('rb'),'sha256').hexdigest()
assert sha(csvp)==m['files']['csv']['sha256']
old_csv_hash=sha(csvp); old_generator=m['reproduction']['generator_sha256']
temp=root/'.cache/unified-annotated-final.csv'
counts=Counter();flag_counts=defaultdict(Counter);by_source=Counter();time_missing=Counter()
with csvp.open(encoding='utf-8',newline='') as src,temp.open('x',encoding='utf-8',newline='') as dst:
    reader=csv.DictReader(src);writer=csv.DictWriter(dst,fieldnames=reader.fieldnames);writer.writeheader()
    for r in reader:
        if r['mean_temperature_C'] and not -50<=float(r['mean_temperature_C'])<=100:
            flags=set(filter(None,r['quality_flags'].split('|')));flags.add('implausible_temperature_C_retained_raw')
            r['quality_flags']='|'.join(sorted(flags));counts['implausible_temperature_rows_flagged']+=1
        flag_counts[r['dataset_id']].update(filter(None,r['quality_flags'].split('|')))
        if 'missing_or_invalid_source_time' in r['quality_flags']:time_missing[r['dataset_id']]+=1
        by_source[r['source_file']]+=1
        writer.writerow(r)
assert counts['implausible_temperature_rows_flagged']==12382
# The only CSV mutation is an explicit diagnostic flag; existing complete original remains staged.
old=root/'.cache/unified-before-diagnostic-annotation.csv'
assert not old.exists();csvp.rename(old);temp.rename(csvp)
conflicts={'RW17':3383,'RW18':3150,'RW19':3374}
audit=json.loads((root/'.cache/dataset-suitability/rw.json').read_text())
for cell,index in conflicts.items():
    a=next(x for x in audit if x['battery']==cell)
    path='data/Nasa dataset/'+a['archive']
    record=next(e for e in m['excluded_records'] if e['source_file']==path and e['source_member']==a['member'] and e['reason']=='charge_or_rest_step_not_discharge_observation')
    record['count']-=1
    m['excluded_records'].append({'source_file':path,'source_member':a['member'],
        'reason':'rest_or_other_type_mislabeled_reference_discharge','count':1,'example_source_records':[index]})
spec=importlib.util.spec_from_file_location('builder',root/'.cache/build_unified_battery_dataset.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
code=(root/'.cache/build_unified_battery_dataset.py').read_text(encoding='utf-8')
m['columns']=b.COLS
m['reproduction'].update(generator_source=code,generator_sha256=hashlib.sha256(code.encode()).hexdigest(),
    originally_executed_builder_sha256=old_generator,
    post_build_normalization='Diagnostic temperature flags and precise exclusion/documentation details added; reproducible generator contains the same rule; measurements and SOH/RUL labels unchanged.')
m['files']['csv'].update(sha256=sha(csvp),bytes=csvp.stat().st_size)
m['validation'].update(dict(counts));m['validation']['missing_source_time_rows']=dict(time_missing)
m['quality_flag_counts']={k:dict(v) for k,v in flag_counts.items()}
m['included_records_by_source_file']=dict(by_source)
m['quality_rules']={'temperature_diagnostic_range_C':[-50,100],
    'temperature_outliers':'Keep raw value, flag unusable thermal diagnostic; no imputation, no changed model acceptance threshold; RW not dense-eligible.',
    'mislabeled_reference_markers':'Three R/rest records with zero current are excluded explicitly; never zero-capacity discharge labels.',
    'source_timestamps':'Missing XJTU clock stays blank/flagged; unresolved full tests close contiguous outcome prefix.'}
m['post_build_validation_provenance']={'csv_sha256_before_diagnostic_annotation':old_csv_hash,
    'scientific_measurements_and_labels_changed':False,'observation_ids_and_counts_changed':False}
readme=b.README.replace('{ROW_COUNT}',str(m['files']['csv']['rows'])).replace('{CSV_SHA}',m['files']['csv']['sha256'])
readme+='\n## Complete data dictionary\n\n| Column | Definition / units |\n|---|---|\n'
readme+=''.join('| `'+k+'` | '+v.replace('|','\\|')+' |\n' for k,v in b.COLS.items())
(out/'voltsense_unified_dataset_README.md').write_text(readme,encoding='utf-8')
m['files']['readme']['sha256']=sha(out/'voltsense_unified_dataset_README.md')
mp.write_text(json.dumps(m,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(json.dumps({'annotated_temperature_rows':dict(counts),'missing_source_time_rows':dict(time_missing),
                  'mislabeled_rest_markers':conflicts,'final_csv_sha256':sha(csvp)},indent=2))
