import {useEffect,useState} from 'react';
import './records.css';
import {ArrowLeft,Database,Plus,Download,FileText} from 'lucide-react';
import {initialProfile,presets,type Profile} from '../model';
import {ProfileEditor} from '../ProfileEditor';
import {PatientDataSummary} from '../PatientData';
import type {Translate} from '../ProfileEditor';
import {ClinicalSummary,ForecastReport} from '../Inspector';
import {forecast} from '../chronic/engine';
import {clinicalPatient} from '../model';
const recordForecast=(p:Profile)=>{const c=clinicalPatient(p);return c?forecast(c):null;};
import {ObservationSchema,goalMetrics,type PatientRecord,type PatientBundle,type Observation,type Goal} from './schema';
import {recordsApi,measurementLabels,measurementUnits,downloadRecord,observationsCsv,measuredProgress} from './client';

type Props={t:Translate;current:Profile|null;close:()=>void;openTwin:(profile:Profile)=>Promise<void>;openSession:(data:string)=>Promise<void>;linked:(id:string,name:string)=>void};
const localTime=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
const stamp=(s:string)=>new Date(s).toLocaleString();
const numericFields=[['weightKg',40,180,.1],['heightCm',140,205,.1],['systolicBp',60,250,1],['diastolicBp',30,160,1],['glucoseMmol',1,50,.1],['sleepHours',0,24,.1],['activityMinutes',0,3000,1],['waterLitres',0,12,.1],['dietQuality',1,10,1],['stressLevel',1,10,1]] as const;

function ObservationForm({patient,save,busy}:{patient:PatientBundle;save:(o:Observation)=>void;busy:boolean}){
  const [time,setTime]=useState(localTime);
  const [values,setValues]=useState<Record<string,string>>({weightKg:String(patient.profile.weight),heightCm:String(patient.profile.height)});
  const [error,setError]=useState('');
  return <form className="record-form" onSubmit={e=>{e.preventDefault();try{
    const o=ObservationSchema.parse({recordedAt:new Date(time).toISOString(),...Object.fromEntries(numericFields.map(([k])=>[k,values[k]?Number(values[k]):null])),...Object.fromEntries(['smoking','alcohol','familyHistory'].map(k=>[k,values[k]?values[k]==='yes':null])),notes:values.notes??''});setError('');save(o);
  }catch(e){setError(e instanceof Error?e.message:'Check the measurements.');}}}>
    <h3>New health check-in</h3><p className="muted">Enter observed measurements. Empty means unknown. Glucose uses mmol/L. These records are separate from simulated biomarkers.</p>
    <label>Measurement date and time<input type="datetime-local" required value={time} onChange={e=>setTime(e.target.value)}/></label>
    <div className="record-grid">{numericFields.map(([key,min,max,step])=><label key={key}>{measurementLabels[key]} ({measurementUnits[key]})<input type="number" min={min} max={max} step={step} value={values[key]??''} onChange={e=>setValues({...values,[key]:e.target.value})}/></label>)}
    {(['smoking','alcohol','familyHistory'] as const).map(key=><label key={key}>{({smoking:'Current smoking',alcohol:'Alcohol use',familyHistory:'Family history of chronic disease'})[key]}<select value={values[key]??''} onChange={e=>setValues({...values,[key]:e.target.value})}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}</div>
    <label>Check-in notes<textarea maxLength={2000} value={values.notes??''} onChange={e=>setValues({...values,notes:e.target.value})}/></label>
    {error&&<p className="notice" role="alert">{error}</p>}<button className="primary" disabled={busy}>Save health check-in</button>
  </form>;
}

function ObservationHistory({p}:{p:PatientBundle}){
  const [metric,setMetric]=useState<keyof typeof measurementLabels>('weightKg');
  const points=[...p.observations].reverse().filter(o=>o[metric]!==null);
  const vals=points.map(o=>o[metric] as number);const min=Math.min(...vals),max=Math.max(...vals);const span=max-min||1;
  const times=points.map(o=>Date.parse(o.recordedAt));const start=Math.min(...times),range=Math.max(...times)-start;
  const path=points.map((o,i)=>`${40+(range?(times[i]-start)/range:.5)*720},${165-((o[metric] as number)-min)/span*125}`).join(' ');
  return <section><h3>Recorded measurement history</h3><label>Chart measurement<select value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}>{Object.entries(measurementLabels).map(([k,v])=><option key={k} value={k}>{v} · {measurementUnits[k as typeof metric]}</option>)}</select></label>
    {points.length?<><svg className="record-chart" role="img" aria-label={'Recorded '+measurementLabels[metric]+' history'} viewBox="0 0 800 210"><line x1="40" y1="170" x2="760" y2="170" stroke="currentColor" opacity=".2"/><polyline points={path} fill="none" stroke="var(--teal)" strokeWidth="3"/>{points.map((o,i)=><circle key={o.id} cx={40+(range?(times[i]-start)/range:.5)*720} cy={165-((o[metric] as number)-min)/span*125} r="4" fill="var(--teal)"/>)}<text x="40" y="200" fill="currentColor" fontSize="12">{new Date(points[0].recordedAt).toLocaleDateString()}</text><text x="760" y="200" textAnchor="end" fill="currentColor" fontSize="12">{new Date(points.at(-1)!.recordedAt).toLocaleDateString()}</text></svg><p>{vals[0]} → {vals.at(-1)} {measurementUnits[metric]} · {points.length} recorded measurements</p></>:<p className="empty-records">No measurements for this field yet.</p>}
    <p className="muted">Only recorded values are plotted. No extrapolated disease risk or invented health score.</p>
    <div className="record-table-wrap"><table className="record-table"><thead><tr><th>Date</th><th>Weight</th><th>BP</th><th>Glucose</th><th>Sleep</th><th>Activity</th><th>Notes</th></tr></thead><tbody>{p.observations.map(o=><tr key={o.id}><td>{stamp(o.recordedAt)}</td><td>{o.weightKg??'—'} kg</td><td>{o.systolicBp??'—'}/{o.diastolicBp??'—'} mmHg</td><td>{o.glucoseMmol??'—'} mmol/L</td><td>{o.sleepHours??'—'} h</td><td>{o.activityMinutes??'—'} min/week</td><td>{o.notes||'—'}</td></tr>)}</tbody></table></div>
  </section>;
}

