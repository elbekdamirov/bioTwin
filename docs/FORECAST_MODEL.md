# Five-year medicine forecast

BioTwin answers one question for a chronic patient: **what will this medicine do to this patient's body over the next five years?** The forecast engine lives in `src/biotwin/chronic/`. The chatbot (`chat.ts`) only phrases numbers that `engine.ts` computed. It never generates numbers itself.

## 1. Baseline risk: validated equations

| Condition | Outcome | Equation | Notes |
|---|---|---|---|
| Type 2 diabetes | Fatal/non-fatal coronary heart disease | UKPDS 56 (Stevens 2001) | Oxford DTU parameter sheet, full precision; time-varying covariates, hazard `q·d^(D+k)` per year |
| Type 2 diabetes | Fatal/non-fatal stroke | UKPDS 60 (Kothari 2002) | Includes atrial fibrillation |
| Type 1 diabetes | First cardiovascular event (IHD, stroke, HF, PAD) | Steno Type 1 Risk Engine (Vistisen 2016) | MIT port retained in `third_party/steno` |
| Heart failure | All-cause death | MAGGIC (Pocock 2013) | Published integer points and 1/3-year table; years 4–5 extend the year 2–3 hazard |
| Heart failure | HF hospital admission | MAGGIC-scaled | Assumed equal to the mortality hazard (ratio 0.9–1.2 in PARADIGM-HF and DAPA-HF control arms) — labelled approximate in the UI |
| Any, eGFR < 60 with ACR | Kidney failure (dialysis/transplant) | KFRE 4-variable (Tangri 2011/2016) | Non-North-American calibration (baseline 5-year survival 0.9365) |

eGFR from creatinine uses CKD-EPI 2021 (race-free).

## 2. Natural history (no change in treatment)

* HbA1c rises 0.15 %/year in type 2 diabetes (UKPDS progression). Other covariates are held at baseline.
* eGFR declines 1.0 / 2.0 / 4.6 mL/min/1.73 m² per year for normal / micro / macro albuminuria. 4.6 is the CREDENCE placebo slope; 2.0 is an interpolation.
* Age and diabetes duration advance each year inside the equations.

## 3. Medicine effects (`drugs.ts`)

Each medicine carries:

* **Biomarker effects.** Placebo-adjusted changes at full effect (HbA1c, weight, SBP, LDL %, ACR %, eGFR dip and slope factor, ejection fraction), ramped in over 6–12 months. HbA1c effects scale with baseline HbA1c; BP effects scale with baseline SBP. SGLT2 glucose lowering shrinks when eGFR < 45.
* **Outcome hazard ratios** with 95% CIs from the named randomised trials (EMPA-REG OUTCOME, DECLARE-TIMI 58, DAPA-CKD, EMPA-KIDNEY, SUSTAIN-6, FLOW, LEADER, TECOS, ORIGIN, UKPDS 34, HOPE, RENAAL, FIDELIO/FIGARO-DKD, PARADIGM-HF, CIBIS-II, RALES, DAPA-HF, EMPEROR-Reduced, SOLVD, DCCT).
* **Statins** act through CTT 2010: per 1 mmol/L LDL lowering, major vascular events HR 0.78, coronary 0.76, stroke 0.85, death 0.90. Adding a second statin is treated as a switch: only the extra LDL lowering counts.
* **Safety checks**: eGFR thresholds, dual RAS blockade, low blood pressure, albuminuria requirements and retinopathy cautions. A hard stop removes the medicine from the plan and the chatbot explains why.

**No double counting.** For each outcome, a medicine with a trial HR for that outcome acts only through that HR, and its biomarker changes are removed from that outcome's equation. Medicines without an outcome HR act only through the equation's biomarkers. Effects combine multiplicatively; competing risks are ignored.

**Uncertainty.** The 95% interval comes from 400 Monte Carlo draws of each log-HR from its trial confidence interval. It does not include uncertainty in the baseline equation.

## 4. Real data and calibration

`scripts/data/build-cohorts.ts` builds the shipped cohorts from public data (see `docs/DATA.md`):

* 1,085 adults with diagnosed diabetes from **NHANES 2017–March 2020** (1,059 type 2, 26 probable type 1). Measured HbA1c, oscillometric BP (mean of 3), lipids, CKD-EPI eGFR, urine ACR, smoking, physical activity, self-reported CVD and the prescription list.
* 299 patients from the **UCI Heart Failure Clinical Records** (Faisalabad, Pakistan, 2015). The dataset lacks NYHA class, SBP, height/weight and medicines. These are filled with stated assumptions that the UI lists.

**Calibration check on real outcomes.** In the UCI cohort, MAGGIC predicted 7.2% mortality at 240 days; Kaplan–Meier observed mortality was 40.6%. Discrimination held: observed 14% → 37% → 68% across thirds of predicted risk. The fitted recalibration multiplier (8.7×) reflects the early post-admission hazard of that hospital cohort and cannot be extended to five years, so the forecast keeps original MAGGIC and shows this gap as a caveat. Local recalibration on Uzbek follow-up data is required before any clinical use.

## 5. Chatbot

`answer()` parses English, Uzbek (Latin) and Russian drug names and brands (Jardiance/Джардинс, Ozempic, Diabeton…). It handles add / stop / compare / side-effect / "no change" questions and returns:

* text built from engine output, with absolute risk change, NNT, 95% interval, relative effects and biomarkers;
* the forecast run, which updates the dashboard and, with **Show body at year 5**, the 3D body weight;
* the organ to focus in 3D.

If `OPENAI_API_KEY` is set on the server, `/api/ai/forecast` can add a short plain-language summary. It is constrained to the computed facts, and the app works fully without it.

## Limitations

Research and education prototype. Trial HRs apply to populations resembling the trials. Long-term adherence is assumed. No equation was calibrated in Uzbekistan.
