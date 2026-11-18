# BioTwin AI

A digital-twin studio for Uzbekistan’s National AI Hackathon, challenge 12: **digital twins for chronic patients**. Patients with diabetes or heart failure have no individualised way to see how a medicine will affect *their* body before it is prescribed. BioTwin builds a twin from a patient’s measurements. The doctor tries a medicine on the twin and gets a **5-year forecast** for the heart, brain, kidneys and metabolism. An interactive 3D body shows the result.

* **Real open data.** 1,085 adults with diabetes from CDC NHANES 2017–2020 and 299 heart-failure patients from the UCI Heart Failure Clinical Records. You can also enter your own patient.
* **Realistic model.** Validated risk equations (UKPDS 56/60, Steno Type 1, MAGGIC, KFRE) combined with hazard ratios and biomarker effects from randomised trials, with 95% uncertainty intervals. See [docs/FORECAST_MODEL.md](docs/FORECAST_MODEL.md).
* **Forecast chatbot.** Ask “Add empagliflozin”, “Compare semaglutide vs sitagliptin”, “Semaglutid qo‘shsam nima bo‘ladi?” or “добавить джардинс”. Answers come from the model, never invented. Optional OpenAI phrasing when `OPENAI_API_KEY` is set.
* **Short-term physiology.** The Vitalis engine still runs minute-by-minute A/B experiments (insulin, furosemide, bronchodilators).

**Research and education prototype — not for clinical decisions.** The models have not been calibrated in Uzbekistan. On real UCI outcomes, MAGGIC ranked risk correctly but underestimated absolute mortality.

## Run on Windows

Use **Node 24 LTS or newer** with built-in SQLite. The task brief specifies Node 20.12+, but the inherited Vite and Vitest versions require newer Node versions. Verification used Node 26.13.1.

Command Prompt

```cmd
npm install
copy .env.example .env
npm run dev
```

PowerShell

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open [http://localhost:5173](http://localhost:5173), or use the **Local** URL Vite prints if 5173 is occupied. `npm run dev` starts both the API and frontend. The local database is created automatically at `data/biotwin.sqlite`; no Python or MySQL setup is needed. BioTwin's records, simulations, 5-year forecast and chatbot need no API key. The original Vitalis reference is at `/vitalis.html`.

## Patient records and database

Open **Patient records** in the header. Create a named synthetic patient, add dated health check-ins, view recorded trends, set measurement goals and manage local appointment records. Use **Open twin from latest measurements** to apply recorded height and weight to the 3D body. There is no separate Disease in 3D section.

**Save twin to database** stores the simulation clock, both workers and treatment histories. Restore it from **Patient records → Sessions**. **Save session** still saves a browser-local copy. JSON, CSV and printable record exports are on the patient’s **Export** tab. [ZIP integration, scientific audit, storage and local access limits](docs/ZIP_UPGRADE.md).

## Run the demo

1. Select **Start with a real diabetes patient**. This opens a real NHANES participant. Alternatively, use **Browse 1,384 real patients** or **Enter my own patient**.
2. The studio opens on **5-year forecast**. The dashboard shows the patient’s current 5-year risks and body markers.
3. In **Ask the twin**, type or click “Add empagliflozin”. The chat answers with absolute risk change, NNT, trial evidence and side effects. The dashboard compares *no change* vs *new plan*, and the 3D view focuses the affected organ.
4. Tick **Show body at year 5** to render the projected weight, and select organ cards to focus them in 3D. Use **Add or change medicine** to build a plan without chat.
5. **Patient → Edit measurements** changes HbA1c, blood pressure, lipids, kidney function and current medicines. The forecast updates immediately.
6. **Short-term test** and **Compare A / B** run the minute-scale Vitalis physiology. **Reports** prints or exports everything, including the 5-year forecast.

## Commands and troubleshooting

| Command | Purpose |
|---|---|
| `npm run build` | Type-check and build BioTwin and the Vitalis reference entry |
| `npm run typecheck` | Check TypeScript |
| `npm test` | Run original and BioTwin engine tests |
| `npx playwright install chromium` | Install the browser used for UI tests |
| `npm run test:e2e` | Run BioTwin browser tests against a production preview |
| `npm run test:e2e:vitalis` | Run retained Vitalis browser workflows |

See the [Topic 12 audit](docs/TOPIC12_GAP_AUDIT.md) for command results and verification limits. The responsive smoke test uses 1440×900, 1280×800, 768×1024 and 390×844.

If WebGL fails, enable graphics acceleration or try a browser with WebGL2 support. The experiment and reports remain available. If a local save is absent or corrupt, start and save a new session. Data saved in one browser origin, including its port, belong to that origin.

## Permissions

NHANES data are public domain; the UCI Heart Failure dataset is CC BY 4.0 (attribution in the app and THIRD_PARTY_NOTICES). The Vitalis source ZIP has no top-level license. Verify permission with the Vitalis rightsholders before public distribution. Confirm the exact BodyParts3D release terms before redistributing its derived GLBs. The initial npm audit reported findings in the inherited dependencies.

[Design system](docs/DESIGN_SYSTEM.md) · [Model provenance](docs/MODEL_PROVENANCE.md) · [Forecast review](docs/FORECAST_MODEL.md) · [Integration map](docs/BIOTWIN_INTEGRATION.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Three-minute demo](docs/BIOTWIN_DEMO.md) · [Original README](docs/VITALIS_README.md)

## Spoken product guide

The interface defaults to black with white text and lime controls. Dark and light modes are available. The theme toggle remains available.

Run the full local app with `npm run dev:full` for narration. Set `VOICELAB_API_KEY` only in the ignored server `.env`. The first visit offers English or Uzbek captions and optional VoiceLab narration. Audio begins after a click. Replay from **Demo guide** in the header. Missing audio falls back to the captions. See [voice integration and checks](docs/VOICE_GUIDE.md).

## Data

See [docs/DATA.md](docs/DATA.md) for sources, licences, derivations and the rebuild script (`npx tsx scripts/data/build-cohorts.ts`).
