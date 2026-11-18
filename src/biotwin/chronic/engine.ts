// 5-year chronic-disease forecast: validated baseline risk equations + trial-derived medicine effects.
//
// Method (documented in docs/FORECAST_MODEL.md):
// 1. Biomarker trajectories (quarterly) for "no change" and "with plan" — natural history + placebo-adjusted drug effects.
// 2. Annual hazards from published equations evaluated on mid-year covariates
//    (T2D: UKPDS 56 CHD, UKPDS 60 stroke · T1D: Steno composite CVD · HF: MAGGIC all-cause death · CKD G3–5: KFRE).
// 3. For each outcome, a drug with a trial hazard ratio for that outcome acts through that HR; its biomarker changes are
//    then excluded from that outcome's equation (avoids double counting). Other drugs act only through biomarkers.
// 4. 95% uncertainty intervals: Monte Carlo over the trial HR confidence intervals (log-normal).
import { DRUG_BY_ID, type Drug, type HR, type Outcome } from './drugs';
import { albuminuriaCategory, ckdEpi2021, hba1cPercentToMmolMol, kfreHazard, maggicAnnualHazards, maggicPoints, stenoHazard, ukpdsChdHazard, ukpdsStrokeHazard, umolToMgDl } from './equations';
import type { ClinicalPatient } from './types';

export const HORIZON = 5;
const STEPS_PER_YEAR = 4;

export type Biomarkers = { hba1c: number | null; weight: number; sbp: number | null; ldl: number | null; totalChol: number | null; hdl: number | null; egfr: number | null; acr: number | null; ef: number | null };
export type TrajectoryPoint = { t: number; base: Biomarkers; plan: Biomarkers };
export type OutcomeId = 'chd' | 'stroke' | 'cvd' | 'kidney' | 'death' | 'hfHosp';
export type Attribution = { drug: string; hr: number; lo: number; hi: number; trial: string; direction: 'added' | 'removed' };
export type OutcomeResult = {
  id: OutcomeId; model: string; base: number[]; plan: number[]; planLo: number; planHi: number;
  attributions: Attribution[]; viaBiomarkers: string[]; approximate?: string;
};
export type RelativeResult = { id: 'death' | 'hfHosp' | 'microvascular' | 'kidney'; rr: number; lo: number; hi: number; sources: string; hba1cDiff?: number };
export type ForecastRun = {
  condition: ClinicalPatient['condition'];
  current: string[]; plan: string[]; added: Drug[]; removed: Drug[];
  trajectory: TrajectoryPoint[];
  outcomes: OutcomeResult[];
  relative: RelativeResult[];
  checks: { drug: Drug; stop: string[]; warn: string[] }[];
  blocked: Drug[];
  missing: string[];
  maggicPoints?: number;
  assumptions: string[];
};

// ---------- natural history ----------
const HBA1C_DRIFT_T2D = 0.15; // %/year with unchanged therapy (UKPDS 33 conventional-arm progression)
const egfrSlope = (acr: number | null) => ({ normal: -1.0, micro: -2.0, macro: -4.6 })[albuminuriaCategory(acr)];
const ramp = (t: number, months = 6) => Math.min(1, t / (months / 12));

// ---------- statins act through LDL lowering (CTT 2010, per 1 mmol/L) ----------
const CTT = { chd: [0.76, 0.73, 0.79], mace: [0.78, 0.76, 0.8], stroke: [0.85, 0.8, 0.89], death: [0.9, 0.87, 0.93] } as const;

function outcomeHR(drug: Drug, p: ClinicalPatient, outcome: Outcome): HR | null {
  if (drug.effects.ldlPct && p.ldl !== null) {
    const key = outcome === 'chd' || outcome === 'mace' || outcome === 'stroke' || outcome === 'death' ? outcome : null;
    if (!key) return null;
    const delta = p.ldl * -drug.effects.ldlPct / 100;
    const [hr, lo, hi] = CTT[key];
    return { hr: hr ** delta, lo: lo ** delta, hi: hi ** delta, trial: `CTT meta-analysis (${delta.toFixed(1)} mmol/L lower LDL)` };
  }
  if (drug.outcomeWhen && !drug.outcomeWhen(p)) return null;
  return drug.outcomes[outcome] ?? null;
}

