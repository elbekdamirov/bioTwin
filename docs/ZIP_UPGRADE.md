# Health Digital Twin ZIP integration

## Source inspected

User-supplied `health-digital-twin-main.zip`, SHA-256 `BA7E737A4410164CA38A02148EF17F8F990C65B411226C756794A47F43D2F500`.

The README identifies Sanga Shiva Sai and links [health-digital-twin](https://github.com/shivasaisanga/health-digital-twin). It describes the project as MIT, but the supplied archive has no standalone LICENSE file. This upgrade independently implements compatible record-workflow concepts in the existing TypeScript application. It does not redistribute the archive's Python source, model binaries, dataset or developer photo.

Inspected `database/db.py`, `database/schema.sql`, `models/train_model.py`, `utils/forecast.py`, the README and application structure. The database implementation uses SQLite. `schema.sql` is a separate MySQL schema. No populated database is supplied in this ZIP.

## Integrated workflows

| ZIP capability | BioTwin implementation |
|---|---|
| Users / health records | Local clinician workspace with multiple named synthetic patient records and SQLite persistence |
| Intake | Dated check-ins: height, weight, blood pressure, glucose, sleep, activity, water, diet, stress, smoking, alcohol, family history and notes |
| Health timeline | Actual observation tables and date-based charts, preserving missing values |
| Goals | Measurement targets with observed baselines and transparent progress; no invented health score |
| Appointments | Local planning records with requested/confirmed/declined/cancelled/completed transitions |
| Reports / export | Complete patient-record JSON, observation CSV and printable patient record, alongside existing simulation reports |
| Saved digital twins | Compressed worker states and A/B frame histories stored in SQLite and restored from Patient records → Sessions |
| Patient body | Latest recorded height and weight feed the existing 3D morph on opening a twin |

The requested **Disease in 3D** navigation section is removed. Height and weight continue to determine body shape for any patient, including the diabetes and heart-failure presets. No separate disease toggle is required. Body habitus is illustrative, not a body-composition scan.

## Scientific scope

The ZIP's `train_model.py` generates 6,000 synthetic rows and produces labels from hand-written formulas plus random noise. Its reported held-out AUC is measured against those synthetic labels, not an external clinical cohort. Its trend code can substitute record sequence for calendar days when all records share a date. Neither is used as a clinically validated prognosis, treatment-benefit estimate or automatic diagnosis.

The existing sourced Steno five-year cardiovascular risk model and educational Vitalis drug-response engine remain separate. Recorded measurements are distinguished from simulated biomarkers. Check-in height and weight are explicitly applied when opening the twin; other recorded laboratory measurements are not silently substituted into acute physiology. Genetic records and free-text medicines remain context with the existing limited allergy checks.

## Run and storage

Use Node 24 LTS or newer with built-in `node:sqlite`. No Python, MySQL server or new runtime package is required.

```text
npm install
npm run dev
```

`npm run dev` starts the API and Vite together. Open `http://localhost:5173` and select **Patient records**. Existing `npm run dev:web` remains available for front-end-only development, but database actions need the API. Production local preview: `npm run build`, then `npm start`, then open `http://localhost:8787`.

Database path defaults to `data/biotwin.sqlite`; override with server environment variable `BIOTWIN_DB_PATH`. Tables are initialized automatically and foreign keys/WAL are enabled. Schema version is 2. `data/`, SQLite journal files and `.env` are ignored and excluded from source ZIPs.

**Save session** retains a browser-local copy. **Save twin to database** persists patient identity, compressed engine state and recorded A/B frames. Restore it through **Patient records → select patient → Sessions**. Opening from latest measurements intentionally starts a new scenario; restoring a saved twin resumes its saved clock and treatments.

For a file backup, stop the server cleanly before copying the `data` directory. JSON/CSV/PDF exports are available per patient. Source ZIPs intentionally contain no patient database, API keys or local sessions.

## Local access boundary

This is a synthetic-data prototype for one local workspace. The API binds to `127.0.0.1`; records routes additionally reject non-loopback callers and external browser origins, and return `Cache-Control: no-store`. SQLite queries are parameterized, schemas validate inputs, and compressed twin payloads have bounded size/decompression. CSV fields are escaped and protected against spreadsheet-formula execution.

This upgrade does not provide multi-user authentication, verified doctor accounts, email OTP, real appointment booking, emergency email alerts or production health-data hosting. Those parts of the source ZIP are not claimed as implemented. No messages or patient data are sent externally by the records workflows.

## Verification

Unit/API checks cover database restart persistence, patient isolation, measurement validation, observed goal progress, appointment transitions, audit entries, compressed-session ownership, exports, local-origin restrictions and missing forecast inputs. Browser workflows cover creating a patient, recording measurements, setting a goal, updating an appointment, exports/print, reload persistence, opening a high-weight twin and saving/restoring both treatment branches from SQLite. Existing anatomy, treatment, forecast and narration workflows are retained.
