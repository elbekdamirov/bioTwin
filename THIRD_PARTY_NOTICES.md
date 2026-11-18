# Third-party notices

## Vitalis source

The supplied archive has no top-level license grant. The working copy retains upstream documentation and a Vitalis reference entry. Verify distribution rights with the Vitalis rightsholders before publicly sharing or deploying the combined application.

## MakeHuman

The avatar mesh, rig, weights, targets and eye texture derive from MakeHuman assets. The Vitalis asset register identifies Data Collection AB, Joel Palmius, and Jonas Hauquier and documents conversions and morph additions. [Upstream CC0 1.0 license](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md) · [Vitalis asset register](ASSETS.md)

## BodyParts3D

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. [Official license notice](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)

The GLBs derive from BodyParts3D 4.0. Vitalis documents selection, reorientation, simplification, compression, runtime fitting and approximate derived heart, lung and spinal surfaces. Its register reports CC BY-SA 2.1 Japan headers in the legacy OBJ files and treats the GLBs as share-alike adaptations. Reconcile those headers with the published database terms for the exact source release before redistribution. [Vitalis asset register](ASSETS.md)

## Fonts and libraries

DM Sans, IBM Plex Mono and Instrument Serif ship as Latin or Latin Extended WOFF2 subsets. Their SIL Open Font License texts are in [public/fonts](public/fonts). Lucide icons are subject to the [Lucide ISC and MIT notices](https://lucide.dev/license). Package versions are pinned in the lockfile and the installed packages carry their original notices.

## Steno Type 1 Risk Engine software adaptation

The five-year adapter is based on the MIT-licensed implementation by Michaela Liegertová and co-authors at https://github.com/MichaLie/t1d-cvd-risk-calculators, commit 9814f654871a784649b065f793a0738694e7fc16. The original Steno Python source and complete license are retained in third_party/steno. BioTwin ports the composite cardiovascular endpoint to TypeScript and adds local input validation and reporting. It uses no QRISK3 code from that repository.

The underlying clinical model is Vistisen et al., Circulation (2016), DOI 10.1161/CIRCULATIONAHA.115.018844. The published model and the application adaptation have distinct validation scopes. See docs/FORECAST_MODEL.md.

## Health Digital Twin workflow reference
The user-supplied health-digital-twin-main.zip (Sanga Shiva Sai; README project link https://github.com/shivasaisanga/health-digital-twin) informed the record, intake, history, goal and appointment workflows. These are independently implemented in TypeScript/SQLite here. Its Python source, model binaries and synthetic dataset are not redistributed or used for clinical predictions. See docs/ZIP_UPGRADE.md for the source hash and audit.

## Open patient data

**NHANES 2017–March 2020 pre-pandemic** — Centers for Disease Control and Prevention, National Center for Health Statistics. Public-domain US Government work. Derived records ship in `src/biotwin/chronic/data/nhanes-diabetes.json`.

**Heart Failure Clinical Records** — UCI Machine Learning Repository (dataset 519). Chicco D, Jurman G. *BMC Medical Informatics and Decision Making* 2020;20:16. Original data: Ahmad T et al. *PLoS ONE* 2017;12(7):e0181001. Licensed CC BY 4.0. Derived records ship in `src/biotwin/chronic/data/uci-heart-failure.json`, with clinical assumptions listed per record.

## Published risk equations

UKPDS Risk Engine parameters (UKPDS 56 and 60; University of Oxford Diabetes Trials Unit), MAGGIC score (Pocock et al. 2013), Kidney Failure Risk Equation (Tangri et al. 2011/2016) and CKD-EPI 2021 are implemented from their published coefficients. No third-party source code is copied.
