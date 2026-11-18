# BioTwin integration map

| Area | Vitalis code | BioTwin integration |
|---|---|---|
| Engine | `SimulationEngine.ts`, `snapshot.ts`, `sim.worker.ts` | The worker owns model state. An advance request validates and queues actions, then steps the engine in a bounded batch. Legacy continuous time and skip are preserved. |
| Client | `src/client/simClient.ts` | Independent clients use create, onCreated, onError, setSpeed(0), advance, allEvents, serialize, restore and dispose. |
| Profiles | `src/sim/scenarios/schema.ts`, `src/sim/patient/generator.ts` | Exact height and weight pass through seeded generation before calibration. Age, sex and fitness constrain generation. History and manually supplied glucose are annotations. |
| 3D | `PatientAvatar.tsx`, `AnatomyLayers.tsx`, `CameraRig.tsx`, `visualState.ts` | The clean upright stage uses the real rig and anatomy. Live or replayed snapshots drive animation and skin cues. |
| Monitor | `src/ui/monitor/waveforms.ts`, `SimSnapshot.phys` | The same Vitalis ECG generator uses snapshot morphology and rhythm. Numeric measurements read engine fields. |
| Original app | `src/App.tsx`, `src/main.tsx`, `server/` | The retained frontend is available at `/vitalis.html`. BioTwin has a separate root entry point and runs with the optional API offline. |

## Model support

- The type 1 diabetes preset adapts Vitalis's DKA case with a six-hour preroll. It uses the original low-insulin and ketogenesis mechanisms and the regular insulin infusion action. The scenario provisions virtual IV access.
- The asthma preset is an acute respiratory demonstration with a 25-minute preroll. The model uses bronchospasm and gas exchange and accepts the supported oxygen device action.
- The heart-failure preset fits the anatomy to the synthetic anthropometrics and provides anatomy education. It has no worker-backed heart-failure trajectory or treatment experiment.
- Heart rate, SBP, DBP, respiratory rate, arterial SaO₂ as a percent, glucose and potassium come from `phys.cv`, `phys.resp` and `phys.chem`. Baseline is the time-zero snapshot after preroll. Additional engine drugs and measurements remain outside BioTwin's constrained experiment interface.

## Timing and limits

A and B start from the same seed and scenario. Each has its own worker. The studio samples every 50 0.1-second ticks. The treatment UI configures B with a catalog-validated virtual setting. Its action enters only the B worker before the first tick in its batch. Differences require matching ticks. The paired run stops if either case terminates. Reset B replays the untreated trajectory to the recorded A horizon. Each experiment covers up to 30 virtual minutes.

Replay presents recorded frames. Saving writes one compressed, versioned snapshot with each serialized engine, including active infusions. Reports show sampled observations and timestamped events. Offline explanations state measured changes and modeled mechanisms.

The five-year research view identifies required clinical inputs and shows the quantitative estimate as unavailable. Longitudinal predictions, numerical uncertainty bands, genetics and validated individualized effects are unavailable. Vitalis's physiology docs describe its lumped circulation, gas exchange, simplified glucose kinetics, pharmacokinetics and references. [Physiology](PHYSIOLOGY.md) · [Architecture](ARCHITECTURE.md)

## Simultaneous twin view

Cloned sessions now display two actual avatars side by side. Each reads its own branch snapshot at the selected tick and shows its own measurement. The shared preset and zoom controls update both views, while pointer selection sets the active inspector branch. No matching recorded frame produces no invented value. Each renderer uses DPR 1 in comparison mode and demand rendering while paused. The breathing cycle now belongs to each avatar visual state, preventing one rendered patient from advancing the other patient's breathing phase.

Reports retain treatment parameters and timestamps, and now explain the separate, unavailable five-year prognosis and its required clinical inputs explicitly. The Reports panel links to the forecast research prerequisites.
