import { describe, expect, it } from 'vitest';
import { forecast } from '../src/biotwin/chronic/engine';
import { answer, looksUzbek } from '../src/biotwin/chronic/chat';
import { findDrugs, DRUGS } from '../src/biotwin/chronic/drugs';
import { ckdEpi2021, kfre5y, maggicAnnualHazards, maggicPoints, MAGGIC_TABLE, ukpdsChdHazard } from '../src/biotwin/chronic/equations';
import { ClinicalSchema, type ClinicalPatient } from '../src/biotwin/chronic/types';
import featured from '../src/biotwin/chronic/data/featured.json';
import calibration from '../src/biotwin/chronic/data/calibration.json';
import { clinicalPatient, initialProfile } from '../src/biotwin/model';

type Rec = { condition: 't2d' | 't1d' | 'hf'; age: number; sex: 'female' | 'male'; weightKg: number; heightCm: number; clinical: unknown };
const patient = (r: Rec): ClinicalPatient => ({ ...ClinicalSchema.parse(r.clinical), condition: r.condition, age: r.age, sex: r.sex, weightKg: r.weightKg, heightCm: r.heightCm });
const t2d = patient(featured.t2d[0] as Rec);
const ckd = patient(featured.t2d[1] as Rec);
const hf = patient(featured.hf[0] as Rec);
const t1d = patient(featured.t1d[0] as Rec);

describe('published risk equations', () => {
  it('UKPDS 56 reproduces the reference 10-year CHD risk at the centring values', () => {
    // 55-year-old man, non-smoker, at centre HbA1c/SBP/lipid ratio, newly diagnosed: R = 1 − exp(−q (1 − d^10)/(1 − d))
    const x = { age: 55, female: false, smoker: false, hba1c: 6.715889, sbp: 135.679146, tcHdlRatio: Math.exp(1.590903), durationYears: 0 };
    let H = 0;
    for (let y = 0; y < 10; y++) H += ukpdsChdHazard(x, y);
    expect(1 - Math.exp(-H)).toBeCloseTo(1 - Math.exp(-0.011196554 * (1 - 1.077529237 ** 10) / (1 - 1.077529237)), 10);
    expect(1 - Math.exp(-H)).toBeGreaterThan(0.14);
    expect(1 - Math.exp(-H)).toBeLessThan(0.16);
  });
  it('MAGGIC points and table match the published calculator', () => {
    expect(MAGGIC_TABLE).toHaveLength(51);
    expect(MAGGIC_TABLE[22]).toEqual([12.2, 29.2]);
    // 60-y man, EF 25, SBP 115, BMI 23, creatinine 120, NYHA III, no BB → 5+2+4+3+2+6+1+3 = 26 points
    expect(maggicPoints({ age: 60, male: true, ef: 25, sbp: 115, bmi: 23, creatinineUmol: 120, nyha: 3, smoker: false, diabetes: false,
      copd: false, hfOver18Months: false, betaBlocker: false, aceiOrArb: true })).toBe(26);
    const h = maggicAnnualHazards(26);
    expect(1 - Math.exp(-h[0]!)).toBeCloseTo(0.175, 6);
    expect(1 - Math.exp(-(h[0]! + h[1]! + h[2]!))).toBeCloseTo(0.397, 6);
  });
  it('CKD-EPI 2021 and KFRE behave as published', () => {
    expect(ckdEpi2021(1.0, 50, 'male')).toBeCloseTo(91.7, 0);
    expect(ckdEpi2021(1.0, 50, 'female')).toBeCloseTo(68.6, 0);
    expect(kfre5y(60, true, 30, 300)).toBeGreaterThan(kfre5y(60, true, 45, 300));
    expect(kfre5y(60, true, 30, 1000)).toBeGreaterThan(kfre5y(60, true, 30, 30));
  });
});

