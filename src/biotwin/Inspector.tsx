import type { ReactNode } from "react";
import {
  ArrowRight,
  ChevronRight,
  Database,
  Download,
  FlaskConical,
  Pencil,
} from "lucide-react";
import type { ForecastRun } from "./chronic/engine";
import { outcomeLabel } from "./chronic/chat";
import { DRUG_BY_ID } from "./chronic/drugs";
import calibration from "./chronic/data/calibration.json";
import {
  ANATOMY_LAYERS,
  type AnatomyLayerId,
  type AnatomyLayerSettings,
  type AnatomyStructureInfo,
} from "@/three/types";
import type { SimSnapshot } from "@/sim/engine/snapshot";
import { Trend } from "./Charts";
import { selectedTreatment } from "./medicines";
import { PatientDataSummary } from "./PatientData";
import { EcgTrace } from "./EcgTrace";
import {
  clock,
  conditionOf,
  metricLabel,
  metrics,
  metricValue,
  modelVersion,
  type Metric,
  type Profile,
} from "./model";
import type { Translate } from "./ProfileEditor";
import { maxTick, type Branch, type useSession } from "./session";

export type Panel =
  | "overview"
  | "prognosis"
  | "anatomy"
  | "lab"
  | "compare"
  | "timeline"
  | "insights"
  | "reports"
  | "model";
export const valueOf = (metric: Metric, s?: SimSnapshot, uz = false) =>
  s ? metricValue(metric, metric.read(s), uz) : "—";
export const caseIds = { t2d: "BT-M02", diabetes: "BT-M01", heart: "BT-C02" };

export function eventFor(s: ReturnType<typeof useSession>, branch: Branch) {
  const count = s.frames[branch][0]?.eventCount ?? 0;
  const baselineId = s.events[branch][count - 1]?.id ?? -1;
  return s.events[branch].find(
    (e) =>
      e.id > baselineId &&
      e.t >= 0 &&
      [
        "drug.bolus",
        "drug.infusion",
        "drug.infusionRate",
        "oxygen.set",
      ].includes(e.code),
  );
}

export function EventLog({
  session,
  branch,
  limit = 7,
}: {
  session: ReturnType<typeof useSession>;
  branch: Branch;
  limit?: number;
}) {
  const events = session.events[branch];
  return events.length ? (
    <div className="event-list">
      {events
        .slice(-limit)
        .reverse()
        .map((e) => (
          <div key={e.id}>
            <time>{clock(e.t)}</time>
            <span>{e.message}</span>
          </div>
        ))}
    </div>
  ) : (
    <p className="muted">No events recorded yet.</p>
  );
}

type Props = {
  t: Translate;
  uz: boolean;
  warning: string;
  title: string;
  session: ReturnType<typeof useSession>;
  panel: Panel;
  changePanel: (p: Panel) => void;
  selected: AnatomyStructureInfo | null;
  layers: AnatomyLayerSettings;
  setLayer: (
    id: AnatomyLayerId,
    props: Partial<AnatomyLayerSettings[AnatomyLayerId]>,
  ) => void;
  isolated: boolean;
  isolate: () => void;
  resetView: () => void;
  focusSelected: () => void;
  snapshot?: SimSnapshot;
  branch: Branch;
  switchBranch: () => void;
  metric: Metric;
  changeMetric: (m: Metric) => void;
  cursor: number | null;
  setCursor: (n: number | null) => void;
  replay: boolean;
  toggleReplay: () => void;
  outlook: boolean;
  setOutlook: (value: boolean) => void;
  clear: () => void;
  edit: () => void;
  drugId: string;
  chooseDrug: (id: string) => void;
  confirm: (b: Branch) => void;
  exportData: (format: "csv" | "json") => void;
  run: ForecastRun | null;
  editClinical: () => void;
  pickPatient: () => void;
  chat: ReactNode;
};

