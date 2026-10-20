import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('unified_builder',Path(__file__).with_name('build_unified_battery_dataset.py'))
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def rows(capacities):
    return [{**{k:None for k in b.COLS},'source_record_index':i,'source_cycle_index':i,
             'discharge_capacity_Ah':q,'quality_flags':'','dense_history_valid':False,'current_contract_eligible':False}
            for i,q in enumerate(capacities,1)]


def test_dense_first_crossing_and_recovery():
    r=rows([2,1.9,1.6,1.8,1.7,1.5,1.4])
    b.label_stream(r,[True]*7,dense=True)
    assert [x['rul_cycles'] for x in r]==[2,1,0,0,0,0,0]
    assert r[0]['reference_capacity_Ah']==2
    assert r[6]['current_contract_eligible']


def test_censored_not_zero_or_last_row_label():
    r=rows([2,1.99,1.98,1.97,1.96,1.95,1.94])
    b.label_stream(r,[True]*7,dense=True)
    assert all(x['is_censored'] and x['rul_cycles'] is None for x in r)


def test_invalid_initial_reference_never_replaced():
    r=rows([.01,2,1.9,1.8,1.7,1.6,1.5])
    b.label_stream(r,[False]+[True]*6,dense=True)
    assert all(x['reference_capacity_Ah'] is None and x['rul_cycles'] is None for x in r)


def test_missing_full_check_does_not_bridge_gap_or_look_for_later_crossing():
    r=rows([2,1.9,1.8,1.7,1.6,1.5,1.4])
    b.label_stream(r,[True,True,False,True,True,True,True],dense=True)
    assert r[-1]['rul_cycles'] is None
    assert not r[-1]['dense_history_valid']
    assert r[0]['rul_cycles'] is None
    assert r[-1]['soh_percent']==70
    assert 'history_after_unresolved_full_test_gap' in r[-1]['quality_flags']


def test_sparse_keeps_source_axis_and_never_fabricates_cycle_rul():
    r=rows([.74,.70,.59,.58]);
    for x,c in zip(r,[0,100,300,400]):x['source_cycle_index']=c
    b.label_stream(r,[True]*4)
    assert r[0]['first_observed_eol_source_cycle']==300
    assert all(x['rul_cycles'] is None and not x['dense_history_valid'] for x in r)


def test_partial_throughput_is_not_silently_a_capacity_label():
    r=rows([None,None])
    for x in r:x['discharge_throughput_Ah']=.25
    b.label_stream(r,[False,False])
    assert all(x['soh_percent'] is None and x['reference_capacity_Ah'] is None for x in r)


def test_nasa_shapes_and_units_not_modified():
    assert b.FEATURE_CONTRACT['capacity_unit']=='Ah'
    assert b.FEATURE_CONTRACT['eol_threshold']==80
    assert len(b.FEATURE_CONTRACT['features'])==13


def test_missing_raw_timestamp_keeps_measurement_and_closes_dense_prefix(tmp_path,monkeypatch):
    import numpy as np
    p=tmp_path/'data/XJTU dataset/Batch-1/fixture.mat'
    p.parent.mkdir(parents=True)
    p.write_bytes(b'fixture-only-no-real-source')
    records=[]
    for idx in range(7):
        records.append({'relative_time_min':np.linspace(0,60,21),'voltage_V':np.linspace(4.2,2.5,21),
            'current_A':np.full(21,-2.),'temperature_C':np.full(21,25.),'capacity_Ah':np.linspace(0,2,21),
            'system_time':np.array([float('nan')]) if idx==3 else [f'2022-09-16,15:{idx:02d}:00'],
            'description':'complete discharge test fixture'})
    monkeypatch.setattr(b,'ROOT',tmp_path)
    monkeypatch.setattr(b,'FILE_HASH',{'data/XJTU dataset/Batch-1/fixture.mat':'fixture-sha'},raising=False)
    monkeypatch.setattr(b,'loadmat',lambda *args,**kwargs:{'summary':{'discharge_capacity_Ah':np.full(7,2.),'cycle_life':7},'data':records})
    result=[]
    monkeypatch.setattr(b,'emit',lambda writer,rows:result.extend(rows))
    b.xjtu(None)
    assert len(result)==7
    assert result[3]['source_time'] is None
    assert result[3]['discharge_capacity_Ah']==2
    assert 'missing_or_invalid_source_time' in result[3]['quality_flags']
    assert not result[-1]['current_contract_eligible']


def test_multicell_mat_identifiers_include_native_cell(monkeypatch):
    monkeypatch.setattr(b,'FILE_HASH',{'same.mat':'same-hash'},raising=False)
    first=b.base('oxford_degradation','Cell1','same.mat',index=1,stream='C1dc')
    second=b.base('oxford_degradation','Cell2','same.mat',index=1,stream='C1dc')
    assert first['observation_id']!=second['observation_id']
    assert first['battery_uid']!=second['battery_uid']


def test_full_discharge_rate_shift_stays_separate_from_dense_eligibility(tmp_path,monkeypatch):
    import numpy as np
    p=tmp_path/'data/XJTU dataset/Batch-3/fixture.mat';p.parent.mkdir(parents=True);p.write_bytes(b'fixture')
    records=[{'relative_time_min':np.linspace(0,60,21),'voltage_V':np.linspace(4.2,2.5,21),
        'current_A':np.full(21,-2.),'temperature_C':np.full(21,25.),'capacity_Ah':np.linspace(0,2,21),
        'system_time':[f'2022-09-16,15:{idx:02d}:00'],'description':'full variable rate fixture'} for idx in range(7)]
    monkeypatch.setattr(b,'ROOT',tmp_path)
    monkeypatch.setattr(b,'FILE_HASH',{'data/XJTU dataset/Batch-3/fixture.mat':'fixture-sha'},raising=False)
    monkeypatch.setattr(b,'loadmat',lambda *args,**kwargs:{'summary':{'discharge_capacity_Ah':np.full(7,2.),'cycle_life':7},'data':records})
    result=[];monkeypatch.setattr(b,'emit',lambda writer,rows:result.extend(rows))
    b.xjtu(None)
    assert all(r['source_cycle_unit']=='completed_discharge_cycles' for r in result)
    assert all(r['rul_status']=='rate_confounded_unreviewed' and not r['current_contract_eligible'] for r in result)


def test_finite_temperature_sentinel_is_flagged_without_fabricating_a_replacement(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(b,'FILE_HASH',{'fixture.mat':'fixture-sha'},raising=False)
    r=b.base('nasa_randomized_usage','thermal-fixture','fixture.mat')
    r['mean_temperature_C']=-4099.0
    output=[]
    b.emit(SimpleNamespace(writerow=lambda row:output.append(row)),[r])
    assert output[0]['mean_temperature_C']==-4099.0
    assert 'implausible_temperature_C_retained_raw' in output[0]['quality_flags']
    assert output[0]['soh_percent'] is None and output[0]['rul_cycles'] is None
