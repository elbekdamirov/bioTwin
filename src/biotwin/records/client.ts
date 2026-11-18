import type {PatientBundle,StoredObservation,Goal} from './schema';
export async function recordsApi<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/records'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!(response.headers.get('content-type')??'').includes('application/json'))throw new Error('Database API is offline. Start the project with npm run dev:full.');
  const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error??'Database request failed.');return data.data;
}
export const measurementLabels={weightKg:'Weight',heightCm:'Height',systolicBp:'Systolic BP',diastolicBp:'Diastolic BP',glucoseMmol:'Glucose',sleepHours:'Sleep',activityMinutes:'Weekly activity',waterLitres:'Daily water',dietQuality:'Diet quality',stressLevel:'Stress'} as const;
export const measurementUnits={weightKg:'kg',heightCm:'cm',systolicBp:'mmHg',diastolicBp:'mmHg',glucoseMmol:'mmol/L',sleepHours:'h/night',activityMinutes:'min/week',waterLitres:'L/day',dietQuality:'/10',stressLevel:'/10'} as const;
export function measuredProgress(goal:Goal,observations:StoredObservation[]){
  const observation=observations.find(o=>o[goal.metric]!==null);const current=observation?.[goal.metric]??goal.baselineValue;
  return {current,percent:Math.max(0,Math.min(100,(current-goal.baselineValue)/(goal.targetValue-goal.baselineValue)*100))};
}
export function downloadRecord(data:unknown,name:string,type='application/json'){
  const text=typeof data==='string'?data:JSON.stringify(data,null,2);const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function observationsCsv(p:PatientBundle){
  const keys=['recordedAt',...Object.keys(measurementLabels),'smoking','alcohol','familyHistory','notes'] as const;
  const quote=(v:unknown)=>{let text=String(v??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [keys.join(','),...p.observations.map(o=>keys.map(k=>quote(o[k as keyof StoredObservation])).join(','))].join('\r\n');
}
