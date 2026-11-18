// Short-term (minutes) medicine catalogue for the Vitalis physiology engine.
// Only drugs the engine models pharmacologically are listed; doses are bounded to usual adult ranges.
import type { SimAction } from '@/sim/interventions/actions';
import type { SimSnapshot } from '@/sim/engine/snapshot';
import type { Preset } from './model';

export type Form = 'injection' | 'tablet' | 'drip';
export type ShortDrug = {
  id: string; name: string; uz: string; form: Form; route: string; unit: string;
  min: number; max: number; step: number; dose: number;
  /** What it is used for in this disease. */
  use: [string, string];
  /** Expected short-term effect shown before giving it. */
  effect: [string, string];
  build: (dose: number, weightKg: number) => SimAction;
  check?: (s: SimSnapshot | undefined) => string[];
};

const bolus = (drugId: string, unit: string, route: string) => (dose: number): SimAction => ({ type: 'drug.bolus', drugId, dose, unit, route } as SimAction);
const infusion = (drugId: string, unit: string) => (rate: number): SimAction => ({ type: 'drug.infusion', drugId, rate, unit });
const fluid = (fluidId: string) => (volumeMl: number): SimAction => ({ type: 'fluid.start', fluidId, volumeMl, rateMlH: volumeMl * 2, warmed: false });
const lowGlucose = (s?: SimSnapshot) => s && s.phys.chem.glucose < 4 ? ['Glucose is below 4 mmol/L — insulin is blocked.'] : [];
const lowK = (s?: SimSnapshot) => s && s.phys.chem.k < 3.5 ? ['Potassium is below 3.5 mmol/L — correct it first.'] : [];
const lowBp = (s?: SimSnapshot) => s && s.phys.cv.sbp < 90 ? ['Systolic pressure is below 90 mmHg.'] : [];
const highK = (s?: SimSnapshot) => s && s.phys.chem.k > 5 ? ['Potassium is above 5.0 mmol/L.'] : [];