/** Which trial outcome keys stand in for an engine outcome, in order of preference. */
const outcomeKeys: Record<OutcomeId, Outcome[]> = {
  chd: ['chd', 'mace'], stroke: ['stroke', 'mace'], cvd: ['mace'], kidney: ['kidney'], death: ['death'], hfHosp: ['hfHosp'],
};

type Regimen = { added: Drug[]; removed: Drug[]; replacedSilently: string[] };

function buildRegimen(current: string[], add: string[], remove: string[]): Regimen {
  const replacedSilently: string[] = [];
  const added = add.map(id => DRUG_BY_ID[id]).filter((d): d is Drug => !!d && !current.includes(d.id)).map(d => {
    replacedSilently.push(...(d.replaces ?? []).filter(r => current.includes(r)));
    // A new statin is a switch: only the extra LDL lowering beyond the current statin counts.
    const old = d.effects.ldlPct ? current.map(id => DRUG_BY_ID[id]).find(x => x?.effects.ldlPct) : undefined;
    if (!d.effects.ldlPct || !old) return d;
    replacedSilently.push(old.id);
    const incremental = ((1 + d.effects.ldlPct / 100) / (1 + old.effects.ldlPct! / 100) - 1) * 100;
    return { ...d, name: `${d.name} (instead of ${old.name})`, effects: { ...d.effects, ldlPct: incremental } };
  });
  const removed = remove.map(id => DRUG_BY_ID[id]).filter((d): d is Drug => !!d && current.includes(d.id) && !replacedSilently.includes(d.id));
  return { added, removed, replacedSilently };
}

function scaleHbA1c(drug: Drug, p: ClinicalPatient) {
  if (!drug.effects.hba1c || p.hba1c === null) return 0;
  let effect = drug.effects.hba1c * Math.min(1.25, Math.max(0.25, (p.hba1c - 6) / 2));
  if (drug.drugClass === 'SGLT2 inhibitor' && p.egfr !== null) effect *= p.egfr < 30 ? 0.1 : p.egfr < 45 ? 0.4 : 1;
  return effect;
}
const scaleSbp = (drug: Drug, p: ClinicalPatient) => !drug.effects.sbp || p.sbp === null ? 0 : drug.effects.sbp * Math.min(1.3, Math.max(0.25, (p.sbp - 110) / 44));

/** Biomarkers at time t (years). `exclude` drops drugs whose effect is carried by a trial HR instead. */
function biomarkersAt(p: ClinicalPatient, t: number, reg: Regimen | null, exclude: Set<string> = new Set()): Biomarkers {
  const drift = p.condition === 't2d' ? HBA1C_DRIFT_T2D * t : 0;
  const out: Biomarkers = {
    hba1c: p.hba1c === null ? null : p.hba1c + drift, weight: p.weightKg, sbp: p.sbp, ldl: p.ldl,
    totalChol: p.totalChol, hdl: p.hdl, egfr: p.egfr, acr: p.acr, ef: p.ef,
  };
  let slopeFactor = 1, dip = 0;
  if (reg) {
    const signed: [Drug, number][] = [...reg.added.map(d => [d, 1] as [Drug, number]), ...reg.removed.map(d => [d, -1] as [Drug, number])];
    for (const [drug, sign] of signed) {
      if (exclude.has(drug.id)) continue;
      const r = ramp(t), e = drug.effects;
      if (out.hba1c !== null) {
        const delta = sign * scaleHbA1c(drug, p) * r;
        out.hba1c = drug.id === 'glargine' || drug.id === 'intensiveInsulin' ? Math.max(Math.min(out.hba1c, 7), out.hba1c + delta) : out.hba1c + delta;
      }
      if (e.weightKg) out.weight += sign * e.weightKg * ramp(t, 12);
      if (out.sbp !== null) out.sbp += sign * scaleSbp(drug, p) * r;
      if (e.ldlPct && out.ldl !== null) {
        const drop = p.ldl! * (e.ldlPct / 100) * r * sign;
        out.ldl += drop;
        if (out.totalChol !== null) out.totalChol += drop;
      }
      if (e.acrPct && out.acr !== null) out.acr *= (1 + sign * e.acrPct / 100 * r);
      if (e.efPoints && out.ef !== null) out.ef = Math.min(70, out.ef + sign * e.efPoints * ramp(t, 12));
      if (e.egfrSlopeFactor) slopeFactor *= sign > 0 ? e.egfrSlopeFactor : 1 / e.egfrSlopeFactor;
      if (e.egfrDip) dip += sign * e.egfrDip * Math.min(1, t / 0.25);
    }
  }
  if (out.egfr !== null) out.egfr = Math.max(5, out.egfr + egfrSlope(p.acr) * slopeFactor * t + dip);
  return out;
}

