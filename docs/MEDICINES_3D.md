# Medicines and condition views

## Implemented actions

| Patient preset | Available simulated treatment | Engine response to inspect |
|---|---|---|
| Type 1 diabetes, acute insulin deficiency | Regular insulin infusion at existing bounded engine settings | Glucose and potassium changes, delayed insulin action |
| Type 1 diabetes, simulated glucose below 4 mmol/L | Dextrose 10% rescue | Direct glucose and water delivery |
| Chronic reduced-pump-function heart failure | Furosemide, existing engine default IV experiment | Urine output, potassium, blood pressure and volume effects |
| Asthma | Salbutamol, ipratropium, supplemental oxygen | Airway effects, oxygen saturation, heart rate and potassium |

Use **Treatment Lab → select a medicine → Create matched twin → Configure B → Confirm and apply → Compare → Run comparison**. Drug names, settings, mechanisms, active drugs and patient-record checks are visible. Drug actions are logged only on the chosen branch. Reports include those events and both branches' measured physiology, including the new urine-output and ejection-fraction metrics.

These actions use the inherited open-source Vitalis pharmacology, not generated percentages. Its PK/PD parameters are educational approximations, not clinically validated individual drug-response models. References support drug roles and qualitative mechanisms; they do not validate the simulator's numerical magnitude. Default experimental settings come from its existing drug catalog. They are not prescribing advice.

## Patient records and limits

Age, sex, height, weight, activity and selected condition feed the generated physiology. Heart-failure history reduces baseline left-ventricular contractility using the existing patient generator. This chronic case has no unrelated acute pathology. The scenario schema now permits zero acute pathology entries for this purpose. Its history does not establish congestion, and a furosemide demonstration is not a recommendation for every person with heart failure.

Comma-separated drug allergies are matched against supported drug names and aliases and block matching experiments. Insulin is blocked below simulated glucose 4 mmol/L or potassium 3.5 mmol/L. Dextrose rescue is blocked when glucose is not low. Furosemide is blocked with simulated SBP below 90 mmHg or potassium below 3.5 mmol/L. These are limited demonstration guards, not complete prescribing checks.

Current medicines are retained for manual interaction review. Free-text laboratory results, free-text history, genetic variants and current-medicine notes are not converted into guessed pharmacology or automatic treatment recommendations. Steno eGFR is a long-term risk-model input; acute drug clearance continues to use the engine's generated renal physiology. This distinction is displayed beside the medicine cards. Five-year medicine benefit remains unsupported by Steno and is not inferred from short-term drug response.

## 3D views


**Type 1 diabetes → Abdomen** opens the abdominal anatomy and explains pancreatic insulin production. **Heart failure → Heart** opens cardiovascular anatomy and displays simulated ejection fraction. Diabetes cannot be diagnosed from skin appearance. A generic heart mesh is not a scan demonstrating chamber enlargement. No unsupported lesions, oedema or drug-induced shrinking of the body are added.

## Clinical sources

- [NIDDK: insulin and diabetes medicines](https://www.niddk.nih.gov/health-information/diabetes/overview/insulin-medicines-treatments)
- [NHLBI: heart-failure treatment](https://www.nhlbi.nih.gov/health/heart-failure/treatment)
- [FDA: furosemide injection prescribing information](https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/018267s029lbl.pdf) — oedema indications, hypersensitivity/anuria contraindications and fluid/electrolyte monitoring.
- [NHLBI: asthma treatment](https://www.nhlbi.nih.gov/health/asthma/treatment-action-plan)

## Verification

74 unit tests and 11 browser workflows passed. Added checks verify isolated furosemide diuresis and potassium changes, bronchodilator activity, allergy/low-glucose/low-potassium guards, obesity body parameters, anatomy asset loading and report drug events. Desktop screenshots in `docs/screenshots/` show all three condition views and the heart-failure experiment. Numerical changes shown are simulator outputs, not validated patient outcomes.

> Update: the obesity preset was removed. Long-term medicines (metformin, SGLT2 inhibitors, GLP-1 receptor agonists, statins, RAS blockers, finerenone and heart-failure therapies) are modelled in the 5-year forecast; see FORECAST_MODEL.md.
