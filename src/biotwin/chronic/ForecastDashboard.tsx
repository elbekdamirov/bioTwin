import { useState } from 'react';
import { Brain, Eye, HeartPulse, Info, PersonStanding, Pill, Plus, X } from 'lucide-react';
import { DRUGS, DRUG_BY_ID } from './drugs';
import type { Biomarkers, ForecastRun } from './engine';
import { outcomeLabel, relativeLine, type Lang, type Organ } from './chat';
import type { ClinicalPatient } from './types';

type Translate = (en: string, uz: string) => string;
export type Plan = { add: string[]; remove: string[] };

const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%';

function MarkerChart({ run, pick, label, unit, digits = 1 }: { run: ForecastRun; pick: (b: Biomarkers) => number | null; label: string; unit: string; digits?: number }) {
  const points = run.trajectory.map(p => ({ t: p.t, a: pick(p.base), b: pick(p.plan) }));
  if (points.some(p => p.a === null || p.b === null)) return null;
  const values = points.flatMap(p => [p.a!, p.b!]);
  let low = Math.min(...values), high = Math.max(...values);
  const pad = Math.max((high - low) * 0.2, Math.abs(high) * 0.02, 10 ** -digits);
  low -= pad; high += pad;
  const W = 220, H = 92, L = 6, R = 214, T = 8, B = 70;
  const x = (t: number) => L + t / 5 * (R - L);
  const y = (v: number) => B - (v - low) / (high - low) * (B - T);
  const line = (k: 'a' | 'b') => points.map(p => `${x(p.t).toFixed(1)},${y(p[k]!).toFixed(1)}`).join(' ');
  const last = points.at(-1)!, first = points[0]!;
  const changed = points.some(p => Math.abs(p.b! - p.a!) >= 10 ** -digits / 2);
  return <figure className="marker-chart">
    <figcaption><span>{label}</span><b>{last.b!.toFixed(digits)} <small>{unit}</small></b></figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: now ${first.a!.toFixed(digits)}, year 5 ${last.a!.toFixed(digits)} without change, ${last.b!.toFixed(digits)} with plan`}>
      <path d={`M${L} ${B}H${R}`} stroke="var(--line)" />
      {[0, 1, 2, 3, 4, 5].map(year => <text key={year} x={x(year)} y={H - 6} textAnchor={year === 0 ? 'start' : year === 5 ? 'end' : 'middle'}>{year === 0 ? 'now' : year + 'y'}</text>)}
      <polyline points={line('a')} className="line-base" />
      {changed && <polyline points={line('b')} className="line-plan" />}
      <circle cx={x(5)} cy={y(last.b!)} r="3.2" className="dot-plan" />
    </svg>
    <p className="muted">{changed ? <>Year 5: {last.a!.toFixed(digits)} → <b>{last.b!.toFixed(digits)}</b></> : <>Year 5: {last.a!.toFixed(digits)} · no change</>}</p>
  </figure>;
}

function organSummary(run: ForecastRun, organ: Organ, t: Translate, lang: Lang): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  const outcome = (ids: string[]) => run.outcomes.find(o => ids.includes(o.id));
  const rel = (id: string) => run.relative.find(r => r.id === id);
  const toneOf = (d: number) => d < -0.002 ? 'good' : d > 0.002 ? 'bad' : 'neutral';
  const y5 = run.trajectory.at(-1)!;
  if (organ === 'heart') {
    const o = outcome(['chd', 'cvd', 'death']);
    if (o) { const d = o.plan.at(-1)! - o.base.at(-1)!; return { text: `${outcomeLabel(o.id, lang)}: ${pct(o.base.at(-1)!)} → ${pct(o.plan.at(-1)!)}`, tone: toneOf(d) }; }
  }
  if (organ === 'brain') {
    const o = outcome(['stroke']);
    if (o) { const d = o.plan.at(-1)! - o.base.at(-1)!; return { text: `${outcomeLabel('stroke', lang)}: ${pct(o.base.at(-1)!)} → ${pct(o.plan.at(-1)!)}`, tone: toneOf(d) }; }
    return { text: t('No stroke model for this condition', 'Bu holat uchun insult modeli yo‘q'), tone: 'neutral' };
  }
  if (organ === 'kidneys') {
    const o = outcome(['kidney']);
    const e = y5.base.egfr !== null ? `eGFR ${y5.base.egfr.toFixed(0)} → ${y5.plan.egfr!.toFixed(0)}` : '';
    if (o) return { text: `${e} · ${t('kidney failure', 'buyrak yetishmovchiligi')} ${pct(o.base.at(-1)!)} → ${pct(o.plan.at(-1)!)}`, tone: toneOf(o.plan.at(-1)! - o.base.at(-1)!) };
    const r = rel('kidney');
    if (r) return { text: `${e} · ${t('kidney progression', 'buyrak kasalligi zo‘rayishi')} ${Math.round((r.rr - 1) * 100)}%`, tone: r.rr < 1 ? 'good' : 'bad' };
    if (e) return { text: e + ' mL/min/1.73 m²', tone: toneOf(((y5.base.egfr ?? 0) - (y5.plan.egfr ?? 0)) / 100) };
  }
  if (organ === 'eyes') {
    const r = rel('microvascular');
    if (r) return { text: `${t('Eye/nerve/kidney small-vessel damage', 'Ko‘z/nerv/buyrak mayda tomir shikasti')} ${r.rr < 1 ? '−' : '+'}${Math.abs(Math.round((1 - r.rr) * 100))}%`, tone: r.rr < 1 ? 'good' : 'bad' };
    if (run.added.some(d => d.id === 'semaglutide')) return { text: t('Retinopathy: eye check advised (SUSTAIN-6)', 'Retinopatiya: ko‘z tekshiruvi tavsiya etiladi (SUSTAIN-6)'), tone: 'bad' };
  }
  if (organ === 'metabolism') {
    const parts: string[] = [];
    if (y5.base.hba1c !== null) parts.push(`HbA1c ${y5.base.hba1c.toFixed(1)} → ${y5.plan.hba1c!.toFixed(1)}%`);
    const dw = y5.plan.weight - y5.base.weight;
    if (Math.abs(dw) >= 0.5) parts.push(`${t('weight', 'vazn')} ${dw > 0 ? '+' : ''}${dw.toFixed(1)} kg`);
    if (parts.length) return { text: parts.join(' · '), tone: (y5.plan.hba1c ?? 0) < (y5.base.hba1c ?? 0) - 0.05 || dw < -0.5 ? 'good' : dw > 0.5 ? 'bad' : 'neutral' };
  }
  return { text: t('No modelled change', 'Modellashtirilgan o‘zgarish yo‘q'), tone: 'neutral' };
}

export function ForecastDashboard({ run, patient, plan, setPlan, t, lang, year5, setYear5, onFocus, onEdit }: {
  run: ForecastRun; patient: ClinicalPatient; plan: Plan; setPlan: (p: Plan) => void; t: Translate; lang: Lang;
  year5: boolean; setYear5: (v: boolean) => void; onFocus: (o: Organ) => void; onEdit: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const available = DRUGS.filter(d => d.conditions.includes(patient.condition));
  const changed = run.added.length + run.removed.length > 0;
  const organs: [Organ, string, typeof HeartPulse][] = [['heart', t('Heart', 'Yurak'), HeartPulse], ['brain', t('Brain', 'Miya'), Brain],
    ['kidneys', t('Kidneys', 'Buyraklar'), Pill], ['eyes', t('Eyes & nerves', 'Ko‘z va nervlar'), Eye], ['metabolism', t('Metabolism & weight', 'Moddalar almashinuvi va vazn'), PersonStanding]];
  const toggle = (id: string) => {
    if (patient.meds.includes(id)) setPlan({ ...plan, remove: plan.remove.includes(id) ? plan.remove.filter(x => x !== id) : [...plan.remove, id] });
    else setPlan({ ...plan, add: plan.add.includes(id) ? plan.add.filter(x => x !== id) : [...plan.add, id] });
  };
  if (run.missing.length) return <section className="chart-panel forecast-dashboard" data-testid="forecast-dashboard">
    <h2>{t('5-year forecast', '5 yillik prognoz')}</h2>
    <p className="notice">{t('Missing measurements: ', 'Yetishmayotgan o‘lchovlar: ')}{run.missing.join(', ')}. </p>
    <button className="primary" onClick={onEdit}>{t('Enter measurements', 'O‘lchovlarni kiritish')}</button>
  </section>;
  return <section className="chart-panel forecast-dashboard" data-testid="forecast-dashboard">
    <div className="fd-head">
      <div><p className="eyebrow">{patient.source}</p><h2>{changed ? t('5-year forecast: no change vs. new plan', '5 yillik prognoz: o‘zgarishsiz va yangi reja') : t('5-year forecast with current treatment', 'Joriy davolash bilan 5 yillik prognoz')}</h2></div>
      <label className="year5-toggle"><input type="checkbox" checked={year5} onChange={e => setYear5(e.target.checked)} />{t('Show body at year 5', '5-yildagi tanani ko‘rsatish')}</label>
    </div>
    <div className="plan-chips" aria-label={t('Treatment plan', 'Davolash rejasi')}>
      {patient.meds.map(id => <button key={id} className={plan.remove.includes(id) ? 'chip removed' : 'chip'} onClick={() => toggle(id)} title={t('Click to stop this medicine in the plan', 'Rejada bu dorini to‘xtatish uchun bosing')}>
        {DRUG_BY_ID[id]?.name ?? id}{plan.remove.includes(id) && <X size={12} />}</button>)}
      {run.added.map(d => <button key={d.id} className="chip added" onClick={() => toggle(plan.add.find(id => d.id === id) ?? d.id)}>+ {d.name}<X size={12} /></button>)}
      {run.blocked.map(d => <span key={d.id} className="chip blocked" title={run.checks.find(c => c.drug === d)?.stop.join(' ')}>⛔ {d.name}</span>)}
      <button className="chip add" onClick={() => setPicking(!picking)} aria-expanded={picking}><Plus size={13} />{t('Add or change medicine', 'Dori qo‘shish yoki o‘zgartirish')}</button>
      {changed && <button className="chip reset" onClick={() => setPlan({ add: [], remove: [] })}>{t('Reset plan', 'Rejani tiklash')}</button>}
    </div>
    {picking && <div className="drug-picker">{available.map(d => {
      const on = patient.meds.includes(d.id) ? !plan.remove.includes(d.id) : plan.add.includes(d.id);
      return <label key={d.id} className={on ? 'on' : ''}><input type="checkbox" checked={on} onChange={() => toggle(d.id)} />
        <span><b>{d.name}</b><small>{d.drugClass} · {d.dose}</small></span></label>;
    })}</div>}

    <div className="outcome-grid">{run.outcomes.map(o => {
      const base = o.base.at(-1)!, now = o.plan.at(-1)!, diff = now - base;
      const scale = Math.max(base, o.planHi, now, 0.02) * 1.15;
      return <article key={o.id} className="outcome-card" data-outcome={o.id} data-base={base} data-plan={now}>
        <header><h3>{outcomeLabel(o.id, lang)}</h3><span className="model-tag">{o.model}</span></header>
        <div className="risk-row"><span>{t('No change', 'O‘zgarishsiz')}</span><div className="bar"><i className="base" style={{ width: `${base / scale * 100}%` }} /></div><b>{pct(base)}</b></div>
        {changed && <div className="risk-row"><span>{t('With plan', 'Reja bilan')}</span><div className="bar"><i className={diff > 0.0005 ? 'worse' : 'plan'} style={{ width: `${now / scale * 100}%` }} />
          <em className="ci" style={{ left: `${o.planLo / scale * 100}%`, width: `${Math.max(0.5, (o.planHi - o.planLo) / scale * 100)}%` }} title="95% interval" /></div><b>{pct(now)}</b></div>}
        {changed && <p className={diff < -0.0005 ? 'delta good' : diff > 0.0005 ? 'delta bad' : 'delta'}>
          {Math.abs(diff) < 0.0005 ? t('No meaningful change', 'Sezilarli o‘zgarish yo‘q') : <>{diff < 0 ? '↓' : '↑'} {pct(Math.abs(diff))} {t('absolute', 'mutlaq')}
            {diff < 0 && <> · NNT ≈ {Math.round(1 / -diff)}</>}</>}
          <small> · 95% {pct(o.planLo)}–{pct(o.planHi)}</small></p>}
        {changed && <p className="muted small">{o.attributions.map(a => `${a.drug} HR ${a.direction === 'removed' ? (1 / a.hr).toFixed(2) : a.hr.toFixed(2)} (${a.trial})`).join(' · ')}
          {o.viaBiomarkers.length > 0 && <> {o.attributions.length ? '· ' : ''}{t('via biomarkers: ', 'biomarkerlar orqali: ')}{o.viaBiomarkers.join(', ')}</>}</p>}
        {o.approximate && <p className="muted small"><Info size={12} /> {o.approximate}</p>}
      </article>;
    })}</div>
    {changed && run.relative.length > 0 && <ul className="relative-list">{run.relative.map(r => <li key={r.id}>{relativeLine(r, lang)}</li>)}</ul>}

    <h3 className="fd-sub">{t('Body markers over 5 years', '5 yil davomida tana ko‘rsatkichlari')} <span className="legend-inline"><i className="lb" />{t('no change', 'o‘zgarishsiz')} <i className="lp" />{t('with plan', 'reja bilan')}</span></h3>
    <div className="marker-grid">
      <MarkerChart run={run} pick={b => b.hba1c} label="HbA1c" unit="%" />
      <MarkerChart run={run} pick={b => b.weight} label={t('Weight', 'Vazn')} unit="kg" />
      <MarkerChart run={run} pick={b => b.sbp} label={t('Systolic BP', 'Sistolik bosim')} unit="mmHg" digits={0} />
      <MarkerChart run={run} pick={b => b.ldl} label="LDL" unit="mmol/L" />
      <MarkerChart run={run} pick={b => b.egfr} label="eGFR" unit="mL/min" digits={0} />
      <MarkerChart run={run} pick={b => b.ef} label={t('Ejection fraction', 'Chiqarish fraksiyasi')} unit="%" digits={0} />
    </div>

    <h3 className="fd-sub">{t('Impact on organs', 'A’zolarga ta’siri')} <small className="muted">{t('Select to show in 3D', '3D da ko‘rish uchun tanlang')}</small></h3>
    <div className="organ-grid">{organs.map(([id, label, Icon]) => {
      const s = organSummary(run, id, t, lang);
      return <button key={id} className={'organ-card ' + s.tone} onClick={() => onFocus(id)}><Icon size={18} /><b>{label}</b><span>{s.text}</span></button>;
    })}</div>

    {run.checks.some(c => c.stop.length || c.warn.length) && <div className="checks">{run.checks.flatMap(c => [
      ...c.stop.map(s => <p key={c.drug.id + s} className="notice">⛔ {c.drug.name}: {s} {t('Not applied.', 'Qo‘llanmadi.')}</p>),
      ...c.warn.map(w => <p key={c.drug.id + w} className="notice warn">⚠ {c.drug.name}: {w}</p>)])}</div>}
    {patient.assumed.length > 0 && <p className="muted small">{t('Assumed because the source did not record them: ', 'Manbada qayd etilmagani uchun taxmin qilingan: ')}{patient.assumed.join('; ')}.</p>}
    <details className="method"><summary>{t('How this forecast is calculated', 'Prognoz qanday hisoblanadi')}</summary>
      <p>{t('Baseline risk comes from published, externally validated equations using this patient’s real measurements. Medicine effects come from randomised trials: when a trial measured the outcome directly, its hazard ratio is used; otherwise the medicine acts through the biomarkers it changes. The 95% interval reflects uncertainty in trial effects only.',
        'Boshlang‘ich xavf ushbu bemorning haqiqiy o‘lchovlari bilan nashr etilgan va tashqi tekshiruvdan o‘tgan tenglamalardan olinadi. Dori ta’siri randomizatsiyalangan sinovlardan: natija bevosita o‘lchangan bo‘lsa, xavf nisbati ishlatiladi; aks holda dori biomarkerlar orqali ta’sir qiladi. 95% oraliq faqat sinov ta’siri noaniqligini aks ettiradi.')}</p>
      <ul>{run.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
      {run.maggicPoints !== undefined && <p>MAGGIC {t('score', 'ball')}: {run.maggicPoints}</p>}
      <p className="notice">{t('Research and education prototype. Not a substitute for clinical judgement.', 'Tadqiqot va ta’lim prototipi. Klinik qaror o‘rnini bosmaydi.')}</p>
    </details>
  </section>;
}
