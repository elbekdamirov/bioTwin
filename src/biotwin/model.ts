import { z } from 'zod';
import featured from './chronic/data/featured.json';
import { ClinicalSchema, emptyClinical, type ChronicCondition, type ClinicalPatient } from './chronic/types';
import { ProfileSchema as profileSchema } from './records/schema';
import { SCENARIOS } from '@/sim/scenarios/library';
import { validateScenario } from '@/sim/scenarios/schema';
import { DRUG_MAP } from '@/sim/pharmacology/drugs';
import { SimActionSchema, type SimAction } from '@/sim/interventions/actions';
import type { SimSnapshot } from '@/sim/engine/snapshot';

export const modelVersion = 'BioTwin 2.0 / chronic forecast engine 1 / Vitalis engine schema 1';
export const presets = {
  t2d: { title: 'Type 2 diabetes', note: 'Real NHANES patients · 5-year heart, stroke and kidney forecast', age: 60, sex: 'female', height: 160, weight: 80, history: 'Type 2 diabetes.' },
  diabetes: { title: 'Type 1 diabetes', note: 'Real NHANES patient · Steno 5-year CVD forecast', age: 28, sex: 'female', height: 165, weight: 62, history: 'Type 1 diabetes.' },
  heart: { title: 'Heart failure', note: 'Real UCI hospital patients · 5-year survival forecast', age: 64, sex: 'male', height: 173, weight: 78, history: 'Heart failure with reduced ejection fraction.' },
} as const;
export type Profile = z.infer<typeof profileSchema>;
export type Preset = Profile['preset'];

/** The long-term condition the 5-year forecast models for a preset (asthma has none). */
export const conditionOf = (preset: Preset): ChronicCondition | null => ({ t2d: 't2d', diabetes: 't1d', heart: 'hf' } as const)[preset];

type FeaturedRecord = { id: string; condition: string; age: number; sex: 'female' | 'male'; heightCm: number; weightKg: number; clinical: unknown };
export const featuredPatients = featured as unknown as Record<ChronicCondition, FeaturedRecord[]>;

/** Builds a profile from a real de-identified record (NHANES or UCI). */
export function profileFromRecord(record: FeaturedRecord, preset: Preset): Profile {
  const clinical = ClinicalSchema.parse(record.clinical);
  const base = initialProfile(preset, false);
  return { ...base, displayName: record.id, seed: record.id, age: Math.max(18, Math.min(95, Math.round(record.age))), sex: record.sex,
    height: record.heightCm, weight: record.weightKg, clinical, history: presets[preset].history + ' Source: ' + clinical.source + '.',
    currentMedicines: clinical.recordedMeds.join(', ').slice(0, 1000) };
}

export function initialProfile(preset: Preset, real = true): Profile {
  const condition = conditionOf(preset);
  const record = real && condition ? featuredPatients[condition][0] : undefined;
  if (record) return profileFromRecord(record, preset);
  const { age, sex, height, weight, history } = presets[preset];
  return { patientId:null, displayName:'New patient', preset, age, sex, height, weight, history, seed: 'BT-012', activity: 'moderate', lab: '', drugAllergies: '', currentMedicines: '', labNotes: '', lifestyleNotes: '', genetics: {status:'not-tested',gene:'',variant:'',classification:'unknown',source:'',familyHistory:''}, forecast: null, clinical: null };
}

/** Demographics + clinical baseline for the forecast engine, or null for presets without a chronic model. */
export function clinicalPatient(profile: Profile): ClinicalPatient | null {
  const condition = conditionOf(profile.preset);
  if (!condition) return null;
  return { ...(profile.clinical ?? emptyClinical()), condition, age: profile.age, sex: profile.sex, weightKg: profile.weight, heightCm: profile.height };
}

export function parseProfile(input: unknown): Profile {
  const profile = profileSchema.parse(input);
  const bmi = profile.weight / (profile.height / 100) ** 2;
  if (bmi < 16 || bmi > 50) throw new Error('Height and weight must give a synthetic BMI between 16 and 50.');
  return profile;
}

