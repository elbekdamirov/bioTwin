import { z } from 'zod';

const num = (min: number, max: number) => z.number().finite().min(min).max(max).nullable().default(null);

/** Long-term clinical baseline used by the 5-year forecast. Units: HbA1c %, lipids mmol/L, creatinine µmol/L, ACR mg/g. */
export const ClinicalSchema = z.object({
  source: z.string().max(160).default('Entered manually'),
  durationYears: num(0, 80),
  hba1c: num(4, 16),
  sbp: num(70, 230),
  totalChol: num(1.5, 15),
  hdl: num(0.3, 4),
  ldl: num(0.3, 12),
  egfr: num(5, 150),
  acr: num(0, 5000),
  creatinine: num(20, 1500),
  smoker: z.boolean().default(false),
  exercise: z.boolean().default(false),
  priorCvd: z.boolean().default(false),
  atrialFibrillation: z.boolean().default(false),
  retinopathy: z.boolean().default(false),
  ef: num(5, 80),
  nyha: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().default(null),
  copd: z.boolean().default(false),
  diabetes: z.boolean().default(false),
  hfOver18Months: z.boolean().default(false),
  meds: z.array(z.string().max(40)).max(30).default([]),
  /** Fields filled with stated assumptions because the source did not record them. */
  assumed: z.array(z.string().max(80)).max(20).default([]),
  /** Medicines exactly as recorded in the source dataset (display only). */
  recordedMeds: z.array(z.string().max(80)).max(30).default([]),
}).strict();
export type Clinical = z.infer<typeof ClinicalSchema>;

export type ChronicCondition = 't2d' | 't1d' | 'hf';

/** Everything the engine needs: profile demographics + clinical baseline. */
export type ClinicalPatient = Clinical & { condition: ChronicCondition; age: number; sex: 'female' | 'male'; weightKg: number; heightCm: number };

export const emptyClinical = (): Clinical => ClinicalSchema.parse({});