function trajectory(p: ClinicalPatient, reg: Regimen): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  for (let i = 0; i <= HORIZON * STEPS_PER_YEAR; i++) {
    const t = i / STEPS_PER_YEAR;
    points.push({ t, base: biomarkersAt(p, t, null), plan: biomarkersAt(p, t, reg) });
  }
  return points;
}

// ---------- seeded RNG for reproducible uncertainty intervals ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function normal(r: () => number) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const sampleHR = (h: { hr: number; lo: number; hi: number }, z: number) => Math.exp(Math.log(h.hr) + z * (Math.log(h.hi) - Math.log(h.lo)) / 3.92);
const cumulative = (hazards: number[]) => { let H = 0; return hazards.map(h => (H += h, 1 - Math.exp(-H))); };
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!; };

type HazardFn = (b: Biomarkers, year: number) => number;

function runOutcome(id: OutcomeId, model: string, p: ClinicalPatient, reg: Regimen, hazard: HazardFn, approximate?: string): OutcomeResult {
  const attributions: Attribution[] = [];
  const carried = new Set<string>();
  const hrs: { hr: HR; sign: number }[] = [];
  const consider = (drug: Drug, sign: number) => {
    for (const key of outcomeKeys[id]) {
      let hr = outcomeHR(drug, p, key);
      if (!hr) continue;
      // An ARNI's trial HR is versus an ACE inhibitor; if the patient was not on one, add the ACE-inhibitor effect too.
      if (sign > 0 && drug.relativeToReplaced && !(drug.replaces ?? []).some(r => p.meds.includes(r))) {
        const ref = DRUG_BY_ID.enalaprilHF?.outcomes[key];
        if (ref) hr = { hr: hr.hr * ref.hr, lo: hr.lo * ref.lo, hi: hr.hi * ref.hi, trial: `${hr.trial} × ${ref.trial}` };
      }
      carried.add(drug.id);
      hrs.push({ hr, sign });
      attributions.push({ drug: drug.name, ...hr, direction: sign > 0 ? 'added' : 'removed' });
      return;
    }
  };
  reg.added.forEach(d => consider(d, 1));
  reg.removed.forEach(d => consider(d, -1));
  const viaBiomarkers = [...reg.added, ...reg.removed].filter(d => !carried.has(d.id) &&
    (d.effects.hba1c || d.effects.sbp || d.effects.ldlPct || d.effects.acrPct)).map(d => d.name);
  const years = [...Array(HORIZON).keys()];
  const baseH = years.map(y => hazard(biomarkersAt(p, y + 0.5, null), y));
  const planBiomarkerH = years.map(y => hazard(biomarkersAt(p, y + 0.5, reg, carried), y));
  const multiplier = (zs: number[] | null) => hrs.reduce((m, { hr, sign }, i) => m * (zs ? sampleHR(hr, zs[i]!) : hr.hr) ** sign, 1);
  const plan = cumulative(planBiomarkerH.map(h => h * multiplier(null)));
  const r = rng(0x5eed + id.length * 97 + hrs.length);
  const samples: number[] = [];
  for (let s = 0; s < (hrs.length ? 400 : 0); s++) {
    const m = multiplier(hrs.map(() => normal(r)));
    samples.push(cumulative(planBiomarkerH.map(h => h * m)).at(-1)!);
  }
  return {
    id, model, base: cumulative(baseH), plan,
    planLo: samples.length ? quantile(samples, 0.025) : plan.at(-1)!, planHi: samples.length ? quantile(samples, 0.975) : plan.at(-1)!,
    attributions, viaBiomarkers, approximate,
  };
}