export function makeScenario(input: Profile) {
  const profile = parseProfile(input);
  const source = SCENARIOS.find(s => s.pathologies.some(p => p.type === (profile.preset === 'diabetes' || profile.preset === 't2d' ? 'dka' : 'asthma')))!;
  const fitness = { low: 0.2, moderate: 0.5, high: 0.8 }[profile.activity];
  const scenario = {
    ...source,
    id: 'biotwin-' + profile.preset,
    source: 'custom',
    ...(profile.preset === 't2d' ? {
      title: 'Stable type 2 diabetes', tagline: 'Chronic metabolic physiology', hiddenDiagnosis: 'Type 2 diabetes', diagnosisKeywords: ['t2dm'], differentials: [],
      patientKnowledge: {story:profile.history,symptoms:[],ifAsked:[],conceals:[],personality:'cooperative'},
      learningObjectives: ['Observe short-term glucose and potassium responses to insulin in stable type 2 diabetes.'],
      keyEvidence: ['Required type2Diabetes history lowers insulin sensitivity and beta-cell function in the engine.'],
      debriefNotes: ['Stable outpatient physiology. Long-term outcomes come from the separate 5-year forecast engine.'], authoredFindings: {exam:[]},
    } : {}),
    ...(profile.preset === 'heart' ? {
      title: 'Reduced pump function', tagline: 'Chronic cardiac physiology experiment',
      hiddenDiagnosis: 'Chronic heart failure with reduced pump function',
      diagnosisKeywords: ['hfref'], differentials: [],
      patientKnowledge: {story:profile.history,symptoms:[],ifAsked:[],conceals:[],personality:'cooperative'},
      learningObjectives: ['Observe modeled fluid, electrolyte and pressure effects of a loop diuretic.'],
      keyEvidence: ['Required heartFailure history reduces baseline LV contractility in the existing engine.'],
      debriefNotes: ['Stable chronic model. Congestion is not inferred from a history label. This is not a validated dosing or long-term treatment model.'],
      authoredFindings: {exam:[]},
    } : {}),
    patient: {
      ...source.patient,
      ageRange: [profile.age, profile.age],
      sex: profile.sex,
      heightCm: profile.height,
      weightKg: profile.weight,
      fitnessRange: [fitness, fitness],
      requiredHistory: profile.preset === 'heart' ? ['heartFailure'] : profile.preset === 't2d' ? ['type2Diabetes'] : source.patient.requiredHistory,
      forbiddenHistory: profile.preset === 'heart' ? ['cad','type1Diabetes','asthma','copd','ckd'] : profile.preset === 't2d' ? ['type1Diabetes','asthma','copd','heartFailure'] : source.patient.forbiddenHistory,
      allergies: [],
    },
    pathologies: profile.preset === 'heart' || profile.preset === 't2d' ? [] : source.pathologies.map(p => ({ ...p, onsetMinutesBeforeArrival: p.type === 'dka' ? 360 : 25 })),
    presentation: {
      ...source.presentation,
      ...(profile.preset==='heart' ? {handoff:'Synthetic chronic heart-failure pharmacology experiment with reduced pump function. No acute infarction or congestion is assumed.',chiefComplaint:'Reduced cardiac pump function',arrivalMode:'walk-in'} : {}),
      ...(profile.preset==='t2d' ? {handoff:'Outpatient with stable type 2 diabetes for a virtual medicine check.',chiefComplaint:'Diabetes review',arrivalMode:'walk-in'} : {}),
      prehospital: { ...source.presentation.prehospital, oxygen: 'none', oxygenFlow: 0, ivAccess: true },
    },
  };
  const result = validateScenario(scenario);
  if (!result.scenario) throw new Error(result.errors.join('. '));
  return result.scenario;
}

const insulin = DRUG_MAP.insulinRegular!;
const infusion = insulin.infusion!;
export const insulinRates = [infusion.defaultRate / 2, infusion.defaultRate] as const;
export const insulinUnit = infusion.defaultUnit;
const rateSchema = z.number().refine(value => insulinRates.some(rate => rate === value), 'Select one of the available simulation rates.');
export type TreatmentExperiment = { label: string; settings: string; actions: SimAction[]; mechanism: string };
export type ModelInputStatus = 'model' | 'appearance' | 'context' | 'forecast' | 'treatment-check' | 'unsupported';
export const profileProvenance = (preset: Preset) => ({
  patientId:'context', displayName:'context', preset: 'model', age: 'model', sex: 'model', height: 'model', weight: 'model', activity: 'model', seed: 'model',
  history: 'context', lab: 'context', labNotes: 'context', lifestyleNotes: 'context', forecast: preset === 'diabetes' ? 'forecast' : 'unsupported',
  clinical: conditionOf(preset) ? 'forecast' : 'unsupported', genetics: 'context', drugAllergies:'treatment-check', currentMedicines:'context',
}) satisfies Record<keyof Profile | 'genetics', ModelInputStatus>;

