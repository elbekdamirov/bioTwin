// Medicine catalogue for the 5-year forecast.
// Biomarker effects are placebo-adjusted means from registration trials / meta-analyses.
// Outcome effects are hazard ratios (95% CI) from the named outcome trial. Where a trial HR exists for an
// outcome, the forecast uses that HR instead of the drug's biomarker changes for that outcome (no double counting).
import type { ClinicalPatient } from './types';

export type Outcome = 'chd' | 'stroke' | 'mace' | 'hfHosp' | 'death' | 'kidney' | 'microvascular';
export type HR = { hr: number; lo: number; hi: number; trial: string };
export type Condition = 't2d' | 't1d' | 'hf';

export type Drug = {
  id: string;
  name: string;
  drugClass: string;
  dose: string;
  aliases: string[];
  conditions: Condition[];
  /** Placebo-adjusted change at full effect. */
  effects: { hba1c?: number; weightKg?: number; sbp?: number; ldlPct?: number; acrPct?: number; egfrDip?: number; egfrSlopeFactor?: number; efPoints?: number };
  effectSource: string;
  outcomes: Partial<Record<Outcome, HR>>;
  /** Outcome HRs that apply only to some patients. */
  outcomeWhen?: (p: ClinicalPatient) => boolean;
  adverse: string[];
  adverseUz: string[];
  /** Hard stops and warnings evaluated against the patient. */
  check: (p: ClinicalPatient, regimen: string[]) => { stop: string[]; warn: string[] };
  /** Drugs this one replaces when added (e.g. ARNI replaces ACE inhibitor). */
  replaces?: string[];
  /** Effect relative to a replaced drug (true) or relative to placebo (false). */
  relativeToReplaced?: boolean;
  organs: ('heart' | 'brain' | 'kidneys' | 'eyes' | 'metabolism' | 'vessels')[];
};

const none = () => ({ stop: [] as string[], warn: [] as string[] });
const has = (regimen: string[], ...ids: string[]) => ids.some(id => regimen.includes(id));