function relativeEffect(id: RelativeResult['id'], p: ClinicalPatient, reg: Regimen): RelativeResult | null {
  const hrs: { hr: HR; sign: number }[] = [];
  for (const [list, sign] of [[reg.added, 1], [reg.removed, -1]] as const) for (const d of list) {
    const hr = outcomeHR(d, p, id);
    if (hr) hrs.push({ hr, sign });
  }
  if (!hrs.length) return null;
  const rr = hrs.reduce((m, { hr, sign }) => m * hr.hr ** sign, 1);
  const r = rng(0xabc + hrs.length);
  const samples = Array.from({ length: 400 }, () => hrs.reduce((m, { hr, sign }) => m * sampleHR(hr, normal(r)) ** sign, 1));
  return { id, rr, lo: quantile(samples, 0.025), hi: quantile(samples, 0.975), sources: hrs.map(h => h.hr.trial).join(', ') };
}

export function missingInputs(p: ClinicalPatient): string[] {
  const need: [keyof ClinicalPatient, string][] = p.condition === 'hf'
    ? [['ef', 'Ejection fraction'], ['sbp', 'Systolic blood pressure'], ['creatinine', 'Serum creatinine'], ['nyha', 'NYHA class']]
    : p.condition === 't2d'
      ? [['hba1c', 'HbA1c'], ['sbp', 'Systolic blood pressure'], ['totalChol', 'Total cholesterol'], ['hdl', 'HDL cholesterol'], ['durationYears', 'Diabetes duration']]
      : [['hba1c', 'HbA1c'], ['sbp', 'Systolic blood pressure'], ['ldl', 'LDL cholesterol'], ['egfr', 'eGFR'], ['durationYears', 'Diabetes duration']];
  return need.filter(([k]) => p[k] === null || p[k] === undefined).map(([, label]) => label);
}