export function intervention(preset: Preset, rate = infusion.defaultRate): TreatmentExperiment | null {
  if (preset === 'heart') return {label:'Furosemide',settings:'IV · 40 mg · virtual experiment',actions:[{type:'drug.bolus',drugId:'furosemide',dose:40,unit:'mg',route:'IV'}],mechanism:'The existing loop-diuretic model increases urine output and sodium loss, with GFR dependence. It may lower circulating volume, blood pressure and potassium. No five-year benefit is inferred.'};
  if (preset === 'diabetes' || preset === 't2d') {
    const selectedRate = rateSchema.parse(rate);
    return {
      label: insulin.name,
      settings: 'IV · ' + selectedRate + ' ' + insulinUnit,
      actions: [SimActionSchema.parse({ type: 'drug.infusion', drugId: insulin.id, rate: selectedRate, unit: insulinUnit })],
      mechanism: 'The engine models delayed glucose uptake and potassium movement into cells. Excessive insulin can cause hypoglycaemia and hypokalaemia; inspect both markers on A and B.',
    };
  }
  return {
    label: 'Supplemental oxygen',
    settings: 'Nasal cannula · 4 L/min',
    actions: [{ type: 'oxygen.set', device: 'nasalCannula', flowLpm: 4 }],
    mechanism: 'The oxygen device changes inspired oxygen in Vitalis gas exchange. Airway obstruction follows its own model.',
  };
}

export const metrics = [
  { key:'urine', label:'Urine output', unit:'mL/h', digits:0, read:(s:SimSnapshot)=>s.phys.renal.urineMlPerHour },
  { key:'ef', label:'Ejection fraction', unit:'%', digits:1, read:(s:SimSnapshot)=>s.phys.cv.ejectionFraction*100 },
  { key: 'hr', label: 'Heart rate', unit: 'bpm', digits: 0, read: (s: SimSnapshot) => s.phys.cv.hr },
  { key: 'sao2', label: 'Oxygen saturation', unit: '% SaO₂', digits: 1, read: (s: SimSnapshot) => s.phys.resp.sao2 * 100 },
  { key: 'sbp', label: 'Systolic pressure', unit: 'mmHg', digits: 0, read: (s: SimSnapshot) => s.phys.cv.sbp },
  { key: 'dbp', label: 'Diastolic pressure', unit: 'mmHg', digits: 0, read: (s: SimSnapshot) => s.phys.cv.dbp },
  { key: 'glucose', label: 'Glucose', unit: 'mmol/L', digits: 2, read: (s: SimSnapshot) => s.phys.chem.glucose },
  { key: 'rr', label: 'Respiration', unit: 'breaths/min', digits: 0, read: (s: SimSnapshot) => s.phys.resp.rr },
  { key: 'k', label: 'Potassium', unit: 'mmol/L', digits: 2, read: (s: SimSnapshot) => s.phys.chem.k },
] as const;
export type Metric = typeof metrics[number];
const uzMetrics: Record<Metric['key'], string> = {
  urine:'Siydik ajralishi', ef:'Chiqarish fraksiyasi', hr: 'Yurak urishi', sao2: 'Kislorod bilan to‘yinish', sbp: 'Sistolik bosim',
  dbp: 'Diastolik bosim', glucose: 'Glyukoza', rr: 'Nafas olish tezligi', k: 'Kaliy',
};
export function metricLabel(metric: Metric, uz: boolean) {
  return uz ? uzMetrics[metric.key] : metric.label;
}
export function metricValue(metric: Metric, value: number, uz: boolean) {
  return value.toLocaleString(uz ? 'uz-Latn-UZ' : 'en', {
    minimumFractionDigits: metric.digits, maximumFractionDigits: metric.digits, useGrouping: false,
  });
}

export const clock = (time: number) => {
  const seconds = Math.max(0, Math.floor(time + 0.001));
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
};
