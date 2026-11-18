# Model provenance

| Input | Modeled presets | Heart failure |
|---|---|---|
| Preset | Selects Vitalis DKA or acute asthma pathway | Anatomy-only route |
| Generation code | Seeds patient construction and worker random streams | Seeds anatomy appearance |
| Age, sex, height and weight | Constrain patient generation and baseline calibration | Configure 3D morphology |
| Activity | Bounded fitness proxy, not habitual exercise measurement | Configures appearance |
| Entered glucose and history | Context annotations, saved and reported | Context annotations |
| Forecast clinical inputs | Steno composite-CVD model only; independent of Vitalis | Ineligible |
| Genetics | Unsupported | Unsupported |

| Output | Source |
|---|---|
| Glucose and potassium | Vitalis snapshot `phys.chem` |
| HR and arterial pressure | `phys.cv` |
| Arterial saturation and respiratory rate | `phys.resp` |
| ECG | Synthesized from recorded simulation rhythm and morphology |
| A/B difference | B minus A at a matching tick |
| Events and action payloads | Vitalis worker event and action logs |
| Explanation | Deterministic text using recorded samples and documented model mechanisms |
| Five-year estimate | Steno Type 1 Risk Engine, published coefficients ported from pinned MIT source. See [forecast review](FORECAST_MODEL.md). |

Two bounded simulator settings use regular insulin at half and full catalog default, in the catalog default units. The adapter validates the rate and native action, and the original infusion path converts it against model weight. These are parameters for synthetic acute DKA experiments. They establish no clinical dose recommendation or patient-specific response. The original anatomy and engine are credited in the third-party notices.
