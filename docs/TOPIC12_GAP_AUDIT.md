# Topic 12 gap audit

| Requirement | Before rebuild | After rebuild and evidence |
|---|---|---|
| Real 3D and reveal | Local Vitalis avatar, anatomy GLBs, pick, isolation, orbit and zoom. | The graphite stage adds layered controls and an anchored label. Browser verification loaded `human.bin` and `cardiovascular.glb`, selected and isolated a structure, orbited and reset. |
| Matched twins | Independent workers, bounded clock, saved compare, branch toggle. | B is configured independently and the matched time ruler preserves review position on a branch switch. Playwright checks matching exported ticks, A unchanged by a B action, and reset B matching A. One viewport alternates authentic snapshots. |
| Treatment settings | One fixed insulin setting. | Two bounded regular-insulin settings use the catalog rate unit and native action schema. Vitest verifies both change the model by different amounts and unsupported rates are rejected. Playwright verifies the lower rate in B’s exported action payload. |
| Patient provenance | Profile fields and contextual glucose/history. | Each field has a provenance label. Structured metadata can be saved and exported. Engine tests verify height and weight influence the generated patient and metadata leaves the scenario unchanged. Genetics remain unsupported. |
| Preset scope | Generic “chronic risk” label over the asthma case. | Acute asthma explicitly labeled. Heart failure remains anatomy-only, and scenario generation rejects it. |
| Five-year outlook | Qualitative 1/3/5-year questions. | Separate research workspace shows missing inputs and quantitative forecast unavailable. Steno owner and paper reviewed. No longitudinal coefficients or patient uploads. Playwright checks the unavailable state. |
| Evidence and reports | Offline explanation, local save, JSON/CSV/print. | JSON adds profile provenance and forecast status. Print has provenance and source event logs. Browser checks save/reload, recorded replay position, both downloads and print CSS. A Chromium PDF was generated during visual QA. |
| Design and locale | Light shell and repeated banners. | Dark default, saved light override, reworked responsive studio and stage, concise English and Uzbek action copy. Raw engine messages and anatomical asset names remain source text. Playwright checks theme, Uzbek controls and four screen sizes. Physical-device testing and comprehensive accessibility certification remain unverified. |
| Legacy and licensing | Vitalis reference entry and attribution present. | Reference entry stays at `/vitalis.html`. No verified top-level license grant. Review the third-party notices before redistribution. |

## Checks

Baseline `npm install`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm test` completed. Baseline Vitest counted 52 passing tests. The npm audit reported 21 inherited dependency findings.

Rebuild validation used `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npx playwright install chromium`, `npm run test:e2e` and the running `npm run dev` server. The new engine suite counted 54 passing tests and the production-preview browser suite counted three passing tests. BioTwin browser tests run on Chromium with software WebGL, including 1440×900, 1280×800, 768×1024 and 390×844. The dev server uses [localhost:5174](http://localhost:5174/) while 5173 is occupied. The reference Vitalis browser suite was outside this rebuild’s browser run.

[Desktop capture](screenshots/biotwin-desktop.png) · [Comparison capture](screenshots/biotwin-comparison.png) · [Tablet capture](screenshots/biotwin-tablet.png) · [Mobile capture](screenshots/biotwin-mobile.png)

## Five-year model implementation update

The five-year gap is now implemented for eligible Type 1 diabetes profiles using the Steno composite cardiovascular endpoint. The MIT source is pinned and retained with its license. New clinical inputs are independent of the acute worker, persist with the profile and appear with the result and provenance in the report and JSON. The adapter reproduces the upstream 6.1% and 16.4% five-year test fixtures, compares every coefficient against retained source and refuses unsupported profiles. The published model was externally validated in Danish cohorts; BioTwin has no Uzbekistan calibration validation or longitudinal insulin-treatment-benefit estimate.

Validation on this update passed 70 Vitest tests and eight Playwright workflows, including profile inputs, numerical result, ineligible prior-CVD case, forecast edit without advancing the acute clock, save/reload, JSON/print and a phone form flow.
