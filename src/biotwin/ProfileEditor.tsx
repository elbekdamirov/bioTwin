import type { ReactNode } from 'react';
import { PatientDataFields } from './PatientData';
import { conditionOf, initialProfile, presets, profileProvenance, type Preset, type Profile } from './model';

export type Translate = (english: string, uzbek: string) => string;
export const namesUz: Record<Preset, string> = { t2d: '2-tur diabet', diabetes: '1-tur diabet', heart: 'Yurak yetishmovchiligi' };

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return <dialog className="modal" aria-labelledby="modal-title" ref={node => { if (node && !node.open) node.showModal(); }}
    onCancel={e => { e.preventDefault(); close(); }}><div className="modal-body"><h2 id="modal-title">{title}</h2>{children}</div></dialog>;
}

export function ProfileEditor({ profile, t, busy, problem, change, close, submit, recordMode=false }: {
  recordMode?:boolean; profile: Profile; t: Translate; busy: boolean; problem: string; change: (p: Profile) => void; close: () => void; submit: () => void;
}) {
  const provenance = profileProvenance(profile.preset);
  const tags = {
    model: t('Model input', 'Model parametri'),
    appearance: t('3D appearance', '3D ko‘rinish parametri'),
    context: t('Context only', 'Qo‘shimcha ma’lumot'),
    'treatment-check': t('Treatment allergy check','Muolaja allergiyasi tekshiruvi'),
    forecast: t('5-year forecast input', '5 yillik prognoz parametri'),
    unsupported: t('Unsupported', 'Modelda mavjud emas'),
  };
  const tag = (key: keyof typeof provenance) => <small className="provenance-tag">{tags[provenance[key]]}</small>;
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => change({ ...profile, [key]: value });
  return <Modal title={t('Patient profile', 'Bemor profili')} close={close}><form onSubmit={e => { e.preventDefault(); submit(); }}>
    <p className="muted">{recordMode?t('Synthetic records only. Save to the local database, then open a twin to apply its measurements.','Faqat sun’iy ma’lumotlar. Mahalliy bazaga saqlang va egizakni oching.'):t('Use synthetic information only. Applying changes starts a new scenario.', 'Faqat sun’iy ma’lumot kiriting. O‘zgarishlar yangi ssenariy boshlaydi.')}</p>
    <label className="history-input">{t('Patient name / alias','Bemor ismi / taxallusi')}<input required maxLength={80} value={profile.displayName} onChange={e=>set('displayName',e.target.value)}/></label>
    <div className="form-grid">
      <label>{t('Preset', 'Namuna')}{tag('preset')}<select value={profile.preset} onChange={e => change(initialProfile(e.target.value as Preset, false))}>{(['t2d', 'diabetes', 'heart'] as Preset[]).map(key => <option key={key} value={key}>{t(presets[key].title, namesUz[key])}</option>)}</select></label>
      <label>{t('Generation code', 'Yaratish kodi')}{tag('seed')}<input required maxLength={60} value={profile.seed} onChange={e => set('seed', e.target.value)} /></label>
      <label>{t('Sex', 'Jins')}{tag('sex')}<select value={profile.sex} onChange={e => set('sex', e.target.value as Profile['sex'])}><option value="female">{t('Female', 'Ayol')}</option><option value="male">{t('Male', 'Erkak')}</option></select></label>
      {([['age', t('Age (years)', 'Yosh (yil)'), 18, 95, 1], ['height', t('Height (cm)', 'Bo‘y (cm)'), 140, 205, .1], ['weight', t('Weight (kg)', 'Vazn (kg)'), 40, 180, .1]] as const).map(([key, label, min, max, step]) =>
        <label key={key}>{label}{tag(key)}<input type="number" min={min} max={max} step={step} required value={profile[key] || ''} onChange={e => set(key, +e.target.value)} /></label>)}
      <label>{t('Activity level', 'Faollik darajasi')}{tag('activity')}<select value={profile.activity} onChange={e => set('activity', e.target.value as Profile['activity'])}>
        <option value="low">{t('Low', 'Past')}</option><option value="moderate">{t('Moderate', 'O‘rta')}</option><option value="high">{t('High', 'Yuqori')}</option></select></label>
      <label>{t('Lab glucose (mmol/L)', 'Glyukoza (mmol/L)')}{tag('lab')}<input type="number" min="1" max="50" step=".1" value={profile.lab} onChange={e => set('lab', e.target.value === '' ? '' : +e.target.value)} /></label>
    </div>
    <label className="history-input">{t('Medical history', 'Kasallik tarixi')}{tag('history')}<textarea maxLength={250} value={profile.history} onChange={e => set('history', e.target.value)} /></label>
    <PatientDataFields profile={profile} change={change} t={t} />
    {conditionOf(profile.preset) && <p className="muted">{t('Lab values for the 5-year forecast (HbA1c, blood pressure, cholesterol, kidney function, current medicines) are edited after the twin opens: Patient → Edit measurements.', '5 yillik prognoz uchun tahlillar (HbA1c, qon bosimi, xolesterin, buyrak faoliyati, dorilar) egizak ochilgandan keyin tahrirlanadi: Bemor → O‘lchovlarni tahrirlash.')}</p>}
    {problem && <p role="alert" className="notice">{problem}</p>}
    <div className="modal-actions"><button className="secondary" type="button" onClick={close}>{t('Cancel', 'Bekor qilish')}</button><button className="primary" disabled={busy}>{busy ? t('Preparing…', 'Tayyorlanmoqda…') : recordMode?t('Save patient record','Bemor yozuvini saqlash'):t('Create digital twin', 'Raqamli egizak yaratish')}</button></div>
  </form></Modal>;
}
