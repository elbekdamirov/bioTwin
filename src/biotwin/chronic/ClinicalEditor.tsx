import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Database, Search } from 'lucide-react';
import { DRUGS } from './drugs';
import { egfrFromCreatinine } from './engine';
import { ClinicalSchema, emptyClinical, type ChronicCondition, type Clinical, type ClinicalPatient } from './types';

type Translate = (en: string, uz: string) => string;
export type CohortRecord = { id: string; condition: ChronicCondition; age: number; sex: 'female' | 'male'; heightCm: number; weightKg: number; clinical: Clinical;
  observed?: { followUpDays: number; died: boolean } };

let cache: Promise<CohortRecord[]> | null = null;
/** Real de-identified records: NHANES 2017–2020 adults with diabetes and UCI heart-failure patients (lazy-loaded). */
export function loadCohorts() {
  cache ??= Promise.all([import('./data/nhanes-diabetes.json'), import('./data/uci-heart-failure.json')])
    .then(([a, b]) => [...(a.default as unknown as CohortRecord[]), ...(b.default as unknown as CohortRecord[])]);
  return cache;
}

type NumberField = { key: keyof Clinical; en: string; uz: string; min: number; max: number; step: number };
const fields: Record<ChronicCondition, NumberField[]> = {
  t2d: [
    { key: 'durationYears', en: 'Years since diagnosis', uz: 'Tashxisdan beri yillar', min: 0, max: 80, step: 0.5 },
    { key: 'hba1c', en: 'HbA1c (%)', uz: 'HbA1c (%)', min: 4, max: 16, step: 0.1 },
    { key: 'sbp', en: 'Systolic BP (mmHg)', uz: 'Sistolik bosim (mmHg)', min: 70, max: 230, step: 1 },
    { key: 'totalChol', en: 'Total cholesterol (mmol/L)', uz: 'Umumiy xolesterin (mmol/L)', min: 1.5, max: 15, step: 0.01 },
    { key: 'hdl', en: 'HDL cholesterol (mmol/L)', uz: 'HDL xolesterin (mmol/L)', min: 0.3, max: 4, step: 0.01 },
    { key: 'ldl', en: 'LDL cholesterol (mmol/L)', uz: 'LDL xolesterin (mmol/L)', min: 0.3, max: 12, step: 0.01 },
    { key: 'egfr', en: 'eGFR (mL/min/1.73 m²)', uz: 'eGFR (mL/min/1,73 m²)', min: 5, max: 150, step: 1 },
    { key: 'acr', en: 'Urine albumin/creatinine (mg/g)', uz: 'Siydik albumin/kreatinin (mg/g)', min: 0, max: 5000, step: 0.1 },
  ],
  t1d: [
    { key: 'durationYears', en: 'Years since diagnosis', uz: 'Tashxisdan beri yillar', min: 0, max: 80, step: 0.5 },
    { key: 'hba1c', en: 'HbA1c (%)', uz: 'HbA1c (%)', min: 4, max: 16, step: 0.1 },
    { key: 'sbp', en: 'Systolic BP (mmHg)', uz: 'Sistolik bosim (mmHg)', min: 70, max: 230, step: 1 },
    { key: 'ldl', en: 'LDL cholesterol (mmol/L)', uz: 'LDL xolesterin (mmol/L)', min: 0.3, max: 12, step: 0.01 },
    { key: 'egfr', en: 'eGFR (mL/min/1.73 m²)', uz: 'eGFR (mL/min/1,73 m²)', min: 5, max: 150, step: 1 },
    { key: 'acr', en: 'Urine albumin/creatinine (mg/g)', uz: 'Siydik albumin/kreatinin (mg/g)', min: 0, max: 5000, step: 0.1 },
  ],
  hf: [
    { key: 'ef', en: 'Ejection fraction (%)', uz: 'Chiqarish fraksiyasi (%)', min: 5, max: 80, step: 1 },
    { key: 'sbp', en: 'Systolic BP (mmHg)', uz: 'Sistolik bosim (mmHg)', min: 70, max: 230, step: 1 },
    { key: 'creatinine', en: 'Creatinine (µmol/L)', uz: 'Kreatinin (µmol/L)', min: 20, max: 1500, step: 1 },
  ],
};
const flags: Record<ChronicCondition, [keyof Clinical, string, string][]> = {
  t2d: [['smoker', 'Current smoker', 'Hozir chekadi'], ['priorCvd', 'Prior heart attack / stroke', 'Avval infarkt / insult'], ['atrialFibrillation', 'Atrial fibrillation', 'Bo‘lmachalar fibrillyatsiyasi'], ['retinopathy', 'Known retinopathy', 'Retinopatiya bor']],
  t1d: [['smoker', 'Current smoker', 'Hozir chekadi'], ['exercise', 'Exercise ≥ 3.5 h/week', 'Jismoniy faollik ≥ 3,5 soat/hafta'], ['priorCvd', 'Prior cardiovascular disease', 'Avvalgi yurak-qon tomir kasalligi'], ['retinopathy', 'Known retinopathy', 'Retinopatiya bor']],
  hf: [['smoker', 'Current smoker', 'Hozir chekadi'], ['diabetes', 'Diabetes', 'Diabet'], ['copd', 'COPD', 'O‘SOK'], ['hfOver18Months', 'Heart failure diagnosed > 18 months ago', 'Yurak yetishmovchiligi 18 oydan oldin aniqlangan']],
};

