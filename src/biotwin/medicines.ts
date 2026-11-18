import { DRUG_MAP } from "@/sim/pharmacology/drugs";
import type { SimSnapshot } from "@/sim/engine/snapshot";
import { intervention, type Profile, type TreatmentExperiment } from "./model";

export const treatmentIds = (p: Profile["preset"]) =>
  p === "heart" ? ["furosemide"] : ["insulinRegular", "dextrose10"];
export const defaultTreatment = (p: Profile["preset"]) =>
  treatmentIds(p)[0] ?? "";
export function selectedTreatment(
  profile: Profile,
  id: string,
  rate: number,
): TreatmentExperiment | null {
  if (!treatmentIds(profile.preset).includes(id)) return null;
  if (id === "insulinRegular" || id === "furosemide")
    return intervention(profile.preset, rate);
  const drug = DRUG_MAP[id]!;
  const dose = drug.defaultDose!;
  return {
    label: drug.name,
    settings: `${dose.amount} ${dose.unit} · ${dose.route} · virtual experiment`,
    actions: [
      {
        type: "drug.bolus",
        drugId: id,
        dose: dose.amount,
        unit: dose.unit,
        route: dose.route,
      },
    ],
    mechanism: drug.notes,
  };
}
export function treatmentCheck(p: Profile, id: string, s?: SimSnapshot) {
  const blocks: string[] = [];
  const name = DRUG_MAP[id]?.name.toLowerCase() ?? id;
  const aliases: Record<string, string[]> = {
    insulinRegular: ["insulin"],
    dextrose10: ["dextrose", "glucose"],
    furosemide: ["furosemide", "lasix"],
    salbutamol: ["salbutamol", "albuterol"],
    ipratropium: ["ipratropium"],
  };
  const allergies = p.drugAllergies
    .toLowerCase()
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    allergies.some(
      (a) =>
        name.includes(a) ||
        (aliases[id] ?? []).some((alias) => a.includes(alias)),
    )
  )
    blocks.push("A matching drug allergy is recorded.");
  if (!s) blocks.push("No active physiology snapshot.");
  if (s && id === "insulinRegular" && s.phys.chem.glucose < 4)
    blocks.push("Current simulated glucose is below 4 mmol/L.");
  if (s && id === "insulinRegular" && s.phys.chem.k < 3.5)
    blocks.push("Current simulated potassium is below 3.5 mmol/L.");
  if (s && id === "dextrose10" && s.phys.chem.glucose >= 4)
    blocks.push(
      "Glucose rescue is reserved for simulated hypoglycaemia below 4 mmol/L.",
    );
  if (s && id === "furosemide" && (s.phys.cv.sbp < 90 || s.phys.chem.k < 3.5))
    blocks.push(
      "Low simulated blood pressure or potassium: this demonstration is blocked.",
    );
  return {
    blocks,
    notes: [
      `Body weight ${p.weight} kg is used by the engine's distribution and per-kg doses.`,
      ...(p.currentMedicines
        ? [
            "Recorded medicines require manual interaction review. Automatic interaction checking is not implemented.",
          ]
        : []),
      ...(p.forecast
        ? [
            `Recorded eGFR ${p.forecast.egfr} is a risk-model input. Acute drug clearance uses the engine's generated renal physiology.`,
          ]
        : []),
      ...(id === "furosemide"
        ? [
            "This chronic reduced-pump model does not establish fluid overload. Diuresis is a pharmacology experiment, not a recommendation.",
          ]
        : []),
    ],
  };
}
