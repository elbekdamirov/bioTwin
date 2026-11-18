import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  FlaskConical,
  GitCompare,
  HeartPulse,
  Layers3,
  MessagesSquare,
  Moon,
  Sun,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { bodyShapeFor, generatePatient } from "@/sim/patient/generator";
import {
  createDefaultLayerSettings,
  type AnatomyLayerId,
  type AnatomyStructureInfo,
} from "@/three/types";
import { DigitalTwinStage, type Angle } from "./DigitalTwinStage";
import { Trend } from "./Charts";
import {
  caseIds,
  eventFor,
  Inspector,
  MetricPicker,
  type Panel,
} from "./Inspector";
import { Modal, namesUz, ProfileEditor } from "./ProfileEditor";
import { exportSession, Report } from "./Report";
import { DrugDialog } from "./DrugDialog";
import {
  clinicalPatient,
  clock,
  conditionOf,
  initialProfile,
  insulinRates,
  metrics,
  presets,
  profileFromRecord,
  type Metric,
  type Preset,
  type Profile,
} from "./model";
import { forecast } from "./chronic/engine";
import { ForecastDashboard, type Plan } from "./chronic/ForecastDashboard";
import { ForecastChat } from "./chronic/ForecastChat";
import { ClinicalEditor, PatientPicker } from "./chronic/ClinicalEditor";
import type { Organ } from "./chronic/chat";
import type { ChronicCondition } from "./chronic/types";
import { defaultTreatment } from "./medicines";
import { maxTick, useSession, type Branch } from "./session";
import { ClinicRecords } from "./records/ClinicRecords";
import { firstVisit, VoiceTour } from "./tour/VoiceTour";

const panels = [
  ["prognosis", "5-year forecast", "5 yillik prognoz", MessagesSquare],
  ["overview", "Patient", "Bemor", ScanLine],
  ["anatomy", "Anatomy 3D", "Anatomiya 3D", Layers3],
  ["lab", "Give medicine now", "Hozir dori berish", FlaskConical],
  ["compare", "Compare A / B", "A / B taqqoslash", GitCompare],
  ["reports", "Reports", "Hisobotlar", FileText],
  ["model", "About the model", "Model haqida", CircleHelp],
] as const;
const presetOrder: Preset[] = ["t2d", "diabetes", "heart"];
const presetIcon = {
  t2d: Activity,
  diabetes: Activity,
  heart: HeartPulse,
} as const;
const presetNoteUz: Record<Preset, string> = {
  t2d: "Haqiqiy NHANES bemorlari · yurak, insult va buyrak 5 yillik prognozi",
  diabetes: "Haqiqiy NHANES bemori · Steno 5 yillik prognozi",
  heart: "Haqiqiy UCI kasalxona bemorlari · 5 yillik yashovchanlik prognozi",
};

function preferredLanguage() {
  try {
    return localStorage.getItem("biotwin-language") === "uz";
  } catch {
    return false;
  }
}

