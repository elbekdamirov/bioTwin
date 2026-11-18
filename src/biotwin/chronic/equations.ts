// Published, validated risk equations used by the 5-year chronic forecast.
// Each function returns an ANNUAL hazard (events per person-year) for the
// supplied covariates, so covariates can change year by year under treatment.
// Coefficients are quoted from the sources listed in ./sources.ts.

/** CKD-EPI 2021 race-free creatinine equation. Creatinine in mg/dL. */
export function ckdEpi2021(creatinineMgDl: number, age: number, sex: 'female' | 'male') {
  const female = sex === 'female';
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = creatinineMgDl / kappa;
  return 142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
}

export const umolToMgDl = (umol: number) => umol / 88.42;
export const hba1cPercentToMmolMol = (pct: number) => (pct - 2.152) * 10.929;
export const mgDlToMmolCholesterol = (mg: number) => mg / 38.67;

type UkpdsInput = { age: number; female: boolean; afroCaribbean?: boolean; smoker: boolean; hba1c: number; sbp: number; tcHdlRatio: number; durationYears: number; atrialFibrillation?: boolean };

/**
 * UKPDS Risk Engine (UKPDS 56, Stevens et al. 2001) — fatal or non-fatal coronary heart disease
 * in type 2 diabetes. Parameters from the Oxford Diabetes Trials Unit parameter sheet.
 * Risk over t years = 1 - exp(-q d^D (1 - d^t)/(1 - d)); the hazard in year k (from diagnosis D) is q d^(D+k).
 */
export const UKPDS_CHD = {
  q0: 0.011196554, age: 1.058733466, ageCentre: 55, female: 0.524695785, afroCaribbean: 0.389840654,
  smoker: 1.34950941, hba1c: 1.183208336, hba1cCentre: 6.715889, sbpPer10: 1.087703237, sbpCentre: 135.679146,
  lipid: 3.844520802, lipidCentre: 1.590903, d: 1.077529237,
} as const;

/** UKPDS 60 (Kothari et al. 2002) — fatal or non-fatal stroke in type 2 diabetes. */
export const UKPDS_STROKE = {
  q0: 0.001854749, age: 1.091797834, ageCentre: 55, female: 0.700038749, smoker: 1.546546697,
  sbpPer10: 1.122089348, sbpCentre: 135.549791, lipid: 1.138088189, lipidCentre: 1.593026,
  atrialFibrillation: 8.553988106, d: 1.145004121,
} as const;

export function ukpdsChdHazard(x: UkpdsInput, yearsSinceDiagnosis: number) {
  const c = UKPDS_CHD;
  const q = c.q0 * c.age ** (x.age - c.ageCentre) * c.female ** Number(x.female) * c.afroCaribbean ** Number(!!x.afroCaribbean) *
    c.smoker ** Number(x.smoker) * c.hba1c ** (x.hba1c - c.hba1cCentre) * c.sbpPer10 ** ((x.sbp - c.sbpCentre) / 10) *
    c.lipid ** (Math.log(x.tcHdlRatio) - c.lipidCentre);
  return q * c.d ** yearsSinceDiagnosis;
}

export function ukpdsStrokeHazard(x: UkpdsInput, yearsSinceDiagnosis: number) {
  const c = UKPDS_STROKE;
  const q = c.q0 * c.age ** (x.age - c.ageCentre) * c.female ** Number(x.female) * c.smoker ** Number(x.smoker) *
    c.sbpPer10 ** ((x.sbp - c.sbpCentre) / 10) * c.lipid ** (Math.log(x.tcHdlRatio) - c.lipidCentre) *
    c.atrialFibrillation ** Number(!!x.atrialFibrillation);
  return q * c.d ** yearsSinceDiagnosis;
}

/**
 * Kidney Failure Risk Equation, 4-variable (Tangri et al. JAMA 2011/2016), non-North-American calibration.
 * Valid for CKD G3–G5 (eGFR < 60). Returns the 5-year probability; converted to a constant annual hazard.
 */
export const KFRE = {
  age: -0.2201, male: 0.2467, egfr: -0.5567, logAcr: 0.451,
  ageCentre: 7.036, maleCentre: 0.5642, egfrCentre: 7.222, logAcrCentre: 5.137,
  baseline5yNonNorthAmerica: 0.9365, baseline2yNonNorthAmerica: 0.9832,
} as const;

export function kfre5y(age: number, male: boolean, egfr: number, acrMgG: number) {
  const k = KFRE;
  const lp = k.age * (age / 10 - k.ageCentre) + k.male * (Number(male) - k.maleCentre) +
    k.egfr * (egfr / 5 - k.egfrCentre) + k.logAcr * (Math.log(Math.max(acrMgG, 1)) - k.logAcrCentre);
  return 1 - k.baseline5yNonNorthAmerica ** Math.exp(lp);
}
export const kfreHazard = (age: number, male: boolean, egfr: number, acr: number) => -Math.log(1 - kfre5y(age, male, egfr, acr)) / 5;

/**
 * MAGGIC heart-failure risk score (Pocock et al. Eur Heart J 2013). Integer points and the published
 * 1- and 3-year all-cause mortality lookup (as reproduced by the MSD Manuals / EBMcalc calculator).
 */
export type MaggicInput = {
  age: number; male: boolean; ef: number; sbp: number; bmi: number; creatinineUmol: number; nyha: 1 | 2 | 3 | 4;
  smoker: boolean; diabetes: boolean; copd: boolean; hfOver18Months: boolean; betaBlocker: boolean; aceiOrArb: boolean;
};

