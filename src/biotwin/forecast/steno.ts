import { z } from "zod";

// TypeScript adaptation of the MIT-licensed Steno implementation by
// Michaela Liegertová and co-authors. Full source/license in third_party/steno.
// Vistisen et al., Circulation 2016, Supplemental Table 3 (composite CVD).
export const stenoProvenance = {
  name: "Steno Type 1 Risk Engine",
  version: "Vistisen-2016-composite-CVD",
  endpoint:
    "First fatal or nonfatal cardiovascular event (IHD, ischemic stroke, heart failure or peripheral arterial disease)",
  horizonYears: 5,
  paper: "https://pubmed.ncbi.nlm.nih.gov/26888765/",
  implementation:
    "https://github.com/MichaLie/t1d-cvd-risk-calculators/blob/9814f654871a784649b065f793a0738694e7fc16/eval/models/steno_t1.py",
  commit: "9814f654871a784649b065f793a0738694e7fc16",
  license: "MIT",
  derivation: "4,306 adults with type 1 diabetes in Denmark, without prior CVD",
  externalValidation:
    "2,119 adults with type 1 diabetes in Denmark; five-year C-statistic 0.803",
  populationCaution: "Calibration in Uzbekistan has not been established.",
  uncertainty:
    "Individual confidence intervals are not supplied by this implementation.",
  assumption:
    "Published Poisson-rate risk conversion with baseline inputs held fixed over five years.",
} as const;

export const ForecastInputsSchema = z
  .object({
    durationYears: z.number().finite().min(1).max(90),
    restingSbp: z.number().finite().min(60).max(250),
    ldlMmolL: z.number().finite().min(0.5).max(30),
    hba1cMmolMol: z.number().finite().min(20).max(160),
    egfr: z.number().finite().min(10).max(130),
    albuminuria: z.enum(["normal", "micro", "macro"]),
    smoking: z.boolean(),
    regularExercise: z.boolean(),
    priorCvd: z.boolean(),
  })
  .strict();
export type ForecastInputs = z.infer<typeof ForecastInputsSchema>;
type ForecastProfile = {
  preset: string;
  age: number;
  sex: "female" | "male";
  forecast?: ForecastInputs | null;
};

export const STENO_COEFFICIENTS = {
  intercept: -6.046429053,
  age: 0.040672727,
  female: -0.234111177,
  duration: 0.013062752,
  sbp: 0.005814221,
  ldl: 0.082287009,
  hba1c: 0.012209026,
  micro: 0.437359313,
  macro: 0.738916137,
  log2EgfrUnder40: -0.404318528,
  log2Egfr40Plus: -0.345596046,
  smoking: 0.204224209,
  noExercise: 0.229279688,
} as const;

export type ForecastResult =
  | {
      status: "estimated";
      probability: number;
      annualRate: number;
      linearPredictor: number;
      inputs: ForecastInputs & { age: number; sex: "female" | "male" };
      provenance: typeof stenoProvenance;
    }
  | {
      status: "missing-inputs" | "ineligible";
      reason:
        | "missing"
        | "preset"
        | "age"
        | "duration"
        | "prior-cvd"
        | "invalid-inputs";
      provenance: typeof stenoProvenance;
    };

export function calculateForecast(profile: ForecastProfile): ForecastResult {
  const unavailable = (
    status: "missing-inputs" | "ineligible",
    reason:
      | "missing"
      | "preset"
      | "age"
      | "duration"
      | "prior-cvd"
      | "invalid-inputs",
  ): ForecastResult => ({ status, reason, provenance: stenoProvenance });
  if (profile.preset !== "diabetes") return unavailable("ineligible", "preset");
  if (!Number.isFinite(profile.age) || profile.age < 18 || profile.age > 90)
    return unavailable("ineligible", "age");
  if (!profile.forecast) return unavailable("missing-inputs", "missing");
  const parsed = ForecastInputsSchema.safeParse(profile.forecast);
  if (!parsed.success) return unavailable("ineligible", "invalid-inputs");
  const input = parsed.data;
  if (input.durationYears > profile.age)
    return unavailable("ineligible", "duration");
  if (input.priorCvd) return unavailable("ineligible", "prior-cvd");
  const c = STENO_COEFFICIENTS;
  const egfrCoefficient =
    profile.age < 40 ? c.log2EgfrUnder40 : c.log2Egfr40Plus;
  const lp =
    c.intercept +
    c.age * profile.age +
    c.female * Number(profile.sex === "female") +
    c.duration * input.durationYears +
    c.sbp * input.restingSbp +
    c.ldl * input.ldlMmolL +
    c.hba1c * input.hba1cMmolMol +
    c.micro * Number(input.albuminuria === "micro") +
    c.macro * Number(input.albuminuria === "macro") +
    egfrCoefficient * Math.log2(input.egfr) +
    c.smoking * Number(input.smoking) +
    c.noExercise * Number(!input.regularExercise);
  const annualRate = Math.exp(lp);
  return {
    status: "estimated",
    probability: -Math.expm1(-annualRate * stenoProvenance.horizonYears),
    annualRate,
    linearPredictor: lp,
    inputs: { ...input, age: profile.age, sex: profile.sex },
    provenance: stenoProvenance,
  };
}

export function syntheticForecastInputs(age: number): ForecastInputs {
  return {
    durationYears: Math.min(30, age - 1),
    restingSbp: 130,
    ldlMmolL: 2,
    hba1cMmolMol: 70,
    egfr: 100,
    albuminuria: "normal",
    smoking: false,
    regularExercise: true,
    priorCvd: false,
  };
}