export function forecast(p: ClinicalPatient, add: string[] = [], remove: string[] = []): ForecastRun {
  const first = buildRegimen(p.meds, add, remove);
  const draftPlan = [...p.meds.filter(m => !first.removed.some(d => d.id === m) && !first.replacedSilently.includes(m)), ...first.added.map(d => d.id)];
  const checks = first.added.map(drug => ({ drug, ...drug.check(p, draftPlan.filter(id => id !== drug.id)) }));
  // Medicines with a hard stop for this patient are reported but not applied.
  const blocked = checks.filter(c => c.stop.length).map(c => c.drug);
  const reg = buildRegimen(p.meds, first.added.filter(d => !blocked.includes(d)).map(d => d.id), remove);
  const plan = [...p.meds.filter(m => !reg.removed.some(d => d.id === m) && !reg.replacedSilently.includes(m)), ...reg.added.map(d => d.id)];
  const missing = missingInputs(p);
  const outcomes: OutcomeResult[] = [];
  const relative: RelativeResult[] = [];
  const assumptions: string[] = [
    'Covariates not changed by the plan are held at baseline; HbA1c drifts +0.15%/year in type 2 diabetes with unchanged therapy (UKPDS).',
    'eGFR declines 1.0, 2.0 or 4.6 mL/min/1.73 m² per year for normal, micro- or macro-albuminuria.',
    'Medicine effects reach full size by 6 months (weight and ejection fraction by 12 months) and assume continued adherence.',
    'Drug effects are combined multiplicatively; competing risks are ignored.',
  ];
  const male = p.sex === 'male';
  const meanHbA1cDiff = () => {
    const tr = trajectory(p, reg);
    return tr.reduce((s, x) => s + ((x.base.hba1c ?? 0) - (x.plan.hba1c ?? 0)), 0) / tr.length;
  };

  if (missing.length === 0 && p.condition === 't2d') {
    const ukpds = (b: Biomarkers, y: number) => ({ age: p.age + y, female: !male, smoker: p.smoker, hba1c: b.hba1c!, sbp: b.sbp!,
      tcHdlRatio: b.totalChol! / b.hdl!, durationYears: p.durationYears!, atrialFibrillation: p.atrialFibrillation });
    outcomes.push(runOutcome('chd', 'UKPDS 56', p, reg, (b, y) => ukpdsChdHazard(ukpds(b, y), p.durationYears! + y)));
    outcomes.push(runOutcome('stroke', 'UKPDS 60', p, reg, (b, y) => ukpdsStrokeHazard(ukpds(b, y), p.durationYears! + y)));
    if (p.priorCvd) assumptions.push('UKPDS equations were derived in people without prior cardiovascular disease; risk is likely underestimated.');
  }
  if (missing.length === 0 && p.condition === 't1d') {
    if (p.priorCvd) assumptions.push('Steno equation excludes prior cardiovascular disease; composite CVD forecast not shown.');
    else outcomes.push(runOutcome('cvd', 'Steno Type 1 Risk Engine', p, reg, (b, y) => stenoHazard({
      age: p.age + y, female: !male, durationYears: p.durationYears! + y, sbp: b.sbp!, ldl: b.ldl!, hba1cMmolMol: hba1cPercentToMmolMol(b.hba1c!),
      albuminuria: albuminuriaCategory(b.acr), egfr: p.egfr!, smoker: p.smoker, exercise: p.exercise })));
  }
  if (missing.length === 0 && p.condition === 'hf') {
    const bmi = p.weightKg / (p.heightCm / 100) ** 2;
    const points = maggicPoints({ age: p.age, male, ef: p.ef!, sbp: p.sbp!, bmi, creatinineUmol: p.creatinine!, nyha: p.nyha!, smoker: p.smoker,
      diabetes: p.diabetes, copd: p.copd, hfOver18Months: p.hfOver18Months,
      betaBlocker: p.meds.includes('bisoprolol'), aceiOrArb: p.meds.some(m => ['ramipril', 'losartan', 'enalaprilHF', 'sacubitrilValsartan'].includes(m)) });
    const annual = maggicAnnualHazards(points);
    outcomes.push(runOutcome('death', 'MAGGIC', p, reg, (_b, y) => annual[y]!));
    outcomes.push(runOutcome('hfHosp', 'MAGGIC-scaled', p, reg, (_b, y) => annual[y]!,
      'Heart-failure admission hazard assumed equal to the mortality hazard (ratio 0.9–1.2 in PARADIGM-HF and DAPA-HF control arms).'));
    assumptions.push('MAGGIC predicts 1- and 3-year mortality; years 4–5 extend the year 2–3 hazard.');
    return finish(points);
  }
  // Kidney failure (any condition) — KFRE only for CKD G3–G5 with a measured ACR.
  if (p.egfr !== null && p.egfr < 60 && p.acr !== null && p.condition !== 'hf') {
    outcomes.push(runOutcome('kidney', 'KFRE 4-variable', p, reg, b => kfreHazard(p.age, male, p.egfr!, b.acr ?? p.acr!)));
  }
  if (p.condition === 't2d') {
    for (const id of ['death', 'hfHosp'] as const) { const r = relativeEffect(id, p, reg); if (r) relative.push(r); }
    if (!(p.egfr !== null && p.egfr < 60 && p.acr !== null)) { const r = relativeEffect('kidney', p, reg); if (r) relative.push(r); }
    const diff = meanHbA1cDiff();
    if (Math.abs(diff) > 0.05) relative.push({ id: 'microvascular', rr: 0.63 ** diff, lo: 0.59 ** diff, hi: 0.67 ** diff,
      sources: 'UKPDS 35', hba1cDiff: diff });
  }
  if (p.condition === 't1d') {
    const insulin = reg.added.find(d => d.id === 'intensiveInsulin');
    if (insulin) { const h = insulin.outcomes.microvascular!; relative.push({ id: 'microvascular', rr: h.hr, lo: h.lo, hi: h.hi, sources: h.trial }); }
  }
  return finish();

  function finish(points?: number): ForecastRun {
    return { condition: p.condition, current: p.meds, plan, added: reg.added, removed: reg.removed, trajectory: trajectory(p, reg),
      outcomes, relative, checks, blocked, missing, maggicPoints: points, assumptions };
  }
}

/** Creatinine-derived eGFR helper for data entry. */
export const egfrFromCreatinine = (umol: number, age: number, sex: 'female' | 'male') => ckdEpi2021(umolToMgDl(umol), age, sex);