describe('5-year medicine forecast on real patients', () => {
  it('ships real NHANES and UCI records with full inputs', () => {
    expect(t2d.source).toMatch(/NHANES 2017–2020/);
    expect(hf.source).toMatch(/UCI Heart Failure/);
    expect(forecast(t2d).missing).toEqual([]);
    expect(forecast(hf).missing).toEqual([]);
    expect(forecast(t1d).missing).toEqual([]);
  });
  it('lowers heart risk with an SGLT2 inhibitor and reports the trial evidence', () => {
    const run = forecast(t2d, ['empagliflozin']);
    const chd = run.outcomes.find(o => o.id === 'chd')!;
    expect(chd.plan.at(-1)!).toBeLessThan(chd.base.at(-1)!);
    expect(chd.planLo).toBeLessThan(chd.plan.at(-1)!);
    expect(chd.attributions[0]).toMatchObject({ trial: 'EMPA-REG OUTCOME', hr: 0.86 });
    expect(run.relative.find(r => r.id === 'hfHosp')!.rr).toBeCloseTo(0.65);
    expect(run.trajectory.at(-1)!.plan.weight).toBeLessThan(run.trajectory.at(-1)!.base.weight);
    expect(run.trajectory.at(-1)!.plan.hba1c!).toBeLessThan(run.trajectory.at(-1)!.base.hba1c!);
  });
  it('uses KFRE for CKD and slows eGFR decline with dapagliflozin', () => {
    const run = forecast(ckd, ['dapagliflozin']);
    const kidney = run.outcomes.find(o => o.id === 'kidney')!;
    expect(kidney.model).toBe('KFRE 4-variable');
    expect(kidney.plan.at(-1)!).toBeLessThan(kidney.base.at(-1)!);
    expect(run.trajectory.at(-1)!.plan.egfr!).toBeGreaterThan(run.trajectory.at(-1)!.base.egfr!);
  });
  it('treats a second statin as a switch and blocks unsafe combinations', () => {
    const run = forecast(t2d, ['atorvastatin80']);
    expect(run.added[0]!.name).toMatch(/instead of Atorvastatin 20/);
    expect(run.added[0]!.effects.ldlPct!).toBeGreaterThan(-20);
    const unsafe = forecast(t2d, ['ramipril']); // already on losartan
    expect(unsafe.blocked.map(d => d.id)).toEqual(['ramipril']);
    expect(unsafe.added).toEqual([]);
  });
  it('combines heart-failure therapies multiplicatively with MAGGIC', () => {
    const one = forecast(hf, ['bisoprolol']).outcomes.find(o => o.id === 'death')!;
    const four = forecast(hf, ['bisoprolol', 'sacubitrilValsartan', 'spironolactone', 'dapagliflozinHF']).outcomes.find(o => o.id === 'death')!;
    expect(one.plan.at(-1)!).toBeLessThan(one.base.at(-1)!);
    expect(four.plan.at(-1)!).toBeLessThan(one.plan.at(-1)!);
  });
  it('keeps T1D on the Steno engine', () => {
    const run = forecast(t1d, ['intensiveInsulin']);
    expect(run.outcomes[0]!.model).toBe('Steno Type 1 Risk Engine');
    expect(run.relative.find(r => r.id === 'microvascular')!.rr).toBeCloseTo(0.39);
  });
  it('documents the MAGGIC calibration gap on real UCI outcomes', () => {
    expect(calibration.overall.observed).toBeGreaterThan(calibration.overall.predicted);
    expect(calibration.byThird.map(g => g.observed)).toEqual([...calibration.byThird.map(g => g.observed)].sort((a, b) => a - b));
  });
  it('builds profiles from featured real patients', () => {
    const p = clinicalPatient(initialProfile('heart'))!;
    expect(p.condition).toBe('hf');
    expect(p.ef).not.toBeNull();
  });
});

describe('forecast chatbot', () => {
  it('recognises English, Uzbek, Russian and brand names', () => {
    expect(findDrugs('добавить джардинс', 't2d').map(d => d.id)).toEqual(['empagliflozin']);
    expect(findDrugs('semaglutid va lozartan', 't2d').map(d => d.id)).toEqual(['semaglutide', 'losartan']);
    expect(findDrugs('carbohydrates', 't2d')).toEqual([]);
    expect(looksUzbek('Semaglutid qo‘shsam nima bo‘ladi?')).toBe(true);
    expect(looksUzbek('Add valsartan')).toBe(false);
  });
  it('answers from model output only', () => {
    const a = answer('Add empagliflozin', t2d, 'en');
    expect(a.kind).toBe('forecast');
    expect(a.runs[0]!.run.added[0]!.id).toBe('empagliflozin');
    const chd = a.runs[0]!.run.outcomes.find(o => o.id === 'chd')!;
    expect(a.text.join(' ')).toContain((chd.plan.at(-1)! * 100).toFixed(1) + '%');
  });
  it('compares options and handles unknown medicines', () => {
    const c = answer('Compare semaglutide vs sitagliptin', t2d, 'en');
    expect(c.kind).toBe('compare');
    expect(c.runs).toHaveLength(2);
    expect(answer('add warfarin', t2d, 'en').kind).toBe('unknown');
    expect(answer('Side effects of finerenone', t2d, 'en').kind).toBe('adverse');
    expect(answer('Semaglutid va sitagliptinni taqqoslang', t2d, 'en').text[0]).toMatch(/yonma-yon/);
  });
  it('every catalogue medicine has outcomes or biomarker effects and side effects in both languages', () => {
    for (const d of DRUGS) {
      expect(d.adverse.length).toBe(d.adverseUz.length);
      expect(Object.keys(d.outcomes).length + Object.keys(d.effects).length).toBeGreaterThan(0);
    }
  });
});