function Goals({p,save,busy}:{p:PatientBundle;save:(value:unknown)=>void;busy:boolean}){
  const [metric,setMetric]=useState<Goal['metric']>('weightKg');
  return <section><h3>Measurement goals</h3><p className="muted">Track a chosen measurement against its recorded baseline. Goals do not predict treatment benefit.</p>
    <form className="record-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save({metric,targetValue:Number(f.get('target')),dueDate:f.get('due')});}}>
      <div className="record-grid"><label>Goal measurement<select value={metric} onChange={e=>setMetric(e.target.value as Goal['metric'])}>{goalMetrics.map(k=><option key={k} value={k}>{measurementLabels[k]} · {measurementUnits[k]}</option>)}</select></label><label>Target value ({measurementUnits[metric]})<input required type="number" step="any" name="target"/></label><label>Target date<input required type="date" name="due"/></label></div><button className="primary" disabled={busy}>Save measurement goal</button>
    </form><div className="record-cards">{p.goals.map(g=>{const progress=measuredProgress(g,p.observations);return <article className="record-card" key={g.id}><h4>{measurementLabels[g.metric]}</h4><p>Baseline {g.baselineValue} → target {g.targetValue} {measurementUnits[g.metric]}</p><p>Latest {progress.current} · due {g.dueDate}</p><progress max="100" value={progress.percent}/><small>{progress.percent.toFixed(0)}% of chosen measurement change</small></article>;})}</div>
  </section>;
}

function Appointments({p,save,status,busy}:{p:PatientBundle;save:(value:unknown)=>void;status:(key:string,value:string)=>void;busy:boolean}){
  return <section><h3>Local appointment planner</h3><p className="muted">Demo planning records only. This does not contact or book a real clinician.</p>
    <form className="record-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save({clinician:f.get('clinician'),scheduledAt:new Date(String(f.get('time'))).toISOString(),notes:f.get('notes')});}}><div className="record-grid"><label>Clinician / team<input required maxLength={80} name="clinician"/></label><label>Appointment date and time<input required type="datetime-local" name="time"/></label></div><label>Appointment notes<textarea maxLength={1000} name="notes" defaultValue=""/></label><button className="primary" disabled={busy}>Request local appointment</button></form>
    <div className="record-cards">{p.appointments.map(a=><article className="record-card" key={a.id}><h4>{a.clinician}</h4><p>{stamp(a.scheduledAt)} · <b>{a.status}</b></p><p>{a.notes}</p><div className="record-actions">{(a.status==='requested'?['confirmed','declined','cancelled']:a.status==='confirmed'?['completed','cancelled']:[]).map(next=><button className="secondary" key={next} disabled={busy} onClick={()=>status(a.id,next)}>{next}</button>)}</div></article>)}</div>
  </section>;
}

