from pathlib import Path
from scipy.io import loadmat
import numpy as np, pandas as pd, json
raw=Path('Battery_DataSet/Battery_DataSet')
meta=pd.read_csv(raw/'metadata.csv').set_index('battery_id')
out=[]
for p in sorted(raw.glob('B*.mat')):
 ops=loadmat(p,simplify_cells=True)[p.stem]['cycle']; ds=[(j+1,c) for j,c in enumerate(ops) if c['type']=='discharge']
 rows=[]
 for idx,(op,c) in enumerate(ds,1):
  d=c['data']; a=np.asarray(d.get('Capacity',[])).reshape(-1); cap=float(a[0]) if a.size==1 and np.isfinite(a[0]) else None
  t=np.asarray(d.get('Time',[])).reshape(-1);v=np.asarray(d.get('Voltage_measured',[])).reshape(-1);i=np.asarray(d.get('Current_measured',[])).reshape(-1)
  same=len(t)==len(v)==len(i) and len(t)>1 and np.isfinite(t).all() and np.isfinite(v).all() and np.isfinite(i).all()
  active=i<-.1
  ah=float(np.trapezoid(np.maximum(-i,0),t)/3600) if same else None
  rows.append({'cycle':idx,'op':op,'capacity':cap,'n':len(t),'duration':float(t[-1]-t[0]) if len(t)>1 else None,'start_v':float(v[0]) if len(v) else None,'end_v':float(v[-1]) if len(v) else None,'last_active_v':float(v[np.flatnonzero(active)[-1]]) if same and active.any() else None,'ah':ah,'ratio':cap/ah if cap and ah else None,'min_dt':float(np.min(np.diff(t))) if len(t)>1 else None,'mean_current':float(np.mean(i)) if len(i) else None,'cutoff':float(meta.loc[p.stem,'discharge_cutoff_V'])})
 out.append({'battery':p.stem,'discharges':len(ds),'rows':rows})
Path('.cache/nasa_profile.json').write_text(json.dumps(out,allow_nan=False))
for b in out:
 print(json.dumps({'battery':b['battery'],'n':b['discharges'],'first':b['rows'][0],'second':b['rows'][1],'last':b['rows'][-1]}))
