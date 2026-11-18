import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Router,type Request,type Response} from 'express';
import {z} from 'zod';
import {ProfileSchema,ObservationSchema,GoalInputSchema,AppointmentInputSchema,AppointmentStatusSchema,type PatientRecord,type PatientBundle,type Goal,type Appointment} from '../src/biotwin/records/schema';
import {forecast} from '../src/biotwin/chronic/engine';
import {emptyClinical} from '../src/biotwin/chronic/types';

export class RecordsStore {
  db:DatabaseSync;
  constructor(filename:string){
    if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY,profile_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS health_records(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),recorded_at TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_patient_time ON health_records(patient_id,recorded_at DESC);
      CREATE TABLE IF NOT EXISTS health_goals(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS twin_sessions(id TEXT PRIMARY KEY,patient_id TEXT NOT NULL REFERENCES patients(id),label TEXT NOT NULL,compressed_data TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS record_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id TEXT NOT NULL REFERENCES patients(id),action TEXT NOT NULL,created_at TEXT NOT NULL);
      PRAGMA user_version=2;`);
  }
  close(){this.db.close();}
  audit(id:string,action:string){this.db.prepare('INSERT INTO record_audit(patient_id,action,created_at) VALUES(?,?,?)').run(id,action,new Date().toISOString());}
  list():PatientRecord[]{return (this.db.prepare('SELECT * FROM patients ORDER BY updated_at DESC').all() as {id:string;profile_json:string;created_at:string;updated_at:string}[]).map(r=>({id:r.id,profile:ProfileSchema.parse(JSON.parse(r.profile_json)),createdAt:r.created_at,updatedAt:r.updated_at}));}
  get(id:string):PatientBundle{
    const p=this.list().find(p=>p.id===id);if(!p)throw new Error('Patient record not found.');
    const read=<T,>(table:string)=> (this.db.prepare(`SELECT id,payload_json,created_at FROM ${table} WHERE patient_id=? ORDER BY created_at DESC`).all(id) as {id:string;payload_json:string;created_at:string}[]).map(r=>({...JSON.parse(r.payload_json),id:r.id,createdAt:r.created_at})) as T[];
    const observations=read<PatientBundle['observations'][number]>('health_records').sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)||b.createdAt.localeCompare(a.createdAt));
    return {...p,observations,goals:read<Goal>('health_goals'),appointments:read<Appointment>('appointments'),sessions:this.db.prepare('SELECT id,label,created_at AS createdAt FROM twin_sessions WHERE patient_id=? ORDER BY created_at DESC LIMIT 30').all(id) as PatientBundle['sessions'],audit:(this.db.prepare('SELECT action,created_at AS createdAt FROM record_audit WHERE patient_id=? ORDER BY id DESC LIMIT 100').all(id) as PatientBundle['audit'])};
  }
  save(input:unknown):PatientRecord{
    const p=ProfileSchema.parse(input);const bmi=p.weight/(p.height/100)**2;if(bmi<16||bmi>50)throw new Error('BMI must be between 16 and 50.');
    const id=p.patientId??randomUUID();const now=new Date().toISOString();const exists=this.db.prepare('SELECT id FROM patients WHERE id=?').get(id);
    if(p.patientId&&!exists)throw new Error('Patient record not found.');
    const profile={...p,patientId:id};
    this.db.exec('BEGIN IMMEDIATE');try{
      this.db.prepare('INSERT INTO patients(id,profile_json,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=excluded.updated_at').run(id,JSON.stringify(profile),now,now);
      this.audit(id,exists?'Profile updated':'Patient created');this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
    const {createdAt,updatedAt}=this.get(id);return {id,profile,createdAt,updatedAt};
  }
  addObservation(id:string,input:unknown){
    this.get(id);const raw=ObservationSchema.parse(input);const data={...raw,recordedAt:new Date(raw.recordedAt).toISOString()};const key=randomUUID();const now=new Date().toISOString();
    this.db.prepare('INSERT INTO health_records(id,patient_id,recorded_at,payload_json,created_at) VALUES(?,?,?,?,?)').run(key,id,data.recordedAt,JSON.stringify(data),now);this.audit(id,'Health check-in added');return this.get(id);
  }
  addGoal(id:string,input:unknown){
    const p=this.get(id);const data=GoalInputSchema.parse(input);
    const latest=p.observations.find(o=>o[data.metric]!==null);
    const baselineValue=latest?.[data.metric]??(data.metric==='weightKg'?p.profile.weight:null);
    if(baselineValue===null)throw new Error('Record a baseline measurement before setting this goal.');
    if(baselineValue===data.targetValue)throw new Error('Target must differ from the baseline measurement.');
    this.db.prepare('INSERT INTO health_goals(id,patient_id,payload_json,created_at) VALUES(?,?,?,?)').run(randomUUID(),id,JSON.stringify({...data,baselineValue}),new Date().toISOString());this.audit(id,'Measurement goal added');return this.get(id);
  }
  addAppointment(id:string,input:unknown){
    this.get(id);const raw=AppointmentInputSchema.parse(input);const data={...raw,scheduledAt:new Date(raw.scheduledAt).toISOString()};
    this.db.prepare('INSERT INTO appointments(id,patient_id,payload_json,created_at) VALUES(?,?,?,?)').run(randomUUID(),id,JSON.stringify({...data,status:'requested'}),new Date().toISOString());this.audit(id,'Local appointment requested');return this.get(id);
  }
  setAppointment(id:string,key:string,status:unknown){
    const p=this.get(id);const ap=p.appointments.find(a=>a.id===key);if(!ap)throw new Error('Appointment not found.');const next=AppointmentStatusSchema.parse(status);
    const allowed:Record<Appointment['status'],string[]>={requested:['confirmed','declined','cancelled'],confirmed:['completed','cancelled'],declined:[],cancelled:[],completed:[]};
    if(!allowed[ap.status].includes(next))throw new Error('Invalid appointment status transition.');
    this.db.prepare('UPDATE appointments SET payload_json=? WHERE id=? AND patient_id=?').run(JSON.stringify({...ap,status:next}),key,id);this.audit(id,'Appointment '+next);return this.get(id);
  }
  saveSession(id:string,input:unknown){
    this.get(id);const body=z.object({data:z.string().min(20).max(6_000_000),label:z.string().trim().min(1).max(120)}).strict().parse(input);
    if(!/^[A-Za-z0-9+/]+=*$/.test(body.data))throw new Error('Invalid compressed session.');
    const saved=JSON.parse(gunzipSync(Buffer.from(body.data,'base64'),{maxOutputLength:32*1024*1024}).toString('utf8'));
    const profile=ProfileSchema.parse(saved.profile);
    if(saved.version!==1||profile.patientId!==id||!Array.isArray(saved.frames?.A)||!Array.isArray(saved.frames?.B)||!saved.engines)throw new Error('Session does not match this patient record.');
    const key=randomUUID();this.db.prepare('INSERT INTO twin_sessions(id,patient_id,label,compressed_data,created_at) VALUES(?,?,?,?,?)').run(key,id,body.label,body.data,new Date().toISOString());this.audit(id,'Twin session saved');return this.get(id);
  }
  session(id:string,key:string){this.get(id);const row=this.db.prepare('SELECT compressed_data AS data FROM twin_sessions WHERE id=? AND patient_id=?').get(key,id);if(!row)throw new Error('Twin session not found.');return row;}
}

export function recordsRouter(store:RecordsStore){
  const r=Router();
  r.use((req,res,next)=>{
    // No public multi-user deployment: this workspace is restricted to loopback.
    const remote=req.socket.remoteAddress??'';
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)){res.status(403).json({ok:false,error:'The records workspace is local-only.'});return;}
    const origin=req.headers.origin;
    if(origin){try{if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw Error();}catch{res.status(403).json({ok:false,error:'External origins cannot access local records.'});return;}}
    res.setHeader('Cache-Control','no-store');next();
  });
  const handle=(fn:(req:Request)=>unknown)=>(req:Request,res:Response)=>{try{res.json({ok:true,data:fn(req)});}catch(e){res.status(e instanceof z.ZodError?400:(e as Error).message.includes('not found')?404:400).json({ok:false,error:e instanceof z.ZodError?e.issues.slice(0,3).map(i=>i.path.join('.')+': '+i.message).join('; '):(e as Error).message});}};
  r.get('/status',handle(()=>({database:'SQLite',schemaVersion:2,mode:'local synthetic-data workspace'})));
  r.get('/patients',handle(()=>store.list()));
  r.post('/patients',handle(req=>store.save(req.body)));
  r.get('/patients/:id',handle(req=>store.get(String(req.params.id))));
  r.post('/patients/:id/observations',handle(req=>store.addObservation(String(req.params.id),req.body)));
  r.post('/patients/:id/goals',handle(req=>store.addGoal(String(req.params.id),req.body)));
  r.post('/patients/:id/appointments',handle(req=>store.addAppointment(String(req.params.id),req.body)));
  r.post('/patients/:id/appointments/:key/status',handle(req=>store.setAppointment(String(req.params.id),String(req.params.key),req.body.status)));
  r.post('/patients/:id/twin-sessions',handle(req=>store.saveSession(String(req.params.id),req.body)));
  r.get('/patients/:id/twin-sessions/:key',handle(req=>store.session(String(req.params.id),String(req.params.key))));
  r.get('/patients/:id/export',handle(req=>{const p=store.get(String(req.params.id));return {...p,forecast:(()=>{const pr=p.profile;const condition=({t2d:'t2d',diabetes:'t1d',heart:'hf',general:null} as const)[pr.preset];if(!condition)return null;const cp={...(pr.clinical??emptyClinical()),condition,age:pr.age,sex:pr.sex,weightKg:pr.weight,heightCm:pr.height};const f=forecast(cp);return {missing:f.missing,outcomes:f.outcomes.map(o=>({id:o.id,model:o.model,risk5y:o.base.at(-1)}))};})(),exportedAt:new Date().toISOString(),scope:'Recorded measurements and separate model estimate. No synthetic-ML probabilities.'};}));
  return r;
}