export const DRUGS: Drug[] = [
  {
    id: 'metformin', name: 'Metformin', drugClass: 'Biguanide', dose: '1000 mg twice daily',
    aliases: ['metformin', 'glucophage', 'siofor', 'метформин', 'сиофор', 'глюкофаж'], conditions: ['t2d'],
    effects: { hba1c: -1.12, weightKg: -1 }, effectSource: 'Hirst 2012 meta-analysis (35 RCTs)',
    outcomes: { chd: { hr: 0.61, lo: 0.41, hi: 0.89, trial: 'UKPDS 34 (overweight)' }, death: { hr: 0.64, lo: 0.45, hi: 0.91, trial: 'UKPDS 34 (overweight)' } },
    adverse: ['Diarrhoea, nausea — common at start, usually transient', 'Vitamin B12 deficiency with long-term use', 'Lactic acidosis — rare, mainly with eGFR < 30'],
    adverseUz: ['Ich ketishi, ko‘ngil aynishi — boshida tez-tez, odatda o‘tib ketadi', 'Uzoq qo‘llashda B12 vitamini yetishmovchiligi', 'Laktatsidoz — kam, asosan eGFR < 30 da'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 30 ? ['eGFR below 30: metformin is contraindicated.'] : [],
      warn: p.egfr !== null && p.egfr < 45 ? ['eGFR 30–44: do not start; if already taking, reduce dose.'] : [] }),
    organs: ['metabolism', 'heart'],
  },
  {
    id: 'empagliflozin', name: 'Empagliflozin', drugClass: 'SGLT2 inhibitor', dose: '10 mg once daily',
    aliases: ['empagliflozin', 'jardiance', 'эмпаглифлозин', 'джардинс', 'sglt2'], conditions: ['t2d', 'hf'],
    effects: { hba1c: -0.7, weightKg: -2, sbp: -4, acrPct: -15, egfrDip: -3, egfrSlopeFactor: 0.45 }, effectSource: 'Registration trials; EMPA-KIDNEY / CREDENCE eGFR slopes',
    outcomes: { mace: { hr: 0.86, lo: 0.74, hi: 0.99, trial: 'EMPA-REG OUTCOME' }, hfHosp: { hr: 0.65, lo: 0.5, hi: 0.85, trial: 'EMPA-REG OUTCOME' },
      death: { hr: 0.68, lo: 0.57, hi: 0.82, trial: 'EMPA-REG OUTCOME' }, kidney: { hr: 0.72, lo: 0.64, hi: 0.82, trial: 'EMPA-KIDNEY' } },
    adverse: ['Genital fungal infection (≈6% vs 2% on placebo)', 'Volume depletion / dizziness', 'Ketoacidosis — rare, stop before surgery or acute illness'],
    adverseUz: ['Jinsiy a’zolar zamburug‘li infeksiyasi (≈6%, platseboda 2%)', 'Suyuqlik kamayishi / bosh aylanishi', 'Ketoatsidoz — kam, operatsiya yoki o‘tkir kasallikdan oldin to‘xtatiladi'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 20 ? ['eGFR below 20: do not start an SGLT2 inhibitor.'] : [],
      warn: p.egfr !== null && p.egfr < 45 ? ['eGFR below 45: glucose-lowering effect is small; heart and kidney benefits remain.'] : [] }),
    organs: ['heart', 'kidneys', 'metabolism'],
  },
  {
    id: 'dapagliflozin', name: 'Dapagliflozin', drugClass: 'SGLT2 inhibitor', dose: '10 mg once daily',
    aliases: ['dapagliflozin', 'forxiga', 'farxiga', 'дапаглифлозин', 'форсига'], conditions: ['t2d', 'hf'],
    effects: { hba1c: -0.5, weightKg: -2, sbp: -3, acrPct: -30, egfrDip: -3, egfrSlopeFactor: 0.47 }, effectSource: 'Registration trials; DAPA-CKD eGFR slope',
    outcomes: { mace: { hr: 0.93, lo: 0.84, hi: 1.03, trial: 'DECLARE-TIMI 58' }, hfHosp: { hr: 0.73, lo: 0.61, hi: 0.88, trial: 'DECLARE-TIMI 58' },
      death: { hr: 0.93, lo: 0.82, hi: 1.04, trial: 'DECLARE-TIMI 58' }, kidney: { hr: 0.61, lo: 0.51, hi: 0.72, trial: 'DAPA-CKD' } },
    adverse: ['Genital fungal infection', 'Volume depletion / dizziness', 'Ketoacidosis — rare'],
    adverseUz: ['Jinsiy a’zolar zamburug‘li infeksiyasi', 'Suyuqlik kamayishi / bosh aylanishi', 'Ketoatsidoz — kam'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 25 ? ['eGFR below 25: do not start dapagliflozin.'] : [],
      warn: p.egfr !== null && p.egfr < 45 ? ['eGFR below 45: glucose-lowering effect is small; heart and kidney benefits remain.'] : [] }),
    organs: ['heart', 'kidneys', 'metabolism'],
  },
  {
    id: 'semaglutide', name: 'Semaglutide', drugClass: 'GLP-1 receptor agonist', dose: '1 mg subcutaneous once weekly',
    aliases: ['semaglutide', 'ozempic', 'rybelsus', 'семаглутид', 'оземпик', 'glp-1', 'glp1'], conditions: ['t2d'],
    effects: { hba1c: -1.4, weightKg: -4.3, sbp: -2.6 }, effectSource: 'SUSTAIN programme (1 mg vs placebo)',
    outcomes: { mace: { hr: 0.74, lo: 0.58, hi: 0.95, trial: 'SUSTAIN-6' }, stroke: { hr: 0.61, lo: 0.38, hi: 0.99, trial: 'SUSTAIN-6' },
      kidney: { hr: 0.76, lo: 0.66, hi: 0.88, trial: 'FLOW' }, death: { hr: 0.8, lo: 0.67, hi: 0.95, trial: 'FLOW' } },
    adverse: ['Nausea (≈20% vs 6%), vomiting, diarrhoea — mostly during dose escalation', 'Diabetic retinopathy complications ↑ (HR 1.76) when HbA1c falls fast', 'Gallbladder disease; pancreatitis — rare'],
    adverseUz: ['Ko‘ngil aynishi (≈20%, platseboda 6%), qusish, ich ketishi — asosan doza oshirilganda', 'HbA1c tez tushganda diabetik retinopatiya asoratlari ↑ (HR 1,76)', 'O‘t pufagi kasalligi; pankreatit — kam'],
    check: (p) => ({ stop: [], warn: [...(p.retinopathy ? ['Known retinopathy: arrange eye review — rapid HbA1c lowering raised retinopathy complications in SUSTAIN-6.'] : []),
      ...(p.hba1c !== null && p.hba1c >= 10 ? ['High HbA1c: a large, fast drop may transiently worsen retinopathy.'] : [])] }),
    organs: ['metabolism', 'heart', 'brain', 'kidneys', 'eyes'],
  },
  {
    id: 'liraglutide', name: 'Liraglutide', drugClass: 'GLP-1 receptor agonist', dose: '1.8 mg subcutaneous daily',
    aliases: ['liraglutide', 'victoza', 'лираглутид', 'виктоза'], conditions: ['t2d'],
    effects: { hba1c: -1.0, weightKg: -2.3, sbp: -1.2 }, effectSource: 'LEAD programme; LEADER',
    outcomes: { mace: { hr: 0.87, lo: 0.78, hi: 0.97, trial: 'LEADER' }, death: { hr: 0.85, lo: 0.74, hi: 0.97, trial: 'LEADER' } },
    adverse: ['Nausea and other gastrointestinal effects', 'Gallbladder disease', 'Pancreatitis — rare'],
    adverseUz: ['Ko‘ngil aynishi va boshqa oshqozon-ichak ta’sirlari', 'O‘t pufagi kasalligi', 'Pankreatit — kam'],
    check: none, organs: ['metabolism', 'heart'],
  },
  {
    id: 'sitagliptin', name: 'Sitagliptin', drugClass: 'DPP-4 inhibitor', dose: '100 mg once daily (dose-reduced if eGFR < 45)',
    aliases: ['sitagliptin', 'januvia', 'ситаглиптин', 'янувия', 'dpp-4', 'dpp4'], conditions: ['t2d'],
    effects: { hba1c: -0.6 }, effectSource: 'Registration trials',
    outcomes: { mace: { hr: 0.98, lo: 0.88, hi: 1.09, trial: 'TECOS' }, hfHosp: { hr: 1.0, lo: 0.83, hi: 1.2, trial: 'TECOS' } },
    adverse: ['Usually well tolerated; weight neutral', 'Joint pain, pancreatitis — rare'],
    adverseUz: ['Odatda yaxshi o‘zlashtiriladi; vaznga ta’sir qilmaydi', 'Bo‘g‘im og‘rig‘i, pankreatit — kam'],
    check: p => ({ stop: [], warn: p.egfr !== null && p.egfr < 45 ? ['eGFR below 45: use 50 mg (25 mg if eGFR < 30).'] : [] }),
    organs: ['metabolism'],
  },
  {
    id: 'gliclazide', name: 'Sulfonylurea (gliclazide MR)', drugClass: 'Sulfonylurea', dose: '60–120 mg once daily',
    aliases: ['gliclazide', 'diabeton', 'diamicron', 'гликлазид', 'диабетон', 'sulfonylurea', 'glimepiride', 'глимепирид'], conditions: ['t2d'],
    effects: { hba1c: -1.0, weightKg: 2 }, effectSource: 'Sulfonylurea meta-analyses; ADVANCE',
    outcomes: {},
    adverse: ['Hypoglycaemia — highest risk among oral agents, especially with older age or low eGFR', 'Weight gain (≈2 kg)'],
    adverseUz: ['Gipoglikemiya — og‘iz orqali dorilar ichida eng yuqori xavf, ayniqsa keksalarda yoki eGFR past bo‘lsa', 'Vazn ortishi (≈2 kg)'],
    check: p => ({ stop: [], warn: [...(p.egfr !== null && p.egfr < 30 ? ['eGFR below 30: high hypoglycaemia risk.'] : []), ...(p.age >= 75 ? ['Age 75+: high hypoglycaemia risk.'] : [])] }),
    organs: ['metabolism'],
  },
  {
    id: 'glargine', name: 'Insulin glargine', drugClass: 'Basal insulin', dose: 'Titrated to fasting glucose 4–7 mmol/L',
    aliases: ['glargine', 'lantus', 'toujeo', 'basal insulin', 'insulin', 'insulin glargine', 'гларгин', 'лантус', 'инсулин', 'insulin qo‘shish'], conditions: ['t2d'],
    effects: { hba1c: -1.5, weightKg: 2 }, effectSource: 'Treat-to-target trials; ORIGIN',
    outcomes: { mace: { hr: 1.02, lo: 0.94, hi: 1.11, trial: 'ORIGIN' } },
    adverse: ['Hypoglycaemia (severe ≈1 per 100 patient-years in ORIGIN)', 'Weight gain (≈2 kg)'],
    adverseUz: ['Gipoglikemiya (ORIGIN’da og‘ir holat ≈1/100 bemor-yil)', 'Vazn ortishi (≈2 kg)'],
    check: none, organs: ['metabolism'],
  },
  {
    id: 'intensiveInsulin', name: 'Intensified insulin therapy', drugClass: 'Basal-bolus / pump insulin', dose: 'Titrated to HbA1c ≈ 7%',
    aliases: ['intensive insulin', 'intensified insulin', 'insulin pump', 'basal bolus', 'insulin', 'инсулин', 'insulin intensification'], conditions: ['t1d'],
    effects: { hba1c: -1.5 }, effectSource: 'DCCT (≈2-point HbA1c separation)',
    outcomes: { microvascular: { hr: 0.39, lo: 0.28, hi: 0.55, trial: 'DCCT (retinopathy progression)' } },
    adverse: ['Severe hypoglycaemia ≈3× more frequent (DCCT)', 'Weight gain'],
    adverseUz: ['Og‘ir gipoglikemiya ≈3 barobar ko‘proq (DCCT)', 'Vazn ortishi'],
    check: p => ({ stop: [], warn: p.hba1c !== null && p.hba1c < 7.5 ? ['HbA1c already near target: little extra benefit, more hypoglycaemia.'] : [] }),
    organs: ['metabolism', 'eyes', 'kidneys'],
  },
  {
    id: 'atorvastatin20', name: 'Atorvastatin 20 mg', drugClass: 'Statin (moderate intensity)', dose: '20 mg once daily',
    aliases: ['atorvastatin', 'atorvastatin 20', 'lipitor', 'atoris', 'аторвастатин', 'аторис', 'statin', 'статин'], conditions: ['t2d', 't1d'],
    effects: { ldlPct: -43 }, effectSource: 'STELLAR dose comparison',
    outcomes: {},
    adverse: ['Muscle aches — most are not caused by the statin in blinded trials', 'Small rise in HbA1c', 'Liver enzyme rise — uncommon'],
    adverseUz: ['Mushak og‘rig‘i — ko‘r tadqiqotlarda ko‘pchiligi statin bilan bog‘liq emas', 'HbA1c biroz oshishi', 'Jigar fermentlari oshishi — kam uchraydi'],
    check: none,
    organs: ['heart', 'brain', 'vessels'],
  },
  {
    id: 'atorvastatin80', name: 'Atorvastatin 80 mg', drugClass: 'Statin (high intensity)', dose: '80 mg once daily',
    aliases: ['atorvastatin 80', 'high-intensity statin', 'high intensity statin', 'аторвастатин 80'], conditions: ['t2d', 't1d'],
    effects: { ldlPct: -51 }, effectSource: 'STELLAR dose comparison',
    outcomes: {},
    adverse: ['Muscle aches', 'Small rise in HbA1c', 'Liver enzyme rise — uncommon'],
    adverseUz: ['Mushak og‘rig‘i', 'HbA1c biroz oshishi', 'Jigar fermentlari oshishi — kam uchraydi'],
    check: none,
    organs: ['heart', 'brain', 'vessels'],
  },
  {
    id: 'rosuvastatin20', name: 'Rosuvastatin 20 mg', drugClass: 'Statin (high intensity)', dose: '20 mg once daily',
    aliases: ['rosuvastatin', 'crestor', 'roxera', 'розувастатин', 'крестор', 'роксера'], conditions: ['t2d', 't1d'],
    effects: { ldlPct: -52 }, effectSource: 'STELLAR dose comparison',
    outcomes: {},
    adverse: ['Muscle aches', 'Small rise in HbA1c', 'Reduce dose if eGFR < 30'],
    adverseUz: ['Mushak og‘rig‘i', 'HbA1c biroz oshishi', 'eGFR < 30 bo‘lsa doza kamaytiriladi'],
    check: p => ({ stop: [], warn: p.egfr !== null && p.egfr < 30 ? ['eGFR below 30: start at 5 mg, maximum 10 mg.'] : [] }),
    organs: ['heart', 'brain', 'vessels'],
  },
  {
    id: 'ramipril', name: 'Ramipril', drugClass: 'ACE inhibitor', dose: '10 mg once daily',
    aliases: ['ramipril', 'lisinopril', 'enalapril', 'perindopril', 'ace inhibitor', 'acei', 'рамиприл', 'лизиноприл', 'эналаприл', 'периндоприл', 'престариум', 'ингибитор апф'], conditions: ['t2d', 't1d', 'hf'],
    effects: { sbp: -8.5, acrPct: -30 }, effectSource: 'Law 2009 BP meta-analysis (standard dose)',
    outcomes: { chd: { hr: 0.8, lo: 0.7, hi: 0.9, trial: 'HOPE (myocardial infarction)' }, stroke: { hr: 0.68, lo: 0.56, hi: 0.84, trial: 'HOPE' }, death: { hr: 0.84, lo: 0.75, hi: 0.95, trial: 'HOPE' } },
    adverse: ['Dry cough (≈1 in 10)', 'High potassium, creatinine rise — check 1–2 weeks after starting', 'Angioedema — rare; contraindicated in pregnancy'],
    adverseUz: ['Quruq yo‘tal (≈10 kishidan 1)', 'Kaliy oshishi, kreatinin oshishi — boshlagandan 1–2 hafta keyin tekshiring', 'Angioedema — kam; homiladorlikda mumkin emas'],
    check: (_p, regimen) => ({ stop: has(regimen, 'losartan', 'sacubitrilValsartan') ? ['Do not combine an ACE inhibitor with an ARB or sacubitril/valsartan.'] : [], warn: [] }),
    organs: ['heart', 'brain', 'kidneys', 'vessels'],
  },
  {
    id: 'losartan', name: 'Losartan', drugClass: 'Angiotensin receptor blocker', dose: '100 mg once daily',
    aliases: ['losartan', 'valsartan', 'irbesartan', 'telmisartan', 'arb', 'лозартан', 'лориста', 'валсартан', 'телмисартан'], conditions: ['t2d', 't1d', 'hf'],
    effects: { sbp: -10.3, acrPct: -35 }, effectSource: 'Law 2009 BP meta-analysis; RENAAL proteinuria',
    outcomes: { kidney: { hr: 0.72, lo: 0.58, hi: 0.89, trial: 'RENAAL (end-stage kidney disease)' } },
    outcomeWhen: p => (p.acr ?? 0) >= 300,
    adverse: ['High potassium, creatinine rise — check after starting', 'Dizziness; contraindicated in pregnancy'],
    adverseUz: ['Kaliy va kreatinin oshishi — boshlagandan keyin tekshiring', 'Bosh aylanishi; homiladorlikda mumkin emas'],
    check: (_p, regimen) => ({ stop: has(regimen, 'ramipril', 'sacubitrilValsartan') ? ['Do not combine an ARB with an ACE inhibitor or sacubitril/valsartan.'] : [], warn: [] }),
    organs: ['kidneys', 'heart', 'brain'],
  },
  {
    id: 'amlodipine', name: 'Amlodipine', drugClass: 'Calcium-channel blocker', dose: '5–10 mg once daily',
    aliases: ['amlodipine', 'norvasc', 'амлодипин', 'норваск', 'ccb'], conditions: ['t2d', 't1d'],
    effects: { sbp: -8.8 }, effectSource: 'Law 2009 BP meta-analysis (standard dose)',
    outcomes: {},
    adverse: ['Ankle swelling (dose-related, ≈1 in 10 at 10 mg)', 'Flushing, headache'],
    adverseUz: ['To‘piq shishi (dozaga bog‘liq, 10 mg da ≈10 kishidan 1)', 'Yuz qizarishi, bosh og‘rig‘i'],
    check: none, organs: ['heart', 'brain', 'vessels'],
  },
  {
    id: 'finerenone', name: 'Finerenone', drugClass: 'Non-steroidal MRA', dose: '10–20 mg once daily',
    aliases: ['finerenone', 'kerendia', 'финеренон', 'керендия'], conditions: ['t2d'],
    effects: { sbp: -3, acrPct: -31 }, effectSource: 'FIDELIO-DKD',
    outcomes: { kidney: { hr: 0.82, lo: 0.73, hi: 0.93, trial: 'FIDELIO-DKD' }, mace: { hr: 0.86, lo: 0.75, hi: 0.99, trial: 'FIDELIO-DKD (CV composite)' }, hfHosp: { hr: 0.71, lo: 0.56, hi: 0.9, trial: 'FIGARO-DKD' } },
    outcomeWhen: p => (p.acr ?? 0) >= 30,
    adverse: ['High potassium (≈18% vs 9% on placebo) — check potassium at 4 weeks'],
    adverseUz: ['Kaliy oshishi (≈18%, platseboda 9%) — 4 haftada kaliyni tekshiring'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 25 ? ['eGFR below 25: do not start finerenone.'] : [],
      warn: (p.acr ?? 0) < 30 ? ['Kidney and heart benefits were shown only with albuminuria (ACR ≥ 30 mg/g).'] : [] }),
    organs: ['kidneys', 'heart'],
  },
  // ---------- Heart failure with reduced ejection fraction ----------
  {
    id: 'sacubitrilValsartan', name: 'Sacubitril/valsartan', drugClass: 'ARNI', dose: '97/103 mg twice daily (target)',
    aliases: ['sacubitril', 'entresto', 'uperio', 'arni', 'сакубитрил', 'юперио', 'энтресто'], conditions: ['hf'],
    effects: { sbp: -4, efPoints: 9.4 }, effectSource: 'PARADIGM-HF; PROVE-HF (EF, single-arm)',
    outcomes: { death: { hr: 0.84, lo: 0.76, hi: 0.93, trial: 'PARADIGM-HF (vs enalapril)' }, hfHosp: { hr: 0.79, lo: 0.71, hi: 0.89, trial: 'PARADIGM-HF (vs enalapril)' } },
    replaces: ['ramipril', 'losartan'], relativeToReplaced: true,
    adverse: ['Symptomatic low blood pressure (≈14% vs 9% on enalapril)', 'High potassium, creatinine rise', 'Angioedema — rare; stop ACE inhibitor 36 h before'],
    adverseUz: ['Simptomli past qon bosimi (≈14%, enalaprilda 9%)', 'Kaliy va kreatinin oshishi', 'Angioedema — kam; AAF ingibitorini 36 soat oldin to‘xtating'],
    check: p => ({ stop: p.sbp !== null && p.sbp < 100 ? ['Systolic pressure below 100 mmHg: start is not advised.'] : [],
      warn: p.egfr !== null && p.egfr < 30 ? ['eGFR below 30: start at the lowest dose.'] : [] }),
    organs: ['heart', 'kidneys'],
  },
  {
    id: 'bisoprolol', name: 'Bisoprolol', drugClass: 'Beta-blocker', dose: 'Up-titrated to 10 mg once daily',
    aliases: ['bisoprolol', 'concor', 'beta blocker', 'beta-blocker', 'metoprolol', 'carvedilol', 'бисопролол', 'конкор', 'метопролол', 'карведилол', 'бета-блокатор'], conditions: ['hf'],
    effects: {}, effectSource: 'CIBIS-II',
    outcomes: { death: { hr: 0.66, lo: 0.54, hi: 0.81, trial: 'CIBIS-II' }, hfHosp: { hr: 0.64, lo: 0.53, hi: 0.79, trial: 'CIBIS-II' } },
    adverse: ['Tiredness and slow pulse during up-titration', 'Temporary worsening of breathlessness — titrate slowly'],
    adverseUz: ['Doza oshirilganda charchoq va sekin puls', 'Hansirashning vaqtincha kuchayishi — dozani sekin oshiring'],
    check: none, organs: ['heart'],
  },
  {
    id: 'spironolactone', name: 'Spironolactone', drugClass: 'Mineralocorticoid receptor antagonist', dose: '25–50 mg once daily',
    aliases: ['spironolactone', 'veroshpiron', 'aldactone', 'eplerenone', 'mra', 'спиронолактон', 'верошпирон', 'эплеренон'], conditions: ['hf'],
    effects: {}, effectSource: 'RALES',
    outcomes: { death: { hr: 0.7, lo: 0.6, hi: 0.82, trial: 'RALES' }, hfHosp: { hr: 0.65, lo: 0.54, hi: 0.77, trial: 'RALES' } },
    adverse: ['High potassium — check at 1 and 4 weeks', 'Breast tenderness / enlargement in men (≈10%)'],
    adverseUz: ['Kaliy oshishi — 1 va 4 haftada tekshiring', 'Erkaklarda ko‘krak bezi og‘rig‘i / kattalashishi (≈10%)'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 30 ? ['eGFR below 30: spironolactone is not advised.'] : [], warn: [] }),
    organs: ['heart'],
  },
  {
    id: 'dapagliflozinHF', name: 'Dapagliflozin (heart failure)', drugClass: 'SGLT2 inhibitor', dose: '10 mg once daily',
    aliases: ['dapagliflozin', 'forxiga', 'farxiga', 'дапаглифлозин', 'форсига', 'sglt2'], conditions: ['hf'],
    effects: { weightKg: -1, sbp: -1.3, egfrDip: -3, egfrSlopeFactor: 0.5 }, effectSource: 'DAPA-HF',
    outcomes: { death: { hr: 0.83, lo: 0.71, hi: 0.97, trial: 'DAPA-HF' }, hfHosp: { hr: 0.7, lo: 0.59, hi: 0.83, trial: 'DAPA-HF' } },
    adverse: ['Genital fungal infection', 'Volume depletion — consider lowering diuretic'],
    adverseUz: ['Jinsiy a’zolar zamburug‘li infeksiyasi', 'Suyuqlik kamayishi — diuretik dozasini kamaytirish mumkin'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 25 ? ['eGFR below 25: do not start dapagliflozin.'] : [], warn: [] }),
    organs: ['heart', 'kidneys'],
  },
  {
    id: 'empagliflozinHF', name: 'Empagliflozin (heart failure)', drugClass: 'SGLT2 inhibitor', dose: '10 mg once daily',
    aliases: ['empagliflozin', 'jardiance', 'эмпаглифлозин', 'джардинс'], conditions: ['hf'],
    effects: { weightKg: -1, egfrDip: -3, egfrSlopeFactor: 0.4 }, effectSource: 'EMPEROR-Reduced',
    outcomes: { death: { hr: 0.92, lo: 0.77, hi: 1.1, trial: 'EMPEROR-Reduced' }, hfHosp: { hr: 0.69, lo: 0.59, hi: 0.81, trial: 'EMPEROR-Reduced' } },
    adverse: ['Genital fungal infection', 'Volume depletion'],
    adverseUz: ['Jinsiy a’zolar zamburug‘li infeksiyasi', 'Suyuqlik kamayishi'],
    check: p => ({ stop: p.egfr !== null && p.egfr < 20 ? ['eGFR below 20: do not start empagliflozin.'] : [], warn: [] }),
    organs: ['heart', 'kidneys'],
  },
  {
    id: 'enalaprilHF', name: 'Enalapril (heart failure)', drugClass: 'ACE inhibitor', dose: '10 mg twice daily (target)',
    aliases: ['enalapril', 'ace inhibitor', 'acei', 'эналаприл', 'ramipril', 'lisinopril', 'рамиприл', 'лизиноприл'], conditions: ['hf'],
    effects: { sbp: -5 }, effectSource: 'SOLVD-Treatment',
    outcomes: { death: { hr: 0.84, lo: 0.74, hi: 0.95, trial: 'SOLVD-Treatment' } },
    adverse: ['Dry cough', 'High potassium, creatinine rise', 'Low blood pressure'],
    adverseUz: ['Quruq yo‘tal', 'Kaliy va kreatinin oshishi', 'Past qon bosimi'],
    check: (_p, regimen) => ({ stop: has(regimen, 'sacubitrilValsartan') ? ['Already on sacubitril/valsartan — do not add an ACE inhibitor.'] : [], warn: [] }),
    organs: ['heart'],
  },
  {
    id: 'furosemide', name: 'Furosemide', drugClass: 'Loop diuretic', dose: '40 mg once daily',
    aliases: ['furosemide', 'lasix', 'фуросемид', 'лазикс', 'diuretic', 'диуретик'], conditions: ['hf'],
    effects: { weightKg: -1.5 }, effectSource: 'Symptom relief; no outcome trial',
    outcomes: {},
    adverse: ['Low potassium and sodium', 'Dehydration, creatinine rise', 'No proven effect on survival — relieves congestion'],
    adverseUz: ['Kaliy va natriy kamayishi', 'Suvsizlanish, kreatinin oshishi', 'Yashovchanlikka ta’siri isbotlanmagan — shishni kamaytiradi'],
    check: none, organs: ['heart', 'kidneys'],
  },
];

