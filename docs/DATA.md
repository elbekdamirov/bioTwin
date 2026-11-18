# Open data used by BioTwin

| Dataset | Licence | Used for | File |
|---|---|---|---|
| CDC/NCHS NHANES 2017–March 2020 pre-pandemic (P_DEMO, P_DIQ, P_GHB, P_BPXO, P_TCHOL, P_HDL, P_TRIGLY, P_BIOPRO, P_ALB_CR, P_BMX, P_SMQ, P_MCQ, P_BPQ, P_PAQ, P_RXQ_RX) | Public domain (US Government work) | 1,085 real adults with diagnosed diabetes | `src/biotwin/chronic/data/nhanes-diabetes.json` |
| UCI Heart Failure Clinical Records (Chicco & Jurman, BMC Med Inform Decis Mak 2020; original data Ahmad et al., PLoS ONE 2017) | CC BY 4.0 | 299 real heart-failure patients and a MAGGIC calibration check | `src/biotwin/chronic/data/uci-heart-failure.json`, `calibration.json` |

Records are de-identified at source. BioTwin keeps the original participant/row number in the patient ID (`NHANES-<SEQN>`, `UCI-HF-<row>`) so every twin can be traced back to the public file.

## Rebuild

```powershell
New-Item -ItemType Directory -Force data/raw/nhanes, data/raw/uci
foreach ($f in 'P_DEMO','P_DIQ','P_GHB','P_BPXO','P_TCHOL','P_HDL','P_TRIGLY','P_BIOPRO','P_ALB_CR','P_BMX','P_SMQ','P_MCQ','P_RXQ_RX','P_BPQ','P_PAQ') { Invoke-WebRequest "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/$f.xpt" -OutFile "data/raw/nhanes/$f.xpt" }
Invoke-WebRequest "https://archive.ics.uci.edu/static/public/519/heart+failure+clinical+records.zip" -OutFile data/raw/uci_hf.zip
Expand-Archive data/raw/uci_hf.zip data/raw/uci -Force
npx tsx scripts/data/build-cohorts.ts
```

`scripts/data/xpt.mjs` is a small SAS XPORT v5 reader (IBM floating point), so no Python or SAS is needed.

## Derivations

* Diabetes: `DIQ010 = 1`, age ≥ 18, not pregnant. Exclusions: 335 participants missing HbA1c, BP, lipids, creatinine, height or weight.
* Probable type 1: diagnosed before 30, on insulin, no tablets.
* Duration: age − `DID040`.
* SBP: mean of `BPXOSY1–3`.
* LDL: `LBDLDNSI` (NIH equation 2) where measured. Otherwise non-HDL − 0.8 mmol/L, flagged as assumed.
* eGFR: CKD-EPI 2021.
* Exercise: ≥ 210 min/week of recreational activity, with vigorous minutes counted double.
* Prior CVD: CHF, CHD, angina, MI or stroke.
* Medicines: generic names from `RXDDRUG`, mapped to catalogue classes.
* UCI: creatinine mg/dL × 88.42; NYHA III (cohort inclusion III–IV); SBP 140 if `high_blood_pressure` else 120; typical height/weight. All assumptions are listed in the UI.