export function ClinicalSummary({
  profile,
  t,
}: {
  profile: Profile;
  t: Translate;
}) {
  const c = profile.clinical;
  if (!conditionOf(profile.preset)) return null;
  if (!c)
    return (
      <p className="notice">
        {t(
          "No clinical measurements yet — the 5-year forecast needs them.",
          "Hali klinik o‘lchovlar yo‘q — 5 yillik prognoz uchun kerak.",
        )}
      </p>
    );
  const rows: [string, string | number | null][] =
    profile.preset === "heart"
      ? [
          [
            t("Ejection fraction", "Chiqarish fraksiyasi"),
            c.ef === null ? null : c.ef + "%",
          ],
          ["NYHA", c.nyha],
          [
            t("Systolic BP", "Sistolik bosim"),
            c.sbp === null ? null : c.sbp + " mmHg",
          ],
          [
            t("Creatinine", "Kreatinin"),
            c.creatinine === null ? null : c.creatinine + " µmol/L",
          ],
          ["eGFR", c.egfr],
          [
            t("Diabetes", "Diabet"),
            c.diabetes ? t("yes", "ha") : t("no", "yo‘q"),
          ],
        ]
      : [
          ["HbA1c", c.hba1c === null ? null : c.hba1c + "%"],
          [t("Years with diabetes", "Diabet yillari"), c.durationYears],
          [
            t("Systolic BP", "Sistolik bosim"),
            c.sbp === null ? null : c.sbp + " mmHg",
          ],
          ["LDL", c.ldl === null ? null : c.ldl + " mmol/L"],
          ["eGFR", c.egfr],
          ["ACR", c.acr === null ? null : c.acr + " mg/g"],
          [t("Smoker", "Chekadi"), c.smoker ? t("yes", "ha") : t("no", "yo‘q")],
        ];
  return (
    <div className="clinical-summary">
      <p className="eyebrow">
        <Database size={12} /> {c.source}
      </p>
      <dl className="facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">
        {t("Current medicines", "Joriy dorilar")}:{" "}
        {c.meds.length
          ? c.meds.map((id) => DRUG_BY_ID[id]?.name ?? id).join(", ")
          : t("none recorded", "qayd etilmagan")}
      </p>
      {c.assumed.length > 0 && (
        <p className="muted small">
          {t("Assumed", "Taxmin qilingan")}: {c.assumed.join("; ")}
        </p>
      )}
    </div>
  );
}

