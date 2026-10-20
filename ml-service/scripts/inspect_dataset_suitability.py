"""Read-only source inspection. Outputs scratch evidence only; never trains/converts."""
import hashlib
import io
import json
import zipfile
from pathlib import Path
from collections import Counter
import numpy as np
from scipy.io import loadmat, whosmat
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.cache/dataset-suitability'
OUT.mkdir(exist_ok=True)

def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def describe(x, depth=0):
    if isinstance(x, dict):
        return {k: describe(v, depth+1) for k,v in x.items() if not k.startswith('__')}
    if isinstance(x, (list, tuple)):
        return {'length':len(x), 'first': describe(x[0],depth+1) if len(x) else None}
    if isinstance(x,np.ndarray):
        if x.dtype == object:
            return {'shape':list(x.shape),'first':describe(x.flat[0],depth+1) if x.size else None}
        a=x.reshape(-1)
        if np.issubdtype(a.dtype,np.number):
            finite=a[np.isfinite(a)]
            return {'shape':list(x.shape),'dtype':str(x.dtype),'nonfinite':int(x.size-len(finite)),
                    'first':a[:4].tolist(),'last':a[-3:].tolist(),
                    'min':float(finite.min()) if len(finite) else None,'max':float(finite.max()) if len(finite) else None}
        return {'shape':list(x.shape),'dtype':str(x.dtype),'first':str(a[:3])}
    if isinstance(x,np.generic): return x.item()
    return x

inventory=[]
for p in sorted((ROOT/'data').rglob('*')):
    if p.is_file():
        inventory.append({'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)})
(OUT/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')

archives=[]
for p in sorted((ROOT/'data').rglob('*.zip')):
    with zipfile.ZipFile(p) as z:
        members=[{'name':i.filename,'bytes':i.file_size,'crc':i.CRC} for i in z.infolist() if not i.is_dir()]
        texts={i.filename:z.read(i).decode('utf-8',errors='replace') for i in z.infolist()
               if not i.is_dir() and i.filename.lower().endswith(('.txt','.md','.csv')) and i.file_size<100000}
        archives.append({'path':p.relative_to(ROOT).as_posix(),'members':members,'texts':texts})
(OUT/'archives.json').write_text(json.dumps(archives,indent=2),encoding='utf-8')
print('ARCHIVES',json.dumps([{'path':a['path'],'members':len(a['members']),'mat':[m['name'] for m in a['members'] if m['name'].endswith('.mat')],'text':list(a['texts'])} for a in archives]),flush=True)

pdf=PdfReader(ROOT/'data/XJTU dataset/Data Introduction-Chinese.pdf')
(OUT/'xjtu-protocol.txt').write_text('\n\n'.join(p.extract_text() or '' for p in pdf.pages),encoding='utf-8')
print('PDF pages',len(pdf.pages),flush=True)

xjtu=[]
for p in sorted((ROOT/'data/XJTU dataset').rglob('*.mat')):
    meta=whosmat(p)
    content=loadmat(p,simplify_cells=True,variable_names=['summary'])
    summary=content.get('summary')
    item={'path':p.relative_to(ROOT).as_posix(),'variables':meta,'summary':describe(summary)}
    xjtu.append(item)
(OUT/'xjtu-summaries.json').write_text(json.dumps(xjtu,indent=2),encoding='utf-8')
print('XJTU',json.dumps([{'path':x['path'],'variables':x['variables'],'summary_keys':list(x['summary']) if isinstance(x['summary'],dict) else x['summary']} for x in xjtu]),flush=True)

samples={}
for batch in range(1,7):
    p=sorted((ROOT/f'data/XJTU dataset/Batch-{batch}').glob('*.mat'))[0]
    samples[p.relative_to(ROOT).as_posix()]=describe(loadmat(p,simplify_cells=True))
(OUT/'xjtu-samples.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')

ox=loadmat(ROOT/'data/oxford/Oxford_Battery_Degradation_Dataset_1.mat',simplify_cells=True)
(OUT/'oxford-structure.json').write_text(json.dumps({k:{'records':len(v),'keys':list(v),'first':describe(next(iter(v.values()))),'last':describe(list(v.values())[-1])} for k,v in ox.items() if not k.startswith('__')},indent=2),encoding='utf-8')
example=loadmat(ROOT/'data/oxford/ExampleDC_C1.mat',simplify_cells=True)
(OUT/'oxford-example.json').write_text(json.dumps(describe(example),indent=2),encoding='utf-8')
print('DONE structural inspection',flush=True)
