import { PatientDataSummary } from "./PatientData";
import { Trend } from "./Charts";
import { EventLog, caseIds, eventFor, valueOf } from "./Inspector";
import {
  clock,
  metrics,
  modelVersion,
  profileProvenance,
  type Metric,
} from "./model";
import { ClinicalSummary, ForecastReport } from "./Inspector";
import type { ForecastRun } from "./chronic/engine";
import type { Frames, useSession } from "./session";

function timeSeries(frames: Frames) {
  return (["A", "B"] as const).flatMap((twin) =>
    frames[twin].map((s) => ({
      twin,
      t_seconds: +s.t.toFixed(1),
      tick: s.tick,
      ...Object.fromEntries(metrics.map((m) => [m.key, +m.read(s).toFixed(4)])),
    })),
  );
}

function download(data: string, format: "csv" | "json") {
  const url = URL.createObjectURL(
    new Blob([data], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    format === "csv" ? "biotwin-timeseries.csv" : "biotwin-session.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSession(
  session: ReturnType<typeof useSession>,
  format: "csv" | "json",
  run: ForecastRun | null = null,
) {
  if (format === "json") {
    void session.exportActions((actions, frames, events) => {
      download(
        JSON.stringify(
          {
            provenance: "Engine simulated. Synthetic profile.",
            modelVersion,
            exportedAt: new Date().toISOString(),
            profile: session.profile,
            inputProvenance:
              session.profile && profileProvenance(session.profile.preset),
            forecast: run
              ? {
                  plan: run.plan,
                  added: run.added.map((d) => d.id),
                  removed: run.removed.map((d) => d.id),
                  missing: run.missing,
                  outcomes: run.outcomes.map((o) => ({
                    id: o.id,
                    model: o.model,
                    noChange5y: o.base.at(-1),
                    withPlan5y: o.plan.at(-1),
                    interval95: [o.planLo, o.planHi],
                    hazardRatios: o.attributions,
                  })),
                  relative: run.relative,
                  assumptions: run.assumptions,
                }
              : null,
            units: Object.fromEntries(metrics.map((m) => [m.key, m.unit])),
            recorded: timeSeries(frames),
            actions,
            events,
          },
          null,
          2,
        ),
        "json",
      );
    });
  } else {
    const headers = ["twin", "t_seconds", "tick", ...metrics.map((m) => m.key)];
    const data = timeSeries(session.frames).map((row) =>
      headers.map((k) => row[k as keyof typeof row]).join(","),
    );
    download([headers.join(","), ...data].join("\r\n"), "csv");
  }
}

export function Report({
  session,
  title,
  metric,
  warning,
  uz,
  run,
}: {
  session: ReturnType<typeof useSession>;
  title: string;
  metric: Metric;
  warning: string;
  uz: boolean;
  run: ForecastRun | null;
}) {
  const { profile, frames } = session;
  if (!profile) return null;
  const A = frames.A.at(-1),
    B = frames.B.at(-1);
  const t = (en: string, local: string) => (uz ? local : en);
  return (
    <article className="report-print">
      <h1>
        BioTwin · {uz ? "Raqamli egizak hisoboti" : "Digital twin report"}
      </h1>
      <p className="notice">{warning}</p>
      <h2>
        {caseIds[profile.preset]} · {title}
      </h2>
      <h3>{uz ? "Model parametrlari" : "Model inputs"}</h3>
      <p>
        {profile.age} y · {profile.sex} · {profile.height} cm · {profile.weight}{" "}
        kg · {profile.displayName}
      </p>
      <ClinicalSummary profile={profile} t={t} />
      <ForecastReport run={run} t={t} uz={uz} />
      <h3>{uz ? "Qo‘shimcha ma’lumot" : "Context only"}</h3>
      <PatientDataSummary profile={profile} t={t} />
      <p>
        {modelVersion} · {new Date().toISOString()}
      </p>
      <h3>{uz ? "Virtual muolaja sinovi" : "Virtual treatment trial"}</h3>
      <p>
        {uz
          ? "A — asosiy ssenariy. B — muolaja sinovi. Qo‘llangan parametrlar va vaqtlar quyidagi hodisalar jurnalida qayd etilgan."
          : "A records the baseline scenario. B records the treatment experiment. Applied parameters and timestamps appear in the event log below."}
      </p>
      {eventFor(session, "B") && (
        <p>
          B · {clock(eventFor(session, "B")!.t)} ·{" "}
          {eventFor(session, "B")!.message}
        </p>
      )}

      {A && (
        <>
          <table>
            <thead>
              <tr>
                <th>Engine-simulated metric</th>
                <th>Time zero</th>
                <th>A · {clock(A.t)}</th>
                <th>B · {B ? clock(B.t) : "—"}</th>
                <th>B − A</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key}>
                  <th>
                    {m.label} · {m.unit}
                  </th>
                  <td>{valueOf(m, frames.A[0])}</td>
                  <td>{valueOf(m, A)}</td>
                  <td>{valueOf(m, B)}</td>
                  <td>
                    {B?.tick === A.tick
                      ? (m.read(B) - m.read(A)).toFixed(m.digits)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>
            {metric.label} ({metric.unit}) · A and B
          </h3>
          <Trend
            frames={frames}
            metric={metric}
            event={(eventFor(session, "B") ?? eventFor(session, "A"))?.t}
          />
          <h3>Twin A · Events</h3>
          <EventLog session={session} branch="A" limit={Infinity} />
          {B && (
            <>
              <h3>Twin B · Events</h3>
              <EventLog session={session} branch="B" limit={Infinity} />
            </>
          )}
        </>
      )}
      <p>
        {uz
          ? "O‘tkir dori javoblari ta’lim uchun. 5 yillik prognoz tasdiqlangan xavf tenglamalari va randomizatsiyalangan sinov natijalarini birlashtiradi; klinik qo‘llashdan oldin mahalliy kalibrlash kerak."
          : "Acute drug responses are educational. The 5-year forecast combines validated risk equations with randomised-trial medicine effects and needs local calibration before clinical use. Genetic findings are recorded context and do not alter the forecast."}
      </p>
    </article>
  );
}