export function ClinicalEditor({ patient, t, save, cancel }: {
  patient: ClinicalPatient; t: Translate; cancel: () => void;
  save: (clinical: Clinical, body: { weight: number; height: number }) => boolean | void;
}) {
  const [draft, setDraft] = useState<Clinical>(() => ClinicalSchema.parse({ ...emptyClinical(), ...stripPatient(patient) }));
  const [body, setBody] = useState({ weight: patient.weightKg, height: patient.heightCm });
  const [error, setError] = useState('');
  const c = patient.condition;
  const set = <K extends keyof Clinical>(k: K, v: Clinical[K]) => setDraft(d => ({ ...d, [k]: v, assumed: d.assumed.filter(a => !a.toLowerCase().includes(String(k).toLowerCase())) }));
  function submit(e: FormEvent) {
    e.preventDefault();
    let next = draft;
    if (c === 'hf' && draft.creatinine !== null) next = { ...next, egfr: Math.round(egfrFromCreatinine(draft.creatinine, patient.age, patient.sex)) };
    const parsed = ClinicalSchema.safeParse({ ...next, source: draft.source.startsWith('Entered') ? draft.source : draft.source + ' · edited' });
    if (!parsed.success) { setError(t('Check the values and units.', 'Qiymatlar va birliklarni tekshiring.')); return; }
    if (save(parsed.data, body) === false) setError(t('Height and weight must give a BMI between 16 and 50.', 'Bo‘y va vazn 16–50 oralig‘idagi BMI berishi kerak.'));
  }
  return <form className="clinical-editor" onSubmit={submit}>
    <p className="muted">{t('These measurements drive the 5-year forecast. Empty fields block the models that need them.', 'Bu o‘lchovlar 5 yillik prognozni boshqaradi. Bo‘sh maydonlar ularga muhtoj modellarni to‘xtatadi.')}</p>
    <div className="form-grid">
      <label>{t('Weight (kg)', 'Vazn (kg)')}<input type="number" min={40} max={180} step={0.1} value={body.weight} onChange={e => setBody({ ...body, weight: +e.target.value })} /></label>
      <label>{t('Height (cm)', 'Bo‘y (cm)')}<input type="number" min={140} max={205} step={0.1} value={body.height} onChange={e => setBody({ ...body, height: +e.target.value })} /></label>
      {fields[c].map(f => <label key={f.key}>{t(f.en, f.uz)}<input type="number" min={f.min} max={f.max} step={f.step}
        value={draft[f.key] === null ? '' : String(draft[f.key])} onChange={e => set(f.key, (e.target.value === '' ? null : Number(e.target.value)) as never)} /></label>)}
      {c === 'hf' && <label>{t('NYHA class', 'NYHA sinfi')}<select value={draft.nyha ?? ''} onChange={e => set('nyha', e.target.value ? Number(e.target.value) as 1 : null)}>
        <option value="">—</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{['I', 'II', 'III', 'IV'][n - 1]}</option>)}</select></label>}
    </div>
    <div className="flag-grid">{flags[c].map(([k, en, uz]) => <label key={k}><input type="checkbox" checked={!!draft[k]} onChange={e => set(k, e.target.checked as never)} />{t(en, uz)}</label>)}</div>
    <fieldset className="med-fieldset"><legend>{t('Medicines the patient takes now', 'Bemor hozir qabul qilayotgan dorilar')}</legend>
      {DRUGS.filter(d => d.conditions.includes(c)).map(d => <label key={d.id}><input type="checkbox" checked={draft.meds.includes(d.id)}
        onChange={e => set('meds', e.target.checked ? [...draft.meds, d.id] : draft.meds.filter(x => x !== d.id))} />{d.name}</label>)}
      {draft.recordedMeds.length > 0 && <p className="muted small">{t('Recorded in source: ', 'Manbada qayd etilgan: ')}{draft.recordedMeds.join(', ')}</p>}
    </fieldset>
    {error && <p role="alert" className="notice">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={cancel}>{t('Cancel', 'Bekor qilish')}</button><button className="primary">{t('Save measurements', 'O‘lchovlarni saqlash')}</button></div>
  </form>;
}

