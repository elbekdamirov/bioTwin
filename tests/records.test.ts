import {describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync,readdirSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {gzipSync} from 'node:zlib';
import {RecordsStore,recordsRouter} from '../server/records';
import {initialProfile} from '../src/biotwin/model';
import {ObservationSchema} from '../src/biotwin/records/schema';
import {measuredProgress,observationsCsv} from '../src/biotwin/records/client';

describe('durable patient records',()=>{
  it('persists distinct patients, check-ins, goals and appointment transitions across database restart',()=>{
    const dir=mkdtempSync(path.join(tmpdir(),'biotwin-records-test-'));const file=path.join(dir,'test.sqlite');let store=new RecordsStore(file);
    try{
      const a=store.save({...initialProfile('diabetes'),displayName:'Synthetic A'});
      const b=store.save({...initialProfile('heart'),displayName:'Synthetic B'});
      store.addObservation(a.id,{recordedAt:'2026-11-01T10:00:00Z',weightKg:100,heightCm:165,glucoseMmol:8,systolicBp:130,diastolicBp:80});
      store.addGoal(a.id,{metric:'weightKg',targetValue:90,dueDate:'2027-01-01'});
      store.addObservation(a.id,{recordedAt:'2026-11-18T10:00:00Z',weightKg:98,heightCm:165,notes:'=malicious-formula'});
      const p=store.addAppointment(a.id,{clinician:'Demo clinician',scheduledAt:'2026-12-01T10:00:00Z'});
      const encoded=gzipSync(JSON.stringify({version:1,profile:a.profile,frames:{A:[],B:[]},engines:{A:null,B:null}})).toString('base64');
      const sessions=store.saveSession(a.id,{data:encoded,label:'Demo twin'}).sessions;
      expect(store.session(a.id,sessions[0].id)).toEqual({data:encoded});
      expect(()=>store.saveSession(b.id,{data:encoded,label:'Wrong patient'})).toThrow(/match/);
      const appointment=p.appointments[0];store.setAppointment(a.id,appointment.id,'confirmed');store.setAppointment(a.id,appointment.id,'completed');
      expect(()=>store.setAppointment(a.id,appointment.id,'confirmed')).toThrow(/transition/);
      store.close();store=new RecordsStore(file);
      const saved=store.get(a.id);expect(store.list()).toHaveLength(2);expect(saved.observations).toHaveLength(2);expect(saved.sessions).toHaveLength(1);expect(saved.observations[0].weightKg).toBe(98);
      expect(saved.appointments[0].status).toBe('completed');expect(saved.goals[0].baselineValue).toBe(100);
      expect(measuredProgress(saved.goals[0],saved.observations)).toEqual({current:98,percent:20});
      expect(store.get(b.id).observations).toHaveLength(0);expect(saved.audit.some(a=>a.action==='Health check-in added')).toBe(true);
      expect(observationsCsv(saved)).toContain("'=malicious-formula");
      expect(()=>store.addGoal(b.id,{metric:'glucoseMmol',targetValue:6,dueDate:'2027-01-01'})).toThrow(/baseline/);
    }finally{store.close();for(const name of readdirSync(dir))rmSync(path.join(dir,name));rmdirSync(dir);}
  });
  it('rejects invalid measurements, preserves unknown values and validates profile BMI',()=>{
    const store=new RecordsStore(':memory:');try{
      const p=store.save(initialProfile('diabetes'));
      expect(()=>store.addObservation(p.id,{recordedAt:'not-a-date',glucoseMmol:600})).toThrow();
      expect(()=>ObservationSchema.parse({recordedAt:'2026-11-18T10:00:00Z',systolicBp:80,diastolicBp:100})).toThrow();
      expect(()=>store.save({...p.profile,weight:180,height:140})).toThrow(/BMI/);
      expect(ObservationSchema.parse({recordedAt:'2026-11-18T10:00:00Z',weightKg:90}).glucoseMmol).toBeNull();
      expect(()=>store.get('missing')).toThrow(/not found/);
    }finally{store.close();}
  });
  it('serves the records API locally with validation, origin protection and a reproducible forecast export',async()=>{
    const store=new RecordsStore(':memory:');const app=express();app.use(express.json());app.use('/api/records',recordsRouter(store));
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',()=>resolve()));
    const address=server.address();if(!address||typeof address==='string')throw Error('No test port');const base='http://127.0.0.1:'+address.port+'/api/records';
    try{
      const denied=await fetch(base+'/patients',{headers:{origin:'https://external.example'}});expect(denied.status).toBe(403);
      const created=await fetch(base+'/patients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(initialProfile('diabetes'))});const p=await created.json();expect(p.ok).toBe(true);
      const bad=await fetch(base+'/patients/'+p.data.id+'/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"glucoseMmol":900}'});expect(bad.status).toBe(400);
      const exported=await fetch(base+'/patients/'+p.data.id+'/export');expect(exported.headers.get('cache-control')).toBe('no-store');const body=await exported.json();expect(body.data.forecast.missing).toEqual([]);expect(body.data.forecast.outcomes[0].model).toBe('Steno Type 1 Risk Engine');expect(body.data.profile.patientId).toBe(p.data.id);
    }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.close();}
  });
});
