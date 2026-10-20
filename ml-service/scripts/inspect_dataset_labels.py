"""Read-only suitability diagnostics, not a training converter or approved labels."""
from pathlib import Path
from collections import Counter
import io, json, hashlib, zipfile
import numpy as np
from scipy.io import loadmat

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.cache/dataset-suitability'
def save(name,x): (OUT/name).write_text(json.dumps(x,indent=2,allow_nan=False),encoding='utf-8')
def arr(x): return np.asarray(x,dtype=float).reshape(-1)
def num(x): return float(x) if np.isfinite(x) else None

old=json.loads((ROOT/'data/validated/nasa-20261016/battery-quality-manifest.json').read_text())
seen={}; hstu=[]; docs={}
for p in sorted((ROOT/'data/hstu').glob('*.zip')):
    with zipfile.ZipFile(p) as z:
        for n in z.namelist():
            if n.endswith('.txt'): docs[p.name+'::'+n]=z.read(n).decode('utf-8',errors='replace')
            if not n.endswith('.mat'):continue
            raw=z.read(n); sha=hashlib.sha256(raw).hexdigest()
            same=seen.get(Path(n).name)
            d=loadmat(io.BytesIO(raw),simplify_cells=True)
            b=Path(n).stem; cycles=np.atleast_1d(d[b]['cycle'])
            hstu.append({'archive':p.name,'member':n,'sha256':sha,'matches_old_manifest':sha==old['source_hashes'].get(Path(n).name),
                         'duplicate_of':same,'operations':len(cycles),'types':dict(Counter(x['type'] for x in cycles)),
                         'fields':list(cycles[0]),'discharge_fields':list(next(x['data'] for x in cycles if x['type']=='discharge'))})
            seen[Path(n).name]=p.name
save('hstu.json',hstu);save('hstu-docs.json',docs)
print('HSTU',len(hstu),'members',len(seen),'unique, hash matches',sum(x['matches_old_manifest'] for x in hstu),flush=True)

rw=[];rwdocs={}
for p in sorted((ROOT/'data/Nasa dataset').glob('*.zip')):
    with zipfile.ZipFile(p) as z:
        for n in z.namelist():
            if n.endswith(('.Rmd','.m')):rwdocs[p.name+'::'+n]=z.read(n).decode('utf-8',errors='replace')
            if not n.endswith('.mat'):continue
            d=loadmat(io.BytesIO(z.read(n)),simplify_cells=True)['data']; steps=d['step']
            refs=[]; invalid=Counter();timesteps=[];last_time=None;reverse_steps=0
            for idx,s in enumerate(steps,1):
                t=arr(s['relativeTime']);v=arr(s['voltage']);i=arr(s['current']);temp=arr(s['temperature']);absolute=arr(s['time'])
                if len(absolute) and last_time is not None and absolute[0]<last_time:reverse_steps+=1
                if len(absolute):last_time=absolute[-1]
                if len(t)>1:timesteps.append(float(np.median(np.diff(t))))
                if not all(np.isfinite(a).all() for a in [t,v,i,temp,absolute]):invalid['nonfinite_steps']+=1
                if not len(t) or len({len(t),len(v),len(i),len(temp),len(absolute)})!=1:invalid['length_steps']+=1
                if len(t)>1 and (np.diff(t)<=0).any():invalid['nonincreasing_time_steps']+=1
                if s['comment'].lower()=='reference discharge':
                    ok=len(t)>=20 and len(t)==len(i)==len(v) and all(np.isfinite(a).all() for a in [t,v,i]) and (np.diff(t)>0).all()
                    capacity=float(np.trapezoid(i,t)/3600) if ok else None
                    refs.append({'source_step':idx,'date':str(s.get('date')),'samples':len(t),'capacity_Ah_diagnostic':capacity,
                                 'start_voltage':num(v[0]) if len(v) else None,'end_voltage':num(v[-1]) if len(v) else None,
                                 'median_current_A':num(np.median(i)) if len(i) else None,'valid_integral':bool(ok)})
            qs=[r['capacity_Ah_diagnostic'] for r in refs]
            crossing=next((j+1 for j,q in enumerate(qs) if q is not None and qs[0] is not None and q<=.8*qs[0]),None) if qs else None
            rw.append({'battery':Path(n).stem,'archive':p.name,'member':n,'procedure':d['procedure'],'description':d['description'],
                       'step_fields':list(steps[0]),'steps':len(steps),'types':dict(Counter(s['type'] for s in steps)),
                       'comments':dict(Counter(s['comment'] for s in steps)),'quality_flags':dict(invalid),'absolute_time_reversals':reverse_steps,
                       'median_step_dt_range_s':[min(timesteps),max(timesteps)] if timesteps else None,
                       'reference_discharges':refs,'diagnostic_crossing_reference_ordinal':crossing})
            print('RW',Path(n).stem,'steps',len(steps),'refs',len(refs),'raw crossing',crossing,flush=True)
            save('rw.json',rw);save('rw-docs.json',rwdocs)