export const DRUG_BY_ID = Object.fromEntries(DRUGS.map(d => [d.id, d])) as Record<string, Drug>;

const letter = /[\p{L}\p{N}]/u;
/** Short aliases ("arb", "mra", "acei") must stand alone so they do not match inside other words. */
function indexOfAlias(text: string, alias: string) {
  let from = 0;
  while (true) {
    const at = text.indexOf(alias, from);
    if (at < 0 || alias.length > 6) return at;
    const before = text[at - 1], after = text[at + alias.length];
    if ((!before || !letter.test(before)) && (!after || !letter.test(after))) return at;
    from = at + 1;
  }
}

/** Uzbek Latin spellings of INN names: semaglutide → semaglutid, amlodipine → amlodipin, losartan → lozartan. */
export function uzbekSpelling(alias: string) {
  return alias.replace(/ide(?=\s|$)/g, 'id').replace(/ine(?=\s|$)/g, 'in').replace(/one(?=\s|$)/g, 'on').replace(/c/g, 'k').replace(/(?<=[aeiou])s(?=[aeiou])/g, 'z');
}

/** Picks the drug for a condition from free text (English, Uzbek, Russian aliases). */
export function findDrugs(text: string, condition: Condition): Drug[] {
  const lower = text.toLowerCase();
  const found: { drug: Drug; at: number; len: number }[] = [];
  for (const drug of DRUGS) {
    if (!drug.conditions.includes(condition)) continue;
    let best: { at: number; len: number } | null = null;
    for (const alias of drug.aliases.flatMap(a => [a, uzbekSpelling(a)])) {
      const at = indexOfAlias(lower, alias);
      if (at >= 0 && (!best || alias.length > best.len)) best = { at, len: alias.length };
    }
    if (best) found.push({ drug, ...best });
  }
  // Prefer the most specific alias at each position (e.g. "atorvastatin 80" over "atorvastatin").
  found.sort((a, b) => a.at - b.at || b.len - a.len);
  const result: Drug[] = [];
  const covered: [number, number][] = [];
  for (const f of found) {
    if (covered.some(([s, e]) => f.at < e && f.at + f.len > s)) continue;
    covered.push([f.at, f.at + f.len]);
    if (!result.includes(f.drug)) result.push(f.drug);
  }
  return result;
}
