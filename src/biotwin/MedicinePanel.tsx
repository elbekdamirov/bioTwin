import type { SimSnapshot } from '@/sim/engine/snapshot';
import { DRUG_MAP } from '@/sim/pharmacology/drugs';
import type { Profile } from './model';
import type { Translate } from './ProfileEditor';
import { selectedTreatment, treatmentCheck, treatmentIds } from './medicines';

export function MedicinePanel({profile,id,choose,snapshot,t,openForecast}:{profile:Profile;id:string;choose:(id:string)=>void;snapshot?:SimSnapshot;t:Translate;openForecast?:()=>void}) {
  const check=treatmentCheck(profile,id,snapshot);
  return <div className="medicine-panel">
    <h3>{t('Medicines for this case','Ushbu holat uchun dorilar')}</h3>
    <p className="muted">{t('Select a named medicine, inspect its mechanism, then apply it to twin B. Effects are educational engine estimates.','Dorini tanlang, mexanizmini ko‘ring va B egizakka qo‘llang. Ta’sirlar ta’lim modeli hisobidir.')}</p>
    {treatmentIds(profile.preset).map(drugId=><button key={drugId} className="medicine-card" aria-pressed={id===drugId} onClick={()=>choose(drugId)}>
      <strong>{DRUG_MAP[drugId]?.name ?? 'Supplemental oxygen'}</strong>
      <span>{selectedTreatment(profile,drugId,.1)?.settings}</span>
      <small>{drugId==='dextrose10'?t('Rescue only when glucose is low','Faqat glyukoza past bo‘lganda'):DRUG_MAP[drugId]?.drugClass ?? 'Oxygen delivery'}</small>
    </button>)}
    {id && <><h3>{t('Expected mechanism & adverse effects','Kutilgan mexanizm va nojo‘ya ta’sirlar')}</h3><p>{selectedTreatment(profile,id,.1)?.mechanism}</p>
      <h3>{t('Patient record checks','Bemor ma’lumotlari tekshiruvi')}</h3>
      {check.blocks.map(b=><p className="notice" key={b}>{b}</p>)}{check.notes.map(n=><p className="muted" key={n}>{n}</p>)}
      <p className="muted">{t('These checks cover only listed conditions. Free-text history and genetic variants are not automatically interpreted.','Tekshiruvlar faqat ko‘rsatilgan shartlarni qamraydi. Erkin matn va genetik variantlar avtomatik talqin qilinmaydi.')}</p></>}
    {snapshot && snapshot.drugs.length>0 && <><h3>{t('Active drugs in this twin','Ushbu egizakdagi faol dorilar')}</h3>{snapshot.drugs.map(d=><p key={d.id}><b>{d.name}</b> · {d.totalGiven}</p>)}</>}
    {openForecast && <div className="inset"><h3>{t('Long-term medicines','Uzoq muddatli dorilar')}</h3>
      <p>{t('Tablets and injections taken for years (metformin, SGLT2 inhibitors, GLP-1 agonists, statins, heart-failure medicines) are tested in the 5-year forecast.','Yillar davomida qabul qilinadigan dorilar (metformin, SGLT2 ingibitorlari, GLP-1 agonistlari, statinlar, yurak yetishmovchiligi dorilari) 5 yillik prognozda sinovdan o‘tkaziladi.')}</p>
      <button className="secondary wide" onClick={openForecast}>{t('Open 5-year forecast','5 yillik prognozni ochish')}</button></div>}
  </div>;
}