export function maggicPoints(x: MaggicInput) {
  const ef = x.ef;
  const efPts = ef < 20 ? 7 : ef <= 24 ? 6 : ef <= 29 ? 5 : ef <= 34 ? 3 : ef <= 39 ? 2 : 0;
  const ageBands = ef < 30 ? [1, 2, 4, 6, 8, 10] : ef < 40 ? [2, 4, 6, 8, 10, 13] : [3, 5, 7, 9, 12, 15];
  const ageIdx = x.age >= 80 ? 5 : x.age >= 75 ? 4 : x.age >= 70 ? 3 : x.age >= 65 ? 2 : x.age >= 60 ? 1 : x.age >= 56 ? 0 : -1;
  const agePts = ageIdx < 0 ? 0 : ageBands[ageIdx]!;
  const sbpPts = ef < 30
    ? (x.sbp < 110 ? 5 : x.sbp <= 119 ? 4 : x.sbp <= 129 ? 3 : x.sbp <= 139 ? 2 : x.sbp <= 149 ? 1 : 0)
    : ef < 40 ? (x.sbp < 110 ? 3 : x.sbp <= 119 ? 2 : x.sbp <= 139 ? 1 : 0)
    : (x.sbp < 110 ? 2 : x.sbp <= 129 ? 1 : 0);
  const bmiPts = x.bmi < 15 ? 6 : x.bmi <= 19 ? 5 : x.bmi <= 24 ? 3 : x.bmi <= 29 ? 2 : 0;
  const c = x.creatinineUmol;
  const crPts = c >= 250 ? 8 : c >= 210 ? 6 : c >= 170 ? 5 : c >= 150 ? 4 : c >= 130 ? 3 : c >= 110 ? 2 : c >= 90 ? 1 : 0;
  const nyhaPts = [0, 2, 6, 8][x.nyha - 1]!;
  return efPts + agePts + sbpPts + bmiPts + crPts + nyhaPts + Number(x.male) + Number(x.smoker) + 3 * Number(x.diabetes) +
    2 * Number(x.copd) + 2 * Number(x.hfOver18Months) + 3 * Number(!x.betaBlocker) + Number(!x.aceiOrArb);
}

export const MAGGIC_TABLE: readonly (readonly [number, number])[] = [
  [1.5, 3.9], [1.6, 4.3], [1.8, 4.8], [2, 5.2], [2.2, 5.8], [2.4, 6.3], [2.7, 7], [2.9, 7.7], [3.2, 8.4], [3.6, 9.2],
  [3.9, 10.2], [4.3, 11.1], [4.8, 12.2], [5.2, 13.4], [5.8, 14.6], [6.3, 16], [7, 17.5], [7.7, 19.1], [8.4, 20.9], [9.3, 22.7],
  [10.2, 24.7], [11.1, 26.9], [12.2, 29.2], [13.4, 31.6], [14.7, 34.2], [16, 36.9], [17.5, 39.7], [19.1, 42.7], [20.9, 45.8], [22.7, 49],
  [24.8, 52.3], [26.9, 55.6], [29.2, 59], [31.6, 62.5], [34.2, 65.8], [36.9, 69.2], [39.8, 72.5], [42.7, 75.6], [45.8, 78.7], [49, 81.5],
  [52.3, 84.2], [55.7, 86.6], [59.1, 88.9], [62.5, 90.8], [65.9, 92.6], [69.2, 94.1], [72.5, 95.3], [75.7, 96.4], [78.7, 97.3], [81.6, 98], [84.2, 98.5],
];

/**
 * Converts a MAGGIC score to annual all-cause mortality hazards for years 1–5.
 * Years 1 and 2–3 come from the published 1- and 3-year table; years 4–5 extend the year 2–3 hazard
 * (constant-hazard extrapolation — MAGGIC itself is not validated beyond 3 years).
 */
export function maggicAnnualHazards(points: number) {
  const row = MAGGIC_TABLE[Math.max(0, Math.min(50, Math.round(points)))]!;
  const s1 = 1 - row[0] / 100, s3 = 1 - row[1] / 100;
  const h1 = -Math.log(s1);
  const h23 = Math.max(0, (Math.log(s1) - Math.log(s3)) / 2);
  return [h1, h23, h23, h23, h23];
}

/** Steno Type 1 Risk Engine (Vistisen et al. Circulation 2016) — composite first CVD event, annual rate. */
export { STENO_COEFFICIENTS } from '../forecast/steno';
import { STENO_COEFFICIENTS } from '../forecast/steno';
export function stenoHazard(x: { age: number; female: boolean; durationYears: number; sbp: number; ldl: number; hba1cMmolMol: number; albuminuria: 'normal' | 'micro' | 'macro'; egfr: number; smoker: boolean; exercise: boolean }) {
  const c = STENO_COEFFICIENTS;
  const lp = c.intercept + c.age * x.age + c.female * Number(x.female) + c.duration * x.durationYears + c.sbp * x.sbp + c.ldl * x.ldl +
    c.hba1c * x.hba1cMmolMol + c.micro * Number(x.albuminuria === 'micro') + c.macro * Number(x.albuminuria === 'macro') +
    (x.age < 40 ? c.log2EgfrUnder40 : c.log2Egfr40Plus) * Math.log2(Math.max(x.egfr, 1)) + c.smoking * Number(x.smoker) + c.noExercise * Number(!x.exercise);
  return Math.exp(lp);
}

export const albuminuriaCategory = (acr: number | null): 'normal' | 'micro' | 'macro' => acr === null || acr < 30 ? 'normal' : acr < 300 ? 'micro' : 'macro';