ox=loadmat(ROOT/'data/oxford/Oxford_Battery_Degradation_Dataset_1.mat',simplify_cells=True)
oxout=[]
for cell,records in ox.items():
    if cell.startswith('__'):continue
    rows=[];flags=Counter(); dts=[];fields=Counter()
    for key,branches in records.items():
        fields.update(branches.keys())
        if 'C1dc' not in branches:flags['missing_C1dc']+=1;continue
        r=branches['C1dc'];t,v,q,T=[arr(r[n]) for n in ['t','v','q','T']]
        finite=all(np.isfinite(a).all() for a in [t,v,q,T])
        if not finite:flags['nonfinite_C1dc']+=1
        if len({len(t),len(v),len(q),len(T)})!=1:flags['array_length_C1dc']+=1
        if (np.diff(t)<=0).any():flags['nonincreasing_t_C1dc']+=1
        dts.append(float(np.median(np.diff(t)))*86400)
        rows.append({'cycle':int(key[3:]),'capacity_Ah':float(-(q[-1]-q[0])/1000),'start_voltage':float(v[0]),'end_voltage':float(v[-1]),
                     'duration_if_datenum_s':float((t[-1]-t[0])*86400),'q_positive_steps':int((np.diff(q)>0).sum())})
    crossing=next((r['cycle'] for r in rows if r['capacity_Ah']<=.8*rows[0]['capacity_Ah']),None)
    idx=next((j for j,r in enumerate(rows) if r['cycle']==crossing),None)
    oxout.append({'cell':cell,'records':len(records),'branches':dict(fields),'flags':dict(flags),'rows':rows,
                  'gaps':[[a['cycle'],b['cycle']] for a,b in zip(rows,rows[1:]) if b['cycle']-a['cycle']!=100],
                  'diagnostic_first_80_crossing':crossing,'crossing_bracket': [rows[idx-1]['cycle'],crossing] if idx else None,
                  'median_dt_if_datenum_s':[min(dts),max(dts)]})
save('oxford-labels.json',oxout)
print('OXFORD',[(r['cell'],r['records'],r['diagnostic_first_80_crossing']) for r in oxout],flush=True)

xjtu=[]
for p in sorted((ROOT/'data/XJTU dataset').glob('Batch-*/*.mat')):
    d=loadmat(p,simplify_cells=True);summary=d['summary'];cycles=d['data'];q=arr(summary['discharge_capacity_Ah'])
    rows=[];flags=Counter();desc=Counter();med_dt=[];names=Counter()
    for idx,r in enumerate(cycles,1):
        desc[r.get('description','')]+=1;names.update(r.keys())
        names_required=['relative_time_min','voltage_V','current_A','temperature_C','capacity_Ah']
        a={k:arr(r.get(k,[])) for k in names_required}
        if any(not v.size or not np.isfinite(v).all() for v in a.values()):flags['missing_or_nonfinite_cycles']+=1
        if len({len(v) for v in a.values()})!=1:flags['unequal_arrays']+=1
        t,v,i,c=a['relative_time_min'],a['voltage_V'],a['current_A'],a['capacity_Ah'];mask=i<-.1
        dt=np.diff(t);positive=dt[dt>0]
        if len(positive):med_dt.append(float(np.median(positive))*60)
        if mask.any():
            positions=np.flatnonzero(mask);first,last=positions[0],positions[-1]
            integ=sum(float(np.trapezoid(-i[a0:b0],t[a0:b0])*60/3600) for a0,b0 in zip(
                np.r_[first,positions[1:][np.diff(positions)>1]],np.r_[positions[:-1][np.diff(positions)>1]+1,last+1]))
            rows.append({'cycle':idx,'description':r.get('description',''),'start_voltage':num(v[first]),'end_voltage':num(v[last]),
                         'counter_capacity_Ah':num(c[last]),'integral_Ah':integ,'summary_Ah':num(q[idx-1]),
                         'discharge_resets':int((np.diff(t[first:last+1])<0).sum()),'system_start':str(np.atleast_1d(r['system_time'])[0])})
        else:flags['no_discharge_cycle']+=1
    measured=[r for r in rows if '[test capacity]' in r['description']]
    refs=measured if int(p.parent.name[-1])>=4 else rows
    ref=refs[0]['summary_Ah'] if refs else None
    cross=next((r['cycle'] for r in refs if ref and r['summary_Ah'] and r['summary_Ah']<=.8*ref),None)
    naive=next((j+1 for j,v in enumerate(q) if v<=.8*q[0]),None)
    xjtu.append({'file':p.relative_to(ROOT).as_posix(),'cycles':len(cycles),'cycle_life':int(summary['cycle_life']),
                  'summary_description':summary['description'],'fields':dict(names),'description_counts':dict(desc),'flags':dict(flags),
                  'nonfinite_summary_capacity':int((~np.isfinite(q)).sum()),'nonpositive_summary_capacity':int((q<=0).sum()),
                  'first_capacity_Ah':num(q[0]),'last_capacity_Ah':num(q[-1]),'naive_all_summary_crossing':naive,
                  'test_capacity_records':len(measured),'first_measured_test_cycle':refs[0]['cycle'] if refs else None,
                  'diagnostic_reference_Ah':ref,'diagnostic_measured_80_crossing':cross,'records':rows,
                  'positive_dt_median_range_s':[min(med_dt),max(med_dt)] if med_dt else None})
    print('XJTU',p.parent.name,p.stem,'cycles',len(cycles),'test refs',len(measured),'raw crossing',cross,flush=True)
    save('xjtu-labels.json',xjtu)
print('ALL DONE',flush=True)