function stripPatient(p: ClinicalPatient): Partial<Clinical> {
  const { condition: _c, age: _a, sex: _s, weightKg: _w, heightCm: _h, ...rest } = p;
  return rest;
}

export function PatientPicker({ condition, t, choose, cancel }: { condition: ChronicCondition; t: Translate; choose: (r: CohortRecord) => void; cancel: () => void }) {
  const [records, setRecords] = useState<CohortRecord[] | null>(null);
  const [query, setQuery] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => { loadCohorts().then(setRecords).catch(() => setProblem(t('Could not load the open datasets.', 'Ochiq ma’lumotlarni yuklab bo‘lmadi.'))); }, [t]);
  const rows = useMemo(() => (records ?? []).filter(r => r.condition === condition)
    .filter(r => !query || (r.id + ' ' + r.clinical.recordedMeds.join(' ') + ' ' + r.age + ' ' + r.sex).toLowerCase().includes(query.toLowerCase())), [records, condition, query]);
  const source = condition === 'hf'
    ? t('UCI Heart Failure Clinical Records — 299 hospital patients (Faisalabad, Pakistan, 2015), CC BY 4.0.', 'UCI yurak yetishmovchiligi klinik yozuvlari — 299 kasalxona bemori (Faysalobod, Pokiston, 2015), CC BY 4.0.')
    : t('CDC NHANES 2017–March 2020 — US adults with diagnosed diabetes, measured in mobile exam centres (public domain).', 'CDC NHANES 2017–2020-mart — tashxis qo‘yilgan diabetli AQSh kattalari, mobil tekshiruv markazlarida o‘lchangan (ochiq).');
  return <div className="patient-picker">
    <p className="muted"><Database size={14} /> {source}</p>
    <label className="search"><Search size={15} /><input autoFocus placeholder={t('Search by ID, age, sex or medicine', 'ID, yosh, jins yoki dori bo‘yicha qidirish')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    {problem && <p className="notice">{problem}</p>}
    {!records && !problem && <p role="status">{t('Loading real patients…', 'Haqiqiy bemorlar yuklanmoqda…')}</p>}
    {records && <p className="muted small">{rows.length} {t('patients', 'bemor')}</p>}
    <div className="picker-table" role="list">{rows.slice(0, 120).map(r => <button key={r.id} role="listitem" onClick={() => choose(r)}>
      <b>{r.id}</b><span>{r.age} {t('y', 'yosh')} · {r.sex === 'female' ? t('F', 'A') : t('M', 'E')}</span>
      <span>{condition === 'hf' ? `EF ${r.clinical.ef}%` : `HbA1c ${r.clinical.hba1c}%`}</span><span>eGFR {r.clinical.egfr ?? '—'}</span>
      <span className="meds">{r.clinical.recordedMeds.slice(0, 4).join(', ') || (condition === 'hf' ? (r.observed?.died ? t('died during follow-up', 'kuzatuvda vafot etgan') : t('survived follow-up', 'kuzatuvda tirik')) : '—')}</span>
    </button>)}</div>
    <div className="modal-actions"><button className="secondary" onClick={cancel}>{t('Close', 'Yopish')}</button></div>
  </div>;
}
