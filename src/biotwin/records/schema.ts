import {z} from 'zod';
import {ForecastInputsSchema} from '../forecast/steno';
import {ClinicalSchema} from '../chronic/types';
export const ProfileSchema = z.object({
  patientId:z.string().uuid().nullable().default(null),
  displayName:z.string().trim().min(1).max(80).default('Synthetic patient'),
  // Legacy 'obesity' and 'general' (asthma) presets were removed; such records open as type 2 diabetes profiles.
  preset: z.preprocess(v => v === 'obesity' || v === 'general' ? 't2d' : v, z.enum(['t2d', 'diabetes', 'heart'])),
  seed: z.string().trim().min(1).max(60),
  age: z.number().int().min(18).max(95),
  sex: z.enum(['female', 'male']),
  height: z.number().min(140).max(205),
  weight: z.number().min(40).max(180),
  activity: z.enum(['low', 'moderate', 'high']),
  history: z.string().max(250),
  drugAllergies: z.string().max(250).default(''),
  currentMedicines: z.string().max(1000).default(''),
  labNotes: z.string().max(2000).default(''),
  lifestyleNotes: z.string().max(2000).default(''),
  genetics: z.object({
    status: z.enum(['not-tested', 'pending', 'available']),
    gene: z.string().max(80),
    variant: z.string().max(200),
    classification: z.enum(['unknown', 'benign', 'likely-benign', 'uncertain', 'likely-pathogenic', 'pathogenic']),
    source: z.string().max(250),
    familyHistory: z.string().max(1000),
  }).default({status:'not-tested',gene:'',variant:'',classification:'unknown',source:'',familyHistory:''}),
  forecast: ForecastInputsSchema.nullable().default(null),
  clinical: ClinicalSchema.nullable().default(null),
  lab: z.union([z.literal(''), z.coerce.number<string | number>().min(1).max(50)]),
});

const optionalNumber=(min:number,max:number)=>z.number().finite().min(min).max(max).nullable().default(null);
export const ObservationSchema=z.object({
  recordedAt:z.iso.datetime({offset:true}),
  weightKg:optionalNumber(40,180), heightCm:optionalNumber(140,205),
  systolicBp:optionalNumber(60,250), diastolicBp:optionalNumber(30,160),
  glucoseMmol:optionalNumber(1,50), sleepHours:optionalNumber(0,24),
  activityMinutes:optionalNumber(0,3000), waterLitres:optionalNumber(0,12),
  dietQuality:optionalNumber(1,10), stressLevel:optionalNumber(1,10),
  smoking:z.boolean().nullable().default(null), alcohol:z.boolean().nullable().default(null),
  familyHistory:z.boolean().nullable().default(null), notes:z.string().max(2000).default(''),
}).strict().superRefine((v,ctx)=>{
  if(v.systolicBp!==null&&v.diastolicBp!==null&&v.systolicBp<=v.diastolicBp)ctx.addIssue({code:'custom',path:['systolicBp'],message:'Systolic pressure must exceed diastolic pressure.'});
  if(v.weightKg!==null&&v.heightCm!==null){const bmi=v.weightKg/(v.heightCm/100)**2;if(bmi<16||bmi>50)ctx.addIssue({code:'custom',path:['weightKg'],message:'BMI must be between 16 and 50 for the current avatar.'});}
});
export const goalMetrics=['weightKg','systolicBp','glucoseMmol','sleepHours','activityMinutes'] as const;
export const GoalInputSchema=z.object({metric:z.enum(goalMetrics),targetValue:z.number().finite(),dueDate:z.iso.date()}).strict().superRefine((v,ctx)=>{
  const bounds={weightKg:[40,180],systolicBp:[60,250],glucoseMmol:[1,50],sleepHours:[0,24],activityMinutes:[0,3000]};
  const [lo,hi]=bounds[v.metric];if(v.targetValue<lo||v.targetValue>hi)ctx.addIssue({code:'custom',path:['targetValue'],message:'Target is outside the supported measurement range.'});
});
export const AppointmentInputSchema=z.object({clinician:z.string().trim().min(1).max(80),scheduledAt:z.iso.datetime({offset:true}),notes:z.string().max(1000).default('')}).strict();
export const AppointmentStatusSchema=z.enum(['requested','confirmed','declined','cancelled','completed']);
export type Observation=z.infer<typeof ObservationSchema>;
export type StoredObservation=Observation&{id:string;createdAt:string};
export type Goal={id:string;metric:typeof goalMetrics[number];baselineValue:number;targetValue:number;dueDate:string;createdAt:string};
export type Appointment=z.infer<typeof AppointmentInputSchema>&{id:string;status:z.infer<typeof AppointmentStatusSchema>;createdAt:string};
export type PatientRecord={id:string;profile:z.infer<typeof ProfileSchema>;createdAt:string;updatedAt:string};
export type PatientBundle=PatientRecord&{observations:StoredObservation[];goals:Goal[];appointments:Appointment[];sessions:{id:string;label:string;createdAt:string}[];audit:{action:string;createdAt:string}[]};