export const DIABETES_DRUGS: ShortDrug[] = [
  { id: 'insIv', name: 'Insulin regular · IV bolus', uz: 'Qisqa insulin · venaga', form: 'injection', route: 'IV', unit: 'units', min: 1, max: 20, step: 1, dose: 6,
    use: ['Rapid correction of high glucose', 'Yuqori qand tez tushiriladi'], effect: ['Glucose falls within minutes; potassium shifts into cells', 'Qand daqiqalarda tushadi; kaliy hujayraga o‘tadi'],
    build: bolus('insulinRegular', 'units', 'IV'), check: s => [...lowGlucose(s), ...lowK(s)] },
  { id: 'insSc', name: 'Insulin regular · subcutaneous', uz: 'Qisqa insulin · teri ostiga', form: 'injection', route: 'SC', unit: 'units', min: 2, max: 24, step: 1, dose: 8,
    use: ['Mealtime / correction insulin', 'Ovqat oldidan yoki tuzatuvchi insulin'], effect: ['Slower, longer glucose fall than IV', 'Venadagidan sekinroq, uzoqroq qand tushishi'],
    build: bolus('insulinRegular', 'units', 'SC'), check: s => [...lowGlucose(s), ...lowK(s)] },
  { id: 'insDrip', name: 'Insulin infusion (DKA protocol)', uz: 'Insulin infuziyasi (DKA)', form: 'drip', route: 'IV', unit: 'units/kg/h', min: 0.02, max: 0.15, step: 0.01, dose: 0.1,
    use: ['Diabetic ketoacidosis', 'Diabetik ketoatsidoz'], effect: ['Steady glucose and ketone fall; watch potassium', 'Qand bir tekis tushadi; kaliyni kuzating'],
    build: infusion('insulinRegular', 'units/kg/h'), check: s => [...lowGlucose(s), ...lowK(s)] },
  { id: 'd10', name: 'Dextrose 10%', uz: 'Glyukoza 10%', form: 'drip', route: 'IV', unit: 'mL', min: 50, max: 250, step: 25, dose: 150,
    use: ['Hypoglycaemia, or with insulin to prevent it', 'Gipoglikemiya yoki insulin bilan birga'], effect: ['Glucose rises in minutes', 'Qand daqiqalarda ko‘tariladi'], build: bolus('dextrose10', 'mL', 'IV') },
  { id: 'd50', name: 'Dextrose 50%', uz: 'Glyukoza 50%', form: 'injection', route: 'IV', unit: 'mL', min: 10, max: 50, step: 5, dose: 25,
    use: ['Severe hypoglycaemia', 'Og‘ir gipoglikemiya'], effect: ['Fast, large glucose rise', 'Qand tez va kuchli ko‘tariladi'], build: bolus('dextrose50', 'mL', 'IV') },
  { id: 'gel', name: 'Oral glucose gel', uz: 'Og‘iz orqali glyukoza geli', form: 'tablet', route: 'PO', unit: 'g', min: 10, max: 30, step: 5, dose: 15,
    use: ['Mild hypoglycaemia, conscious patient', 'Yengil gipoglikemiya, bemor hushida'], effect: ['Glucose rises over 10–15 min', 'Qand 10–15 daqiqada ko‘tariladi'], build: bolus('glucoseGel', 'g', 'PO') },
  { id: 'glucagon', name: 'Glucagon', uz: 'Glyukagon', form: 'injection', route: 'IM', unit: 'mg', min: 0.5, max: 1, step: 0.5, dose: 1,
    use: ['Severe hypoglycaemia without IV access', 'Vena yo‘q bo‘lganda og‘ir gipoglikemiya'], effect: ['Liver releases glucose', 'Jigar glyukoza chiqaradi'], build: bolus('glucagon', 'mg', 'IM') },
  { id: 'kcl', name: 'Potassium chloride infusion', uz: 'Kaliy xlorid infuziyasi', form: 'drip', route: 'IV', unit: 'mmol/h', min: 5, max: 20, step: 5, dose: 10,
    use: ['Low potassium during insulin therapy', 'Insulin davosida past kaliy'], effect: ['Potassium rises slowly', 'Kaliy sekin ko‘tariladi'], build: infusion('potassiumChloride', 'mmol/h'), check: highK },
  { id: 'bicarb', name: 'Sodium bicarbonate 8.4%', uz: 'Natriy bikarbonat 8,4%', form: 'injection', route: 'IV', unit: 'mL', min: 25, max: 100, step: 25, dose: 50,
    use: ['Severe acidosis (pH < 6.9) in DKA', 'DKAda og‘ir atsidoz (pH < 6,9)'], effect: ['pH and bicarbonate rise; potassium may fall', 'pH va bikarbonat ko‘tariladi; kaliy tushishi mumkin'], build: bolus('sodiumBicarbonate', 'mL', 'IV') },
  { id: 'ns', name: '0.9% Sodium chloride (saline)', uz: '0,9% natriy xlorid (fiziologik eritma)', form: 'drip', route: 'IV', unit: 'mL', min: 250, max: 1000, step: 250, dose: 500,
    use: ['Dehydration in DKA / hyperglycaemia', 'DKA / giperglikemiyada suvsizlanish'], effect: ['Blood pressure and urine output improve', 'Qon bosimi va siydik ajralishi yaxshilanadi'], build: fluid('ns') },
  { id: 'lr', name: 'Ringer lactate', uz: 'Ringer laktat', form: 'drip', route: 'IV', unit: 'mL', min: 250, max: 1000, step: 250, dose: 500,
    use: ['Balanced fluid for dehydration', 'Suvsizlanish uchun muvozanatli eritma'], effect: ['Volume restored with less acidosis', 'Hajm tiklanadi, atsidoz kamroq'], build: fluid('lr') },
  { id: 'kclPo', name: 'Potassium chloride tablets', uz: 'Kaliy xlorid tabletkasi', form: 'tablet', route: 'PO', unit: 'mmol', min: 10, max: 40, step: 10, dose: 20,
    use: ['Mild low potassium', 'Yengil past kaliy'], effect: ['Potassium rises over hours', 'Kaliy soatlar davomida ko‘tariladi'], build: bolus('potassiumChloride', 'mmol', 'PO'), check: highK },
];