export function ClinicRecords({t,current,close,openTwin,openSession,linked}:Props){
  const [patients,setPatients]=useState<PatientRecord[]>([]),[selected,setSelected]=useState<PatientBundle|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [draft,setDraft]=useState<Profile|null>(null),[search,setSearch]=useState(''),[tab,setTab]=useState('summary');
  useEffect(()=>{let alive=true;void recordsApi<PatientRecord[]>('/patients').then(p=>{if(alive)setPatients(p);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  async function run(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function choose(id:string){await run(async()=>{setSelected(await recordsApi<PatientBundle>('/patients/'+id));setTab('summary');});}
  async function saveProfile(profile:Profile){await run(async()=>{const saved=await recordsApi<PatientRecord>('/patients',profile);setPatients(await recordsApi<PatientRecord[]>('/patients'));setSelected(await recordsApi<PatientBundle>('/patients/'+saved.id));if(current&&(profile===current||profile.patientId===current.patientId&&!!current.patientId))linked(saved.id,saved.profile.displayName);setDraft(null);setTab('summary');setMessage('Patient record saved in the local database.');});}
  async function mutate(suffix:string,data:unknown){if(!selected)return;await run(async()=>{setSelected(await recordsApi<PatientBundle>('/patients/'+selected.id+suffix,data));setMessage('Saved to the local database.');});}
  const latest=selected?.observations[0];
  async function openRecordedTwin(){if(!selected)return;await run(async()=>{
    const profile={...selected.profile,weight:latest?.weightKg??selected.profile.weight,height:latest?.heightCm??selected.profile.height};
    const saved=await recordsApi<PatientRecord>('/patients',profile);await openTwin(saved.profile);
  });}
  return <main className="clinic-page">
    <div className="clinic-ui"><header className="clinic-heading"><div><p className="eyebrow"><Database size={14}/> LOCAL PATIENT WORKSPACE</p><h1>{t('Patient records','Bemor yozuvlari')}</h1><p className="muted">{t('Profiles, check-ins and care planning in one place. Synthetic data only.','Profillar, kuzatuvlar va rejalashtirish bir joyda. Faqat sun’iy ma’lumotlar.')}</p></div><button className="secondary" onClick={close}><ArrowLeft size={15}/>{t('Back to studio','Studiyaga qaytish')}</button></header>
    <div className="record-actions"><button className="primary" disabled={busy} onClick={()=>setDraft(initialProfile('diabetes'))}><Plus size={16}/>New database patient</button>{current&&<button className="secondary" disabled={busy} onClick={()=>void saveProfile(current)}>Save current twin to database</button>}<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{setPatients(await recordsApi<PatientRecord[]>('/patients'));setMessage('Database refreshed.');})}>Refresh database</button></div>
    {error&&<p className="notice" role="alert">{error}</p>}{message&&<p role="status" className="record-message">{message}</p>}
    <div className="clinic-layout"><aside className="record-patients"><label>Find patient<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, alias or condition"/></label><p className="eyebrow">{patients.length} SAVED PATIENTS</p>{patients.filter(p=>(p.profile.displayName+' '+presets[p.profile.preset].title).toLowerCase().includes(search.toLowerCase())).map(p=><button key={p.id} className="record-patient" aria-pressed={p.id===selected?.id} disabled={busy} onClick={()=>void choose(p.id)}><strong>{p.profile.displayName}</strong><span>{presets[p.profile.preset].title} · {p.profile.age} y</span><small>Profile: {p.profile.weight} kg · {p.profile.height} cm</small></button>)}{patients.length===0&&<p className="empty-records">No database patients yet. Add a synthetic patient or save the current twin.</p>}</aside>
    <section className="record-detail">{selected?<>
      <header><p className="eyebrow">PATIENT RECORD · {selected.id.slice(0,8)}</p><h2>{selected.profile.displayName}</h2><p>{presets[selected.profile.preset].title} · {latest?'Latest check-in BMI':'Profile BMI'} {((latest?.weightKg??selected.profile.weight)/((latest?.heightCm??selected.profile.height)/100)**2).toFixed(1)} kg/m²</p>{latest&&<p className="muted">Latest check-in: {latest.weightKg??'—'} kg · {latest.heightCm??'—'} cm · {stamp(latest.recordedAt)}</p>}</header>
      <div className="record-actions"><button className="primary" disabled={busy} onClick={()=>void openRecordedTwin()}>Open twin from latest measurements</button><button className="secondary" disabled={busy} onClick={()=>setDraft(selected.profile)}>Edit patient record</button></div>
      <p className="muted">Opening a twin applies the latest check-in height and weight to its body and starts a new scenario. Check-in lab values remain recorded observations; simulated values are labeled separately.</p>
      <nav className="record-tabs" aria-label="Patient record sections">{['summary','check-in','history','goals','appointments','sessions','export'].map(v=><button key={v} aria-current={v===tab?'page':undefined} onClick={()=>setTab(v)}>{v.replace('-',' ')}</button>)}</nav>
      {tab==='summary'&&<><PatientDataSummary profile={selected.profile} t={t}/><details><summary>5-year forecast with current treatment</summary><ClinicalSummary profile={selected.profile} t={t}/><ForecastReport run={recordForecast(selected.profile)} t={t} uz={false}/></details><details><summary>Record activity log</summary>{selected.audit.map((a,i)=><p key={i}>{stamp(a.createdAt)} · {a.action}</p>)}</details></>}
      {tab==='check-in'&&<ObservationForm key={selected.id} patient={selected} busy={busy} save={o=>void mutate('/observations',o)}/>}
      {tab==='history'&&<ObservationHistory p={selected}/>}
      {tab==='goals'&&<Goals p={selected} busy={busy} save={o=>void mutate('/goals',o)}/>}
      {tab==='appointments'&&<Appointments p={selected} busy={busy} save={o=>void mutate('/appointments',o)} status={(key,value)=>void mutate('/appointments/'+key+'/status',{status:value})}/>}
      {tab==='sessions'&&<section><h3>Saved digital twins</h3><p className="muted">Save a twin from the studio using “Save twin to database”. Restore its recorded simulation state and treatment branches here.</p>{selected.sessions.length===0&&<p>No database twin sessions yet.</p>}{selected.sessions.map(session=><article className="record-card" key={session.id}><h4>{session.label}</h4><p>{stamp(session.createdAt)}</p><button className="primary" disabled={busy} onClick={()=>void run(async()=>{const saved=await recordsApi<{data:string}>('/patients/'+selected.id+'/twin-sessions/'+session.id);await openSession(saved.data);})}>Restore saved twin</button></article>)}</section>}
      {tab==='export'&&<section><h3>Export patient record</h3><div className="record-actions"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{downloadRecord(await recordsApi('/patients/'+selected.id+'/export'),'biotwin-patient-record.json');})}><Download size={16}/>Complete record JSON</button><button className="secondary" onClick={()=>downloadRecord(observationsCsv(selected),'biotwin-observations.csv','text/csv')}><Download size={16}/>Observed measurements CSV</button><button className="secondary" onClick={()=>window.print()}><FileText size={16}/>Print record / PDF</button></div><p>Exports contain entered records, care planning and the separate Steno result. Simulation action logs are available in Studio → Reports.</p></section>}
    </>:<div className="record-welcome"><Database size={32}/><h2>A lasting home for each patient</h2><p>Select a saved record or create one. Measurements, goals and appointments remain available after browser reloads and server restarts.</p><p className="muted">Local demo workspace. It has no multi-user authentication or live appointment booking. The imported ZIP’s synthetic risk models are not used as clinical predictions.</p></div>}</section></div></div>
    {selected&&<article className="clinic-record-print"><h1>BioTwin · Patient record</h1><h2>{selected.profile.displayName}</h2><p>Synthetic-data local workspace · {stamp(new Date().toISOString())}</p><p>{presets[selected.profile.preset].title} · {selected.profile.age} y · {selected.profile.height} cm · {selected.profile.weight} kg</p><PatientDataSummary profile={selected.profile} t={t}/><ObservationHistory p={selected}/><ForecastReport run={recordForecast(selected.profile)} t={t} uz={false}/><h3>Goals</h3>{selected.goals.map(g=><p key={g.id}>{measurementLabels[g.metric]}: {g.baselineValue} → {g.targetValue} {measurementUnits[g.metric]} · {g.dueDate}</p>)}<h3>Local appointment records</h3>{selected.appointments.map(a=><p key={a.id}>{stamp(a.scheduledAt)} · {a.clinician} · {a.status} · {a.notes}</p>)}</article>}
    {draft&&<ProfileEditor recordMode profile={draft} t={t} busy={busy} problem={error} change={setDraft} close={()=>setDraft(null)} submit={()=>void saveProfile(draft)}/>}
  </main>;
}