export function ForecastReport({
  run,
  t,
  uz,
}: {
  run: ForecastRun | null;
  t: Translate;
  uz: boolean;
}) {
  if (!run)
    return (
      <p className="muted">
        {t(
          "This condition has no 5-year model.",
          "Bu holat uchun 5 yillik model yo‘q.",
        )}
      </p>
    );
  if (run.missing.length)
    return (
      <p className="notice">
        {t(
          "5-year forecast unavailable — missing: ",
          "5 yillik prognoz yo‘q — yetishmaydi: ",
        )}
        {run.missing.join(", ")}
      </p>
    );
  const plan = [
    ...run.added.map((d) => "+ " + d.name),
    ...run.removed.map((d) => "− " + d.name),
  ].join(", ");
  return (
    <section className="forecast-report">
      <h3>
        {t("5-year forecast", "5 yillik prognoz")}
        {plan && " · " + plan}
      </h3>
      <table>
        <thead>
          <tr>
            <th>{t("Outcome", "Natija")}</th>
            <th>{t("No change", "O‘zgarishsiz")}</th>
            <th>{t("With plan (95% interval)", "Reja bilan (95% oraliq)")}</th>
            <th>{t("Model", "Model")}</th>
          </tr>
        </thead>
        <tbody>
          {run.outcomes.map((o) => (
            <tr key={o.id}>
              <th>{outcomeLabel(o.id, uz ? "uz" : "en")}</th>
              <td>{(o.base.at(-1)! * 100).toFixed(1)}%</td>
              <td>
                {(o.plan.at(-1)! * 100).toFixed(1)}% (
                {(o.planLo * 100).toFixed(1)}–{(o.planHi * 100).toFixed(1)}%)
              </td>
              <td>{o.model}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function MetricPicker({
  metric,
  onChange,
  t,
  uz,
}: {
  metric: Metric;
  onChange: (m: Metric) => void;
  t: Translate;
  uz: boolean;
}) {
  return (
    <label className="metric-picker">
      <span>{t("Biomarker", "Biomarker")}</span>
      <select
        value={metric.key}
        onChange={(e) =>
          onChange(metrics.find((m) => m.key === e.target.value)!)
        }
      >
        {metrics.map((m) => (
          <option key={m.key} value={m.key}>
            {metricLabel(m, uz)} · {m.unit}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelContent(p: Props) {
  const { t, session: s, warning, metric, branch, snapshot, selected } = p;
  const { profile, frames, busy } = s;
  if (!profile) return null;
  const A = frames.A.at(-1),
    B = frames.B.at(-1);
  const current = frames[branch];
  const action = selectedTreatment(profile, p.drugId, 0.1);
  const at = snapshot?.tick;
  const matchA =
    p.cursor === null ? A : frames.A.find((frame) => frame.tick === at);
  const matchB =
    p.cursor === null ? B : frames.B.find((frame) => frame.tick === at);
  const canRun =
    !busy &&
    !!A &&
    A.tick < maxTick &&
    A.status.phase === "active" &&
    (!B || B.status.phase === "active");
  const log = (b: Branch) => <EventLog session={s} branch={b} />;
  const eyebrow = (text: string) => <p className="eyebrow">{text}</p>;
  switch (p.panel) {
    case "overview":
      return (
        <>
          {eyebrow(t("Patient profile", "Bemor profili"))}
          <h2>{p.title}</h2>
          <dl className="facts">
            <div>
              <dt>{t("Age", "Yosh")}</dt>
              <dd>
                {profile.age} {t("y", "yosh")}
              </dd>
            </div>
            <div>
              <dt>{t("Sex", "Jins")}</dt>
              <dd>
                {profile.sex === "female"
                  ? t("Female", "Ayol")
                  : t("Male", "Erkak")}
              </dd>
            </div>
            <div>
              <dt>{t("Height", "Bo‘y")}</dt>
              <dd>{profile.height} cm</dd>
            </div>
            <div>
              <dt>{t("Weight", "Vazn")}</dt>
              <dd>{profile.weight} kg</dd>
            </div>
          </dl>
          <ClinicalSummary profile={profile} t={t} />
          {conditionOf(profile.preset) && (
            <>
              <button className="primary wide" onClick={p.editClinical}>
                <Pencil size={15} />
                {t("Edit measurements", "O‘lchovlarni tahrirlash")}
              </button>
              <button className="secondary wide" onClick={p.pickPatient}>
                <Database size={15} />
                {t(
                  "Choose another real patient",
                  "Boshqa haqiqiy bemorni tanlash",
                )}
              </button>
              <button
                className="text-link"
                onClick={() => p.changePanel("prognosis")}
              >
                {t(
                  "Open 5-year forecast & chat",
                  "5 yillik prognoz va chatni ochish",
                )}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <details>
            <summary>
              {t(
                "History, allergies, lifestyle, genetics",
                "Tarix, allergiya, turmush tarzi, genetika",
              )}
            </summary>
            <PatientDataSummary profile={profile} t={t} />
            <button className="secondary wide" onClick={p.edit}>
              {t("Edit profile", "Profilni tahrirlash")}
            </button>
          </details>
          <hr />
          <button
            className="text-link"
            onClick={() => p.changePanel("anatomy")}
          >
            {t("Inspect heart & anatomy", "Yurak va anatomiyani ko‘rish")}
            <ArrowRight size={16} />
          </button>
        </>
      );
    case "anatomy":
      return (
        <>
          {eyebrow(t("3D model", "3D model"))}
          <h2>{t("Anatomy layers", "Anatomiya qatlamlari")}</h2>
          <p>
            {t(
              "Select a structure in the viewport to inspect it.",
              "Tuzilmani tekshirish uchun 3D oynada tanlang.",
            )}
          </p>
          <div className="layer-list">
            {ANATOMY_LAYERS.map(({ id, label }) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={p.layers[id].visible}
                  onChange={(e) =>
                    p.setLayer(id, { visible: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <label className="range-label">
            {t("Skin opacity", "Teri shaffofligi")}{" "}
            <span>{Math.round(p.layers.skin.opacity * 100)}%</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(p.layers.skin.opacity * 100)}
              onChange={(e) =>
                p.setLayer("skin", { opacity: +e.target.value / 100 })
              }
            />
          </label>
          <button className="secondary wide" onClick={p.isolate}>
            {p.isolated
              ? t("Exit isolation", "Ajratishni bekor qilish")
              : selected
                ? t(
                    "Isolate selected structure",
                    "Tanlangan tuzilmani ajratish",
                  )
                : t(
                    "Isolate cardiovascular system",
                    "Yurak-qon tomir tizimini ajratish",
                  )}
          </button>
          <button className="text-link" onClick={p.resetView}>
            {t("Reset layers & camera", "Qatlam va kamerani tiklash")}
          </button>
          {selected && (
            <div className="inset">
              <p className="eyebrow">
                {selected.system} {selected.fmaId && "· " + selected.fmaId}
              </p>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <button className="text-link" onClick={p.focusSelected}>
                {t(
                  "Focus selected structure",
                  "Tanlangan tuzilmaga yaqinlashish",
                )}
              </button>
            </div>
          )}
        </>
      );
    case "lab":
      return (
        <>
          {eyebrow(
            t("Short-term test · minutes", "Qisqa muddatli sinov · daqiqalar"),
          )}
          <h2>{t("Give medicine now", "Hozir dori berish")}</h2>
          <p className="muted">
            {t(
              "Choose an injection, tablet or drip and its dose. It is given to twin B; twin A stays untreated so you see the exact difference in glucose, potassium, pressure and urine.",
              "Ukol, tabletka yoki tomchi va dozasini tanlang. Dori B egizakka beriladi; A davolanmaydi, shunda qand, kaliy, bosim va siydikdagi aniq farqni ko‘rasiz.",
            )}
          </p>
          <button
            className="primary wide big-action"
            disabled={busy || !A}
            onClick={() => p.confirm("B")}
          >
            <FlaskConical size={17} />
            {t("Choose medicine & dose", "Dori va dozani tanlash")}
          </button>
          {B && (
            <button
              className="secondary wide"
              disabled={!canRun}
              onClick={() => {
                p.clear();
                void s.advanceFiveMinutes();
              }}
            >
              {t("Watch next 5 minutes", "Keyingi 5 daqiqani ko‘rish")}
            </button>
          )}
          {B && (
            <p className="comparison-value">
              {metricLabel(metric, p.uz)} B − A:{" "}
              {matchA && matchB && matchA.tick === matchB.tick
                ? metricValue(
                    metric,
                    metric.read(matchB) - metric.read(matchA),
                    p.uz,
                  )
                : "—"}{" "}
              <small>{metric.unit}</small>
            </p>
          )}
          {(B ?? A) && (B ?? A)!.drugs.length > 0 && (
            <>
              <h3>{t("Active in twin B", "B egizakda faol")}</h3>
              {(B ?? A)!.drugs.map((d) => (
                <p key={d.id}>
                  <b>{d.name}</b> · {d.totalGiven}
                </p>
              ))}
            </>
          )}
          <h3>{t("Event log", "Hodisalar jurnali")} · B</h3>
          {log("B")}
          {conditionOf(profile.preset) && (
            <button
              className="text-link"
              onClick={() => p.changePanel("prognosis")}
            >
              {t(
                "Long-term tablets → 5-year forecast",
                "Uzoq muddatli dorilar → 5 yillik prognoz",
              )}
              <ArrowRight size={15} />
            </button>
          )}
        </>
      );
    case "compare":
      return (
        <>
          {eyebrow(t("Parallel experiment", "Parallel tajriba"))}
          <h2>{t("Compare twins", "Egizaklarni taqqoslash")}</h2>
          {!A ? (
            <p>
              {t(
                "Select a modeled patient to run a comparison.",
                "Taqqoslash uchun modellashtirilgan bemorni tanlang.",
              )}
            </p>
          ) : (
            <>
              <p>
                {t(
                  "Cloning starts both branches from the same seed at 00:00. Changes to B stay on B.",
                  "Nusxalash ikkala egizakni bir xil qiymat bilan 00:00 dan boshlaydi. B dagi o‘zgarishlar B da qoladi.",
                )}
              </p>
              <div className="branch-pair">
                <div>
                  <b>A</b>
                  {t("Baseline", "Boshlang‘ich")}
                  <time>{clock(A.t)}</time>
                </div>
                <div>
                  <b>B</b>
                  {t("Intervention", "Muolaja")}
                  <time>{B ? clock(B.t) : "—"}</time>
                </div>
              </div>
              {!B && (
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => {
                    p.clear();
                    void s.clone();
                  }}
                >
                  {t("Create matched twin", "Mos egizak yaratish")}
                </button>
              )}
            </>
          )}
          {B && A && (
            <>
              <button
                className="secondary wide"
                disabled={!canRun}
                onClick={() => p.confirm("B")}
              >
                {t("Give medicine to B", "B ga dori berish")}
              </button>
              <button
                className="primary wide"
                disabled={!canRun}
                onClick={() => {
                  p.clear();
                  void s.advanceFiveMinutes();
                }}
              >
                {t("Run comparison · +5 min", "Taqqoslash · +5 daqiqa")}
              </button>
              <div className="mini-grid">
                <button
                  disabled={busy}
                  onClick={() => {
                    p.clear();
                    void s.resetB();
                  }}
                >
                  {t("Reset B", "B ni tiklash")}
                </button>
                <button onClick={p.switchBranch}>
                  {t("Swap view", "Ko‘rinishni almashtirish")}
                </button>
              </div>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => void s.save()}
              >
                {t("Save comparison", "Taqqoslashni saqlash")}
                <Download size={15} />
              </button>
              <hr />
              <h3>{metricLabel(metric, p.uz)} · B − A</h3>
              <p className="comparison-value">
                {matchA && matchB && matchA.tick === matchB.tick
                  ? metricValue(
                      metric,
                      metric.read(matchB) - metric.read(matchA),
                      p.uz,
                    )
                  : "—"}{" "}
                <small>{metric.unit}</small>
              </p>
              {(["A", "B"] as const).map((b) => (
                <details key={b}>
                  <summary>
                    {t("Events", "Hodisalar")} · {b}
                  </summary>
                  {log(b)}
                </details>
              ))}
            </>
          )}
        </>
      );
    case "prognosis":
      return conditionOf(profile.preset) ? (
        <>{p.chat}</>
      ) : (
        <>
          {eyebrow(t("5-year forecast", "5 yillik prognoz"))}
          <h2>{t("Not available for asthma", "Astma uchun mavjud emas")}</h2>
          <p>
            {t(
              "The 5-year medicine forecast covers type 2 diabetes, type 1 diabetes and heart failure. Asthma has short-term simulation only.",
              "5 yillik dori prognozi 2-tur diabet, 1-tur diabet va yurak yetishmovchiligini qamraydi. Astma uchun faqat qisqa muddatli simulyatsiya bor.",
            )}
          </p>
          <button className="primary wide" onClick={() => p.changePanel("lab")}>
            {t("Open short-term test", "Qisqa muddatli sinovni ochish")}
          </button>
        </>
      );
    case "timeline":
      return (
        <>
          {eyebrow(t("Recorded simulation", "Qayd etilgan simulyatsiya"))}
          <h2>{t("Time Machine", "Vaqt bo‘ylab")}</h2>
          <div className="mini-grid">
            <button
              aria-pressed={!p.outlook}
              onClick={() => p.setOutlook(false)}
            >
              {t("Recorded", "Qaydlar")}
            </button>
            <button aria-pressed={p.outlook} onClick={() => p.setOutlook(true)}>
              {t("5-year outlook", "5 yillik istiqbol")}
            </button>
          </div>
          {p.outlook ? (
            <ForecastReport run={p.run} t={t} uz={p.uz} />
          ) : (
            <>
              <label className="range-label">
                {t("Snapshot", "Namuna")} · {branch}
                <span>{snapshot ? clock(snapshot.t) : "—"}</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, current.length - 1)}
                  value={p.cursor ?? Math.max(0, current.length - 1)}
                  disabled={current.length < 2}
                  onChange={(e) => p.setCursor(+e.target.value)}
                />
              </label>
              <div className="mini-grid">
                <button
                  disabled={current.length < 2 || busy}
                  onClick={p.toggleReplay}
                >
                  {p.replay
                    ? t("Pause replay", "Qayta ijroni to‘xtatish")
                    : t("Replay", "Qayta ijro")}
                </button>
                <button disabled={p.cursor === null} onClick={p.clear}>
                  {t("Back to live", "Joriy holatga qaytish")}
                </button>
              </div>
              {log(branch)}
            </>
          )}
        </>
      );
    case "insights": {
      const event = eventFor(s, branch);
      const baseline = current[0];
      return (
        <>
          {eyebrow(t("Offline explanation", "Oflayn tushuntirish"))}
          <h2>{t("Why did this change?", "Nima uchun o‘zgardi?")}</h2>
          <MetricPicker
            t={t}
            metric={metric}
            onChange={p.changeMetric}
            uz={p.uz}
          />
          {snapshot && baseline ? (
            <>
              <p>
                <b>{metricLabel(metric, p.uz)}</b> ·{" "}
                {valueOf(metric, baseline, p.uz)} →{" "}
                {valueOf(metric, snapshot, p.uz)} {metric.unit} ·{" "}
                {clock(snapshot.t)}
              </p>
              {event && event.t <= snapshot.t ? (
                <>
                  <p>
                    <b>{clock(event.t)}</b> · {event.message}
                  </p>
                  <p>
                    {p.uz
                      ? profile.preset === "diabetes"
                        ? "Model insulin ta’sirida glyukozaning hujayralarga o‘tishini va kaliy siljishini hisoblaydi."
                        : "Model nafasga olinadigan kislorod o‘zgarishini gaz almashinuvida hisoblaydi."
                      : action?.mechanism}
                  </p>
                  <p>
                    {t(
                      "The order of the events is an observed simulation association. Compare samples at the same time to inspect the modeled effect.",
                      "Hodisalar ketma-ketligi simulyatsiyada kuzatilgan bog‘liqlik. Model ta’siri uchun bir vaqtdagi namunalarni taqqoslang.",
                    )}
                  </p>
                </>
              ) : (
                <p>
                  {t(
                    "No study intervention was recorded by this sample. Baseline physiology and the scenario can still change the marker.",
                    "Ushbu namuna vaqtigacha muolaja qayd etilmagan. Fiziologiya va ssenariy biomarkerni o‘zgartirishi mumkin.",
                  )}
                </p>
              )}
            </>
          ) : (
            <p>
              {t(
                "This profile has no recorded biomarker changes.",
                "Bu profilda biomarker o‘zgarishlari qayd etilmagan.",
              )}
            </p>
          )}
        </>
      );
    }
    case "reports":
      return (
        <>
          <details className="forecast-report-preview" open>
            <summary>
              {t(
                "5-year forecast in this report",
                "Hisobotdagi 5 yillik prognoz",
              )}
            </summary>
            <ForecastReport run={p.run} t={t} uz={p.uz} />
          </details>
          {eyebrow(t("Provenance & export", "Manba va eksport"))}
          <h2>{t("Reports", "Hisobotlar")}</h2>
          <p>
            {t(
              "Download recorded samples and event logs or print a summary of this session.",
              "Namunalar va hodisalarni yuklab oling yoki sessiya hisobotini chop eting.",
            )}
          </p>
          <button className="primary wide" onClick={() => window.print()}>
            {t("Print / Save PDF", "Chop etish / PDF")}
          </button>
          <button
            className="secondary wide"
            disabled={!A}
            onClick={() => p.exportData("csv")}
          >
            <Download size={15} />
            {t("Time series CSV", "Vaqt qatori CSV")}
          </button>
          <button
            className="secondary wide"
            onClick={() => p.exportData("json")}
          >
            <Download size={15} />
            {t("Session & events JSON", "Sessiya va hodisalar JSON")}
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void s.save()}
          >
            {t("Save local session", "Mahalliy sessiyani saqlash")}
          </button>
        </>
      );
    case "model":
      return (
        <>
          {eyebrow(modelVersion)}
          <h2>{t("About the model", "Model haqida")}</h2>
          <h3>{t("5-year forecast", "5 yillik prognoz")}</h3>
          <p>
            {t(
              "Baseline risk: UKPDS 56 & 60 (type 2 diabetes heart attack and stroke), Steno Type 1 Risk Engine (type 1 diabetes), MAGGIC (heart-failure survival), KFRE (kidney failure when eGFR < 60).",
              "Boshlang‘ich xavf: UKPDS 56 va 60 (2-tur diabetda infarkt va insult), Steno 1-tur xavf modeli, MAGGIC (yurak yetishmovchiligida yashovchanlik), KFRE (eGFR < 60 da buyrak yetishmovchiligi).",
            )}
          </p>
          <p>
            {t(
              "Medicine effects: placebo-adjusted biomarker changes and hazard ratios from randomised outcome trials, with Monte Carlo 95% intervals.",
              "Dori ta’siri: platsebo bilan solishtirilgan biomarker o‘zgarishlari va randomizatsiyalangan sinovlardagi xavf nisbatlari, Monte-Karlo 95% oraliqlari bilan.",
            )}
          </p>
          <h3>{t("Real open data", "Haqiqiy ochiq ma’lumotlar")}</h3>
          <p>
            {t(
              "1,085 adults with diagnosed diabetes from CDC NHANES 2017–March 2020 (public domain) and 299 heart-failure patients from the UCI Heart Failure Clinical Records (CC BY 4.0).",
              "CDC NHANES 2017–2020 dan tashxisli diabetli 1 085 katta yoshli va UCI yurak yetishmovchiligi yozuvlaridan 299 bemor.",
            )}
          </p>
          <h3>
            {t(
              "Calibration check on real outcomes",
              "Haqiqiy natijalarda kalibrlash tekshiruvi",
            )}
          </h3>
          <p>
            {t(
              `In the UCI cohort, MAGGIC predicted ${(calibration.overall.predicted * 100).toFixed(0)}% mortality at ${calibration.horizonDays} days; ${(calibration.overall.observed * 100).toFixed(0)}% actually died. It ranked patients correctly (observed ${calibration.byThird.map((g) => (g.observed * 100).toFixed(0) + "%").join(" → ")} across predicted-risk thirds) but underestimated absolute risk in this South-Asian hospital cohort. Local recalibration is needed before clinical use in Uzbekistan.`,
              `UCI guruhida MAGGIC ${calibration.horizonDays} kunda ${(calibration.overall.predicted * 100).toFixed(0)}% o‘limni bashorat qildi; aslida ${(calibration.overall.observed * 100).toFixed(0)}% vafot etgan. Model bemorlarni to‘g‘ri tartiblagan (${calibration.byThird.map((g) => (g.observed * 100).toFixed(0) + "%").join(" → ")}), lekin mutlaq xavfni past baholagan. O‘zbekistonda qo‘llashdan oldin mahalliy kalibrlash kerak.`,
            )}
          </p>
          <h3>{t("Short-term physiology", "Qisqa muddatli fiziologiya")}</h3>
          <p>
            {t(
              "Vitalis engine: 0.1 s steps, lumped circulation, gas exchange, glucose dynamics and pharmacokinetics for minute-scale experiments.",
              "Vitalis: 0,1 s qadamlar, qon aylanishi, gaz almashinuvi, glyukoza dinamikasi va farmakokinetika.",
            )}
          </p>
          <p className="notice">{warning}</p>
        </>
      );
  }
}

export function Inspector(props: Props) {
  const { panel, t, snapshot, session, branch } = props;
  const history = session.frames[branch];
  return (
    <aside
      className={panel === "prognosis" ? "inspector chat-mode" : "inspector"}
      aria-label={t("Inspector", "Tafsilotlar")}
    >
      <section key={panel} className="inspector-panel">
        <PanelContent {...props} />
      </section>
      {snapshot && panel !== "prognosis" && (
        <section className="monitor">
          <div className="monitor-head">
            <p className="eyebrow">
              {t("At", "Vaqt")} {clock(snapshot.t)}
            </p>
            <span>{branch}</span>
          </div>
          <h2>{t("Biomarkers", "Biomarkerlar")}</h2>
          <EcgTrace
            snapshot={snapshot}
            label={t("Synthesized ECG", "Model EKGsi")}
          />
          {[
            props.metric,
            ...metrics.filter((m) => m.key !== props.metric.key),
          ].map((m) => (
            <button
              key={m.key}
              className={
                m.key === props.metric.key ? "metric active" : "metric"
              }
              aria-label={
                t("Why did this change?", "Nima uchun o‘zgardi?") +
                " " +
                metricLabel(m, props.uz)
              }
              onClick={() => {
                props.changeMetric(m);
                props.changePanel("insights");
              }}
            >
              <div>
                <span>{metricLabel(m, props.uz)}</span>
                <strong>
                  {valueOf(m, snapshot, props.uz)} <small>{m.unit}</small>
                </strong>
                <small>
                  {t("Baseline", "Boshlang‘ich")}{" "}
                  {valueOf(m, history[0], props.uz)}
                </small>
              </div>
              <Trend
                small
                frames={{
                  A: history
                    .slice(0, (props.cursor ?? history.length - 1) + 1)
                    .slice(-24),
                  B: [],
                }}
                metric={m}
              />
              <ChevronRight size={13} />
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