export const HEART_DRUGS: ShortDrug[] = [
  { id: 'furo', name: 'Furosemide', uz: 'Furosemid', form: 'injection', route: 'IV', unit: 'mg', min: 20, max: 120, step: 10, dose: 40,
    use: ['Fluid overload, breathlessness', 'Suyuqlik ortiqchaligi, hansirash'], effect: ['Urine output rises; BP and potassium may fall', 'Siydik ko‘payadi; bosim va kaliy tushishi mumkin'], build: bolus('furosemide', 'mg', 'IV'), check: s => [...lowBp(s), ...lowK(s)] },
  { id: 'gtnSl', name: 'Nitroglycerin · under the tongue', uz: 'Nitroglitserin · til ostiga', form: 'tablet', route: 'SL', unit: 'mcg', min: 300, max: 800, step: 100, dose: 400,
    use: ['Acute breathlessness with high BP', 'Yuqori bosim bilan o‘tkir hansirash'], effect: ['Veins dilate; preload and BP fall', 'Venalar kengayadi; yuklama va bosim tushadi'], build: bolus('nitroglycerin', 'mcg', 'SL'), check: lowBp },
  { id: 'gtnIv', name: 'Nitroglycerin infusion', uz: 'Nitroglitserin infuziyasi', form: 'drip', route: 'IV', unit: 'mcg/min', min: 10, max: 200, step: 10, dose: 20,
    use: ['Acute pulmonary oedema', 'O‘tkir o‘pka shishi'], effect: ['Dose-dependent BP and preload fall', 'Dozaga bog‘liq bosim tushishi'], build: infusion('nitroglycerin', 'mcg/min'), check: lowBp },
  { id: 'dobu', name: 'Dobutamine infusion', uz: 'Dobutamin infuziyasi', form: 'drip', route: 'IV', unit: 'mcg/kg/min', min: 2.5, max: 15, step: 2.5, dose: 5,
    use: ['Low cardiac output', 'Past yurak chiqarishi'], effect: ['Contractility and heart rate rise', 'Yurak qisqarishi va puls oshadi'], build: infusion('dobutamine', 'mcg/kg/min') },
  { id: 'norepi', name: 'Norepinephrine infusion', uz: 'Noradrenalin infuziyasi', form: 'drip', route: 'IV', unit: 'mcg/kg/min', min: 0.02, max: 0.5, step: 0.01, dose: 0.05,
    use: ['Cardiogenic shock with low BP', 'Past bosimli kardiogen shok'], effect: ['Blood pressure rises', 'Qon bosimi ko‘tariladi'], build: infusion('norepinephrine', 'mcg/kg/min') },
  { id: 'metoPo', name: 'Metoprolol tablet', uz: 'Metoprolol tabletkasi', form: 'tablet', route: 'PO', unit: 'mg', min: 12.5, max: 100, step: 12.5, dose: 25,
    use: ['Rate control, chronic HF therapy', 'Puls nazorati, surunkali davo'], effect: ['Heart rate and BP fall', 'Puls va bosim pasayadi'], build: bolus('metoprolol', 'mg', 'PO'), check: lowBp },
  { id: 'amio', name: 'Amiodarone', uz: 'Amiodaron', form: 'injection', route: 'IV', unit: 'mg', min: 150, max: 300, step: 50, dose: 150,
    use: ['Atrial fibrillation / arrhythmia in HF', 'Yurak yetishmovchiligida aritmiya'], effect: ['Heart rate slows', 'Puls sekinlashadi'], build: bolus('amiodarone', 'mg', 'IV') },
  { id: 'hep', name: 'Heparin · subcutaneous', uz: 'Geparin · teri ostiga', form: 'injection', route: 'SC', unit: 'units', min: 2500, max: 7500, step: 2500, dose: 5000,
    use: ['Clot prevention in hospitalised HF', 'Kasalxonadagi bemorda tromb profilaktikasi'], effect: ['Anticoagulation builds over hours', 'Qon ivishi soatlar ichida kamayadi'], build: bolus('heparin', 'units', 'SC') },
  { id: 'asa', name: 'Aspirin', uz: 'Aspirin', form: 'tablet', route: 'PO', unit: 'mg', min: 75, max: 300, step: 25, dose: 75,
    use: ['Ischaemic heart disease', 'Yurak ishemik kasalligi'], effect: ['Platelet inhibition', 'Trombotsitlar faolligi pasayadi'], build: bolus('aspirin', 'mg', 'PO') },
  { id: 'mg', name: 'Magnesium sulfate', uz: 'Magniy sulfat', form: 'injection', route: 'IV', unit: 'g', min: 1, max: 2, step: 0.5, dose: 2,
    use: ['Arrhythmia, low magnesium from diuretics', 'Diuretiklardan past magniy, aritmiya'], effect: ['Stabilises heart rhythm', 'Yurak ritmini barqarorlashtiradi'], build: bolus('magnesium', 'g', 'IV') },
  { id: 'kclHf', name: 'Potassium chloride tablets', uz: 'Kaliy xlorid tabletkasi', form: 'tablet', route: 'PO', unit: 'mmol', min: 10, max: 40, step: 10, dose: 20,
    use: ['Low potassium after diuretics', 'Diuretikdan keyin past kaliy'], effect: ['Potassium rises over hours', 'Kaliy soatlar davomida ko‘tariladi'], build: bolus('potassiumChloride', 'mmol', 'PO'), check: highK },
];

export const shortDrugsFor = (preset: Preset) => preset === 'heart' ? HEART_DRUGS : DIABETES_DRUGS;
export const formLabel = (f: Form, uz: boolean) => ({ injection: uz ? 'Ukol' : 'Injection', tablet: uz ? 'Tabletka' : 'Tablet', drip: uz ? 'Tomchi / infuziya' : 'Drip / infusion' })[f];