export function App() {
  const s = useSession();
  const [uz, setUz] = useState(preferredLanguage);
  const [light, setLight] = useState(
    () => document.documentElement.dataset.theme === "light",
  );
  const [drugId, setDrugId] = useState("insulinRegular");
  const [, setRate] = useState<number>(insulinRates[1]);
  useEffect(() => {
    const theme = light ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("biotwin-theme", theme);
    } catch {
      /* retain in memory */
    }
  }, [light]);
  const t = (en: string, local: string) => (uz ? local : en);
  const [panel, setPanel] = useState<Panel>("overview");
  const [library, showLibrary] = useState(true);
  const [clinic, setClinic] = useState(false);
  const [guide, setGuide] = useState(firstVisit);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [side, setSide] = useState<Branch>("A");
  const [metric, setMetric] = useState<Metric>(
    metrics.find((m) => m.key === "glucose")!,
  );
  const [angle, setAngle] = useState<Angle>("front");
  const [nonce, setNonce] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [point, setPoint] = useState<[number, number, number] | null>(null);
  const [layers, setLayers] = useState(createDefaultLayerSettings);
  const [isolated, setIsolated] = useState<AnatomyLayerId | null>(null);
  const [selected, select] = useState<AnatomyStructureInfo | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);
  const [outlook, setOutlook] = useState(false);
  const [target, setTarget] = useState<Branch | null>(null);
  const [plan, setPlan] = useState<Plan>({ add: [], remove: [] });
  const [year5, setYear5] = useState(false);
  const [editingClinical, setEditingClinical] = useState(false);
  const [picker, setPicker] = useState<ChronicCondition | null>(null);
  const { profile, frames, playing, setPlaying } = s;
  const patient = useMemo(
    () => (profile ? clinicalPatient(profile) : null),
    [profile],
  );
  const run = useMemo(
    () => (patient ? forecast(patient, plan.add, plan.remove) : null),
    [patient, plan],
  );
  const patientKey = profile ? profile.seed + "/" + profile.preset : "";
  useEffect(() => {
    setPlan({ add: [], remove: [] });
    setYear5(false);
  }, [patientKey]);
  const A = frames.A.at(-1),
    B = frames.B.at(-1);
  const branch = side === "B" && B ? "B" : "A";
  const history = frames[branch];
  const snapshot =
    (cursor === null ? undefined : history[cursor]) ?? history.at(-1);
  const event = eventFor(s, "B") ?? eventFor(s, "A");
  const warning = t(
    "Short-term educational simulation. Clinical decisions require validated evidence.",
    "Qisqa muddatli ta’lim simulyatsiyasi. Klinik qarorlar uchun tasdiqlangan dalillar kerak.",
  );
  const title = (p: Preset) => t(presets[p].title, namesUz[p]);
  const canRun =
    !s.busy &&
    !!A &&
    A.tick < maxTick &&
    A.status.phase === "active" &&
    (!B || B.status.phase === "active");
  const shownWeight =
    year5 && run && !run.missing.length
      ? Math.round(run.trajectory.at(-1)!.plan.weight * 10) / 10
      : profile?.weight;
  const shownAge =
    year5 && profile ? Math.min(95, profile.age + 5) : profile?.age;
  const body = useMemo(() => {
    if (!profile || shownWeight === undefined || shownAge === undefined)
      return null;
    const fitness = { low: 0.2, moderate: 0.5, high: 0.8 }[profile.activity];
    return bodyShapeFor(
      generatePatient(profile.seed, {
        ageRange: [shownAge, shownAge],
        sex: profile.sex,
        heightCm: profile.height,
        weightKg: shownWeight,
        fitnessRange: [fitness, fitness],
      }),
    );
  }, [profile, shownWeight, shownAge]);

  function focusOrgan(organ: Organ) {
    setIsolated(null);
    focus(
      organ === "heart"
        ? "heart"
        : organ === "kidneys" || organ === "metabolism"
          ? "abdomen"
          : "front",
    );
  }

  useEffect(() => {
    document.documentElement.lang = uz ? "uz" : "en";
    try {
      localStorage.setItem("biotwin-language", uz ? "uz" : "en");
    } catch {
      /* retain in memory */
    }
  }, [uz]);

  useEffect(() => {
    if (!replay || cursor === null) return;
    const timer = setTimeout(() => {
      if (cursor >= history.length - 1) setReplay(false);
      else setCursor(cursor + 1);
    }, 360);
    return () => clearTimeout(timer);
  }, [cursor, replay, history.length]);

  function clearPlayback() {
    setCursor(null);
    setReplay(false);
  }

  function focus(next: Angle) {
    setAngle(next);
    setZoom(1);
    setNonce((n) => n + 1);
    if (next === "heart" || next === "abdomen") {
      const layer = next === "heart" ? "cardiovascular" : "digestive";
      setLayers((old) => ({
        ...old,
        skin: { visible: true, opacity: 0.18 },
        [layer]: { visible: true, opacity: 1 },
      }));
    }
  }

  function resetView() {
    setLayers(createDefaultLayerSettings());
    setIsolated(null);
    select(null);
    setPoint(null);
    focus("front");
  }
  function openPanel(next: Panel) {
    setPanel(next);
    if (next === "anatomy" && angle === "front") focus("heart");
    if (matchMedia("(max-width: 630px)").matches) {
      requestAnimationFrame(() =>
        document
          .querySelector(".inspector-panel")
          ?.scrollIntoView({ block: "start" }),
      );
    }
  }
  function pickBranch(b: Branch) {
    setSide(b);
  }

  function enter(preset: Preset) {
    setPanel(conditionOf(preset) ? "prognosis" : "overview");
    showLibrary(false);
    setDraft(null);
    clearPlayback();
    pickBranch("A");
    resetView();
    setRate(insulinRates[1]);
    setDrugId(defaultTreatment(preset));
    setMetric(
      metrics.find(
        (m) => m.key === (preset === "heart" ? "urine" : "glucose"),
      )!,
    );
  }

  async function start(next: Profile) {
    if (await s.start(next)) enter(next.preset);
  }

  async function load(key?: string) {
    const loaded = await s.load(key);
    if (loaded) enter(loaded.preset);
  }

  function toggleReplay() {
    setPlaying(false);
    if (!replay && (cursor === null || cursor === history.length - 1))
      setCursor(0);
    setReplay(!replay);
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={21} />
          </span>
          <strong>BioTwin</strong>
        </div>
        <span className="workspace-name">
          {t("Digital Twin Studio", "Raqamli egizak studiyasi")}
        </span>
        <div className="top-actions">
          <button
            aria-label={t("Patient records", "Bemor yozuvlari")}
            className="secondary records-entry"
            onClick={() => {
              setPlaying(false);
              setClinic(true);
            }}
          >
            <Database size={16} />
            <span>{t("Patient records", "Bemor yozuvlari")}</span>
          </button>
          {profile && !library && !clinic && (
            <button
              className="quiet db-save"
              aria-label={t("Save twin to database", "Egizakni bazaga saqlash")}
              disabled={s.busy}
              onClick={() => void s.saveDatabase()}
            >
              <Database size={16} />
              <span>
                {t("Save twin to database", "Egizakni bazaga saqlash")}
              </span>
            </button>
          )}
          {profile && !library && !clinic && (
            <button
              aria-label={t("Save session", "Sessiyani saqlash")}
              className="quiet save-top"
              disabled={s.busy}
              onClick={() => void s.save()}
            >
              <ArrowDownToLine size={16} />
              <span>{t("Save session", "Saqlash")}</span>
            </button>
          )}
          <button
            className="quiet theme-control"
            aria-label={
              light
                ? t("Switch to dark mode", "Qorong‘i rejimga o‘tish")
                : t("Switch to light mode", "Yorug‘ rejimga o‘tish")
            }
            onClick={() => setLight(!light)}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="quiet"
            aria-label={t("Demo guide", "Demo qo‘llanma")}
            data-tour="guide"
            onClick={() => setGuide(true)}
            aria-expanded={guide}
          >
            <CircleHelp size={16} />
            <span>{t("Demo guide", "Demo qo‘llanma")}</span>
          </button>
          <div
            data-tour="language"
            className="languages"
            aria-label={t("Language", "Til")}
          >
            <button aria-pressed={!uz} onClick={() => setUz(false)}>
              EN
            </button>
            <button aria-pressed={uz} onClick={() => setUz(true)}>
              UZ
            </button>
          </div>
        </div>
      </header>

      {guide && (
        <VoiceTour
          language={uz ? "uz" : "en"}
          setLanguage={(language) => setUz(language === "uz")}
          inStudio={!library && !!profile}
          close={() => setGuide(false)}
        />
      )}
      {(s.problem || s.message) && (
        <div
          className={s.problem ? "banner error" : "banner"}
          role={s.problem ? "alert" : "status"}
        >
          {s.problem || s.message}
        </div>
      )}
      {clinic ? (
        <ClinicRecords
          t={t}
          current={profile}
          close={() => setClinic(false)}
          linked={s.updateRecordIdentity}
          openSession={async (data) => {
            const loaded = await s.load(undefined, data);
            if (loaded) {
              enter(loaded.preset);
              setClinic(false);
            } else throw Error("Saved database session could not be restored.");
          }}
          openTwin={async (record) => {
            if (await s.start(record)) {
              enter(record.preset);
              setClinic(false);
            } else
              throw new Error(
                "The twin could not start. Check the patient measurements.",
              );
          }}
        />
      ) : library || !profile ? (
        <main className="library">
          <div data-tour="welcome" className="intro">
            <p className="eyebrow">
              {t(
                "Digital twin for chronic patients",
                "Surunkali bemorlar uchun raqamli egizak",
              )}
            </p>
            <h1>
              {t("Test the medicine on the twin", "Dorini avval egizakda")}
              <br />
              <em>{t("before the patient.", "sinab ko‘ring.")}</em>
            </h1>
            <p>
              {t(
                "BioTwin builds a virtual copy of a patient with diabetes or heart failure from real lab results, then forecasts what a medicine will do to the heart, brain, kidneys and metabolism over the next 5 years.",
                "BioTwin diabet yoki yurak yetishmovchiligi bor bemorning haqiqiy tahlillari asosida virtual nusxasini yaratadi va dorining keyingi 5 yil davomida yurak, miya, buyrak va moddalar almashinuviga ta’sirini hisoblaydi.",
              )}
            </p>
            <ol className="how-steps">
              <li>
                <b>1</b>
                {t(
                  "Pick a real patient from open data, or enter your own measurements",
                  "Ochiq ma’lumotlardan haqiqiy bemorni tanlang yoki o‘z o‘lchovlaringizni kiriting",
                )}
              </li>
              <li>
                <b>2</b>
                {t(
                  "Ask the twin: “What if I add empagliflozin?”",
                  "Egizakdan so‘rang: “Empagliflozin qo‘shsam-chi?”",
                )}
              </li>
              <li>
                <b>3</b>
                {t(
                  "Compare 5-year risks, body markers and side effects",
                  "5 yillik xavf, tana ko‘rsatkichlari va nojo‘ya ta’sirlarni solishtiring",
                )}
              </li>
            </ol>
            <div data-tour="patients" className="hero-actions">
              <button
                className="primary"
                disabled={s.busy}
                onClick={() => void start(initialProfile("t2d"))}
              >
                {t(
                  "Start with a real diabetes patient",
                  "Haqiqiy diabet bemori bilan boshlash",
                )}
                <ArrowRight size={17} />
              </button>
              <button
                className="secondary"
                disabled={s.busy}
                onClick={() => setPicker("t2d")}
              >
                <Database size={16} />
                {t(
                  "Browse 1,384 real patients",
                  "1 384 haqiqiy bemorni ko‘rish",
                )}
              </button>
              <button
                className="quiet"
                disabled={s.busy}
                onClick={() => setDraft(initialProfile("t2d", false))}
              >
                {t("Enter my own patient", "O‘z bemorimni kiritish")}
              </button>
            </div>
          </div>
          <div className="library-title">
            <h2>{t("Choose a condition", "Kasallikni tanlang")}</h2>
            <button
              className="quiet"
              disabled={s.busy}
              onClick={() => void load()}
            >
              {t("Load saved session", "Saqlangan sessiyani yuklash")}
              <ArrowDownToLine size={15} />
            </button>
          </div>
          <div className="presets">
            {presetOrder.map((preset) => {
              const Icon = presetIcon[preset];
              const condition = conditionOf(preset);
              return (
                <div className="preset-card" key={preset}>
                  <button
                    className="preset-main"
                    disabled={s.busy}
                    onClick={() => void start(initialProfile(preset))}
                  >
                    <div className="card-top">
                      <span className="preset-icon">
                        <Icon size={21} />
                      </span>
                      <span className="eyebrow">{caseIds[preset]}</span>
                    </div>
                    <h3>{title(preset)}</h3>
                    <p>{t(presets[preset].note, presetNoteUz[preset])}</p>
                    <ChevronRight size={19} className="preset-arrow" />
                  </button>
                  {condition && (
                    <button
                      className="text-link card-browse"
                      disabled={s.busy}
                      onClick={() => setPicker(condition)}
                    >
                      {t(
                        "Choose another real patient",
                        "Boshqa haqiqiy bemorni tanlash",
                      )}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {s.recent.length > 0 && (
            <section className="recent">
              <h2>
                {t("Recent saved sessions", "So‘nggi saqlangan sessiyalar")}
              </h2>
              {s.recent.map((entry) => (
                <button
                  className="text-link"
                  key={entry.key}
                  disabled={s.busy}
                  onClick={() => void load(entry.key)}
                >
                  <span>
                    {title(entry.preset)} · {entry.seed}
                  </span>
                  <time dateTime={entry.savedAt}>
                    {new Date(entry.savedAt).toLocaleDateString(
                      uz ? "uz" : "en",
                    )}
                  </time>
                  <ArrowRight size={15} />
                </button>
              ))}
            </section>
          )}
          {profile && (
            <button className="text-link" onClick={() => showLibrary(false)}>
              {t("Return to current twin", "Joriy egizakka qaytish")}
              <ArrowRight size={15} />
            </button>
          )}
          {s.busy && (
            <p role="status">
              {t(
                "Preparing the digital twin…",
                "Raqamli egizak tayyorlanmoqda…",
              )}
            </p>
          )}
        </main>
      ) : (
        <main className="studio">
          <nav
            data-tour="navigation"
            className="rail"
            aria-label={t("Studio sections", "Studiya bo‘limlari")}
          >
            <button
              className="back-link"
              onClick={() => {
                setPlaying(false);
                showLibrary(true);
              }}
            >
              <ArrowLeft size={16} />
              {t("Patient Library", "Kutubxona")}
            </button>
            <div className="rail-links">
              {panels.map(([id, en, local, Icon]) => (
                <button
                  key={id}
                  data-tour={
                    id === "compare"
                      ? "compare"
                      : id === "reports"
                        ? "reports"
                        : undefined
                  }
                  aria-current={panel === id ? "page" : undefined}
                  onClick={() => openPanel(id)}
                >
                  <Icon size={17} />
                  {t(en, local)}
                </button>
              ))}
            </div>
          </nav>
          <div className="workspace">
            <div className="patient-heading">
              <div>
                <p className="eyebrow">
                  {caseIds[profile.preset]} / {profile.displayName} /{" "}
                  {profile.age} {t("y", "yosh")} ·{" "}
                  {profile.sex === "female"
                    ? t("female", "ayol")
                    : t("male", "erkak")}
                </p>
                <h1>{title(profile.preset)}</h1>
              </div>
              {year5 ? (
                <span className="status-pill year5">
                  <i />
                  {t("Showing year 5", "5-yil ko‘rsatilmoqda")} · {shownWeight}{" "}
                  kg
                </span>
              ) : (
                <span className="status-pill">
                  <i />
                  {s.busy
                    ? t("Processing", "Bajarilmoqda")
                    : playing
                      ? t("Running", "Ishlamoqda")
                      : t("Paused", "Pauza")}
                </span>
              )}
            </div>
            <div
              data-tour="stage"
              className={B ? "stage is-comparing" : "stage"}
              data-branch={branch}
            >
              <div className="stage-tools">
                <div className="view-pill">
                  <Box size={15} />
                  {t("Anatomical view", "Anatomik ko‘rinish")}
                </div>
                {B && (
                  <div
                    className="branches"
                    aria-label={t("Displayed twin", "Ko‘rsatilgan egizak")}
                  >
                    {(["A", "B"] as const).map((b) => (
                      <button
                        key={b}
                        aria-pressed={branch === b}
                        onClick={() => pickBranch(b)}
                      >
                        {b}{" "}
                        <span>
                          {b === "A"
                            ? t("Baseline", "Asosiy")
                            : t("Experiment", "Tajriba")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={B ? "twin-views split" : "twin-views"}>
                {body &&
                  (B ? (["A", "B"] as const) : (["A"] as const)).map((twin) => {
                    const displayed = frames[twin].find(
                      (frame) => frame.tick === snapshot?.tick,
                    );
                    return (
                      <div
                        className="twin-viewport"
                        key={twin}
                        data-twin={twin}
                        data-weight-kg={shownWeight}
                        data-tick={displayed?.tick}
                        data-glucose={displayed?.phys.chem.glucose}
                        onPointerDown={() => pickBranch(twin)}
                      >
                        {B && (
                          <div className="twin-caption">
                            <b>{twin}</b>
                            <span>
                              {twin === "A"
                                ? t("Baseline", "Asosiy")
                                : t("Experiment", "Tajriba")}
                            </span>
                            <time>{displayed ? clock(displayed.t) : "—"}</time>
                          </div>
                        )}
                        <DigitalTwinStage
                          body={body}
                          comparison={!!B}
                          snapshot={displayed}
                          animate={playing || replay}
                          layers={layers}
                          isolate={isolated}
                          angle={angle}
                          nonce={nonce}
                          isolateId={isolated ? (selected?.id ?? null) : null}
                          point={point}
                          zoom={zoom}
                          selected={selected}
                          onSelect={(info, intersection) => {
                            if (!info && isolated) return;
                            select(info);
                            setPoint(intersection ?? null);
                            if (info) setPanel("anatomy");
                            else if (angle === "structure") focus("front");
                          }}
                          uz={uz}
                        />
                        {B && displayed && (
                          <div className="twin-reading">
                            {metric.read(displayed).toFixed(metric.digits)}{" "}
                            <small>{metric.unit}</small>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              <div
                className="system-controls"
                aria-label={t("Anatomy layers", "Anatomiya qatlamlari")}
              >
                {(
                  [
                    ["skin", "Skin", "Teri"],
                    ["skeleton", "Skeleton", "Skelet"],
                    ["respiratory", "Lungs", "O‘pka"],
                  ] as const
                ).map(([id, en, local]) => (
                  <button
                    key={id}
                    aria-pressed={
                      layers[id].visible &&
                      !isolated &&
                      (id !== "skin" || layers.skin.opacity > 0.6)
                    }
                    onClick={() => {
                      setIsolated(null);
                      if (id === "skin") {
                        setLayers(createDefaultLayerSettings());
                      } else {
                        setLayers((old) => ({
                          ...old,
                          [id]: { visible: !old[id].visible, opacity: 1 },
                          skin: {
                            visible: true,
                            opacity: old[id].visible ? 1 : 0.16,
                          },
                        }));
                      }
                      select(null);
                      setPoint(null);
                    }}
                  >
                    {t(en, local)}
                  </button>
                ))}
              </div>
              <div className="stage-label">
                <i />
                {selected?.name ??
                  (angle === "heart"
                    ? t("Thorax", "Ko‘krak qafasi")
                    : t("Anatomical model", "Anatomiya"))}
              </div>
              <div className="view-controls">
                {(
                  [
                    ["front", "Front", "Old"],
                    ["back", "Back", "Orqa"],
                    ["heart", "Heart", "Yurak"],
                    ["abdomen", "Abdomen", "Qorin"],
                  ] as const
                ).map(([id, en, local]) => (
                  <button
                    key={id}
                    aria-pressed={angle === id}
                    onClick={() => {
                      setIsolated(null);
                      focus(id);
                    }}
                  >
                    {t(en, local)}
                  </button>
                ))}
                <button
                  aria-label={t("Zoom in", "Yaqinlashtirish")}
                  disabled={zoom <= 0.55}
                  onClick={() => setZoom((z) => Math.max(0.55, z - 0.16))}
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  aria-label={t("Zoom out", "Uzoqlashtirish")}
                  disabled={zoom >= 1.22}
                  onClick={() => setZoom((z) => Math.min(1.22, z + 0.16))}
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  aria-label={t("Reset camera", "Kamerani tiklash")}
                  onClick={() => focus("front")}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
              <span className="stage-hint">
                {t(
                  "Drag to orbit · Scroll to zoom",
                  "Aylantirish uchun suring · Masshtab uchun aylantiring",
                )}
              </span>
            </div>
            {A && (
              <>
                <div data-tour="transport" className="transport">
                  <div className="transport-clock">
                    <Clock3 size={16} />
                    <time>{snapshot ? clock(snapshot.t) : "—"}</time>
                    <span>
                      {cursor !== null
                        ? t("Recorded", "Qayd")
                        : t("Scenario time", "Ssenariy vaqti")}
                    </span>
                  </div>
                  <div className="transport-actions">
                    <button
                      disabled={!canRun}
                      aria-label={
                        playing ? t("Pause", "Pauza") : t("Play", "Boshlash")
                      }
                      onClick={() => {
                        clearPlayback();
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <select
                      aria-label={t("Simulation speed", "Simulyatsiya tezligi")}
                      value={s.speed}
                      onChange={(e) => s.setSpeed(+e.target.value)}
                    >
                      {[1, 5, 20, 60].map((n) => (
                        <option key={n} value={n}>
                          {n}×
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!canRun}
                      onClick={() => {
                        clearPlayback();
                        void s.advanceFiveMinutes();
                      }}
                    >
                      +5 {t("min", "daq")}
                    </button>
                    <button
                      disabled={s.busy}
                      onClick={() => {
                        clearPlayback();
                        void s.reset();
                      }}
                    >
                      <RotateCcw size={15} />
                      <span>{t("Reset", "Tiklash")}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          {panel === "prognosis" && patient && run ? (
            <ForecastDashboard
              run={run}
              patient={patient}
              plan={plan}
              setPlan={setPlan}
              t={t}
              lang={uz ? "uz" : "en"}
              year5={year5}
              setYear5={setYear5}
              onFocus={focusOrgan}
              onEdit={() => setEditingClinical(true)}
            />
          ) : (
            <>
              {A && (
                <section data-tour="metrics" className="chart-panel">
                  <div className="chart-head">
                    <div>
                      <h2>
                        {t("Recorded trends", "Qayd etilgan tendensiyalar")}
                      </h2>
                    </div>
                    <MetricPicker
                      metric={metric}
                      onChange={setMetric}
                      t={t}
                      uz={uz}
                    />
                  </div>
                  <div className="legend">
                    <span>
                      <i />A · {t("Baseline branch", "Boshlang‘ich tarmoq")}
                    </span>
                    {B && (
                      <span>
                        <i />B · {t("Intervention branch", "Muolaja tarmog‘i")}
                      </span>
                    )}
                    {event && (
                      <span>
                        ◇ {clock(event.t)} · {t("Intervention", "Muolaja")}
                      </span>
                    )}
                  </div>
                  <div className="plot-scroll">
                    <Trend
                      frames={frames}
                      metric={metric}
                      event={event?.t}
                      cursor={cursor === null ? undefined : snapshot?.t}
                    />
                  </div>
                  {history.length > 1 && (
                    <div className="time-ruler">
                      <label htmlFor="review-time">
                        {t("Review time", "Vaqtni ko‘rish")}
                      </label>
                      <input
                        id="review-time"
                        type="range"
                        min="0"
                        max={history.length - 1}
                        value={cursor ?? history.length - 1}
                        onChange={(e) => {
                          setPlaying(false);
                          setReplay(false);
                          setCursor(+e.target.value);
                        }}
                      />
                      <time>{clock(snapshot?.t ?? 0)}</time>
                      {cursor !== null && (
                        <button className="quiet" onClick={clearPlayback}>
                          {t("Live", "Joriy")}
                        </button>
                      )}
                    </div>
                  )}
                  {!canRun && !s.busy && (
                    <p className="muted">
                      {t(
                        "The experiment window has ended. Reset to start again.",
                        "Tajriba yakunlandi. Qayta boshlash uchun tiklang.",
                      )}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          <Inspector
            t={t}
            uz={uz}
            warning={warning}
            title={title(profile.preset)}
            session={s}
            panel={panel}
            changePanel={openPanel}
            selected={selected}
            layers={layers}
            setLayer={(id, settings) => {
              setLayers((old) => ({
                ...old,
                [id]: { ...old[id], ...settings },
              }));
              if (settings.visible === false && isolated === id)
                setIsolated(null);
              if (settings.visible === false && selected?.layer === id) {
                select(null);
                setPoint(null);
                if (angle === "structure") focus("front");
              }
            }}
            isolated={!!isolated}
            isolate={() => {
              setIsolated(
                isolated ? null : (selected?.layer ?? "cardiovascular"),
              );
              if (!isolated && !selected) focus("heart");
            }}
            resetView={resetView}
            focusSelected={() => focus("structure")}
            snapshot={snapshot}
            branch={branch}
            switchBranch={() => pickBranch(branch === "A" ? "B" : "A")}
            metric={metric}
            changeMetric={setMetric}
            cursor={cursor}
            setCursor={(n) => {
              setPlaying(false);
              setReplay(false);
              setCursor(n);
            }}
            replay={replay}
            toggleReplay={toggleReplay}
            outlook={outlook}
            setOutlook={setOutlook}
            clear={clearPlayback}
            drugId={drugId}
            chooseDrug={setDrugId}
            edit={() => {
              setPlaying(false);
              setDraft(profile);
            }}
            confirm={(b) => {
              setPlaying(false);
              setTarget(b);
            }}
            exportData={(format) => exportSession(s, format, run)}
            run={run}
            editClinical={() => {
              setPlaying(false);
              setEditingClinical(true);
            }}
            pickPatient={() => {
              const c = conditionOf(profile.preset);
              if (c) setPicker(c);
            }}
            chat={
              patient ? (
                <ForecastChat
                  patient={patient}
                  lang={uz ? "uz" : "en"}
                  t={t}
                  applyPlan={setPlan}
                  onFocus={focusOrgan}
                  patientKey={patientKey}
                />
              ) : null
            }
          />
        </main>
      )}

      {profile && !clinic && (
        <Report
          session={s}
          metric={metric}
          title={title(profile.preset)}
          warning={warning}
          uz={uz}
          run={run}
        />
      )}
      {editingClinical && patient && (
        <Modal
          title={t("Patient measurements", "Bemor o‘lchovlari")}
          close={() => setEditingClinical(false)}
        >
          <ClinicalEditor
            patient={patient}
            t={t}
            cancel={() => setEditingClinical(false)}
            save={(clinical, body) => {
              const ok = s.updateClinical(clinical, body);
              if (ok) setEditingClinical(false);
              return ok;
            }}
          />
        </Modal>
      )}
      {picker && (
        <Modal
          title={t("Choose a real patient", "Haqiqiy bemorni tanlang")}
          close={() => setPicker(null)}
        >
          <div className="mini-grid picker-tabs">
            {(["t2d", "t1d", "hf"] as const).map((c) => (
              <button
                key={c}
                aria-pressed={picker === c}
                onClick={() => setPicker(c)}
              >
                {c === "t2d"
                  ? t("Type 2 diabetes", "2-tur diabet")
                  : c === "t1d"
                    ? t("Type 1 diabetes", "1-tur diabet")
                    : t("Heart failure", "Yurak yetishmovchiligi")}
              </button>
            ))}
          </div>
          <PatientPicker
            condition={picker}
            t={t}
            cancel={() => setPicker(null)}
            choose={(record) => {
              const preset: Preset =
                record.condition === "t2d"
                  ? "t2d"
                  : record.condition === "t1d"
                    ? "diabetes"
                    : "heart";
              setPicker(null);
              void start(profileFromRecord(record, preset));
            }}
          />
        </Modal>
      )}
      {draft && (
        <ProfileEditor
          profile={draft}
          t={t}
          busy={s.busy}
          problem={s.problem}
          change={setDraft}
          close={() => setDraft(null)}
          submit={() => void start(draft)}
        />
      )}
      {target && profile && (
        <DrugDialog
          profile={profile}
          snapshot={B ?? A}
          t={t}
          uz={uz}
          busy={s.busy}
          close={() => setTarget(null)}
          give={(action) => {
            setTarget(null);
            clearPlayback();
            void (async () => {
              if (!frames.B.length) await s.clone();
              await s.apply("B", [action]);
              pickBranch("B");
            })();
          }}
        />
      )}
    </>
  );
}
