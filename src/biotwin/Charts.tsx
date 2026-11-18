import { clock, type Metric } from "./model";
import type { Frames } from "./session";

export function Trend({
  frames,
  metric,
  event,
  cursor,
  small = false,
}: {
  frames: Frames;
  metric: Metric;
  event?: number;
  cursor?: number;
  small?: boolean;
}) {
  const { A, B } = frames;
  if (!A.length) return <p>No recorded samples.</p>;
  const values = [...A, ...B].map(metric.read);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.15, 10 ** -metric.digits);
  const start = small ? A[0]!.t : 0;
  const end = Math.max(start + 5, A.at(-1)!.t, B.at(-1)?.t ?? 0);
  const left = small ? 2 : 44,
    right = small ? 100 : 936,
    top = 10,
    bottom = small ? 27 : 100;
  const x = (t: number) =>
    left + ((t - start) / (end - start)) * (right - left);
  const y = (value: number) =>
    bottom -
    ((value - low + padding) / (high - low + 2 * padding)) * (bottom - top);
  const summary =
    metric.label +
    " in " +
    metric.unit +
    ", time zero " +
    metric.read(A[0]!).toFixed(metric.digits) +
    ", latest A " +
    metric.read(A.at(-1)!).toFixed(metric.digits) +
    (B.length
      ? ", latest B " + metric.read(B.at(-1)!).toFixed(metric.digits)
      : "");
  return (
    <svg
      viewBox={small ? "0 0 103 31" : "0 0 950 126"}
      className={small ? "spark" : "trend"}
      role={small ? undefined : "img"}
      aria-hidden={small || undefined}
      aria-label={small ? undefined : summary}
    >
      {!small &&
        [0, 0.5, 1].map((f) => (
          <g key={f}>
            <path
              d={`M${left} ${top + (bottom - top) * f}H${right}`}
              stroke="var(--line)"
            />
            <text
              x={left - 7}
              y={top + (bottom - top) * f + 4}
              textAnchor="end"
            >
              {(high + padding - (high - low + padding * 2) * f).toFixed(
                metric.digits,
              )}
            </text>
          </g>
        ))}
      {!small &&
        [0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={x(end * f)}
            y="118"
            textAnchor={f === 1 ? "end" : f === 0 ? "start" : "middle"}
          >
            {clock(end * f)}
          </text>
        ))}
      {event !== undefined && (
        <path
          d={`M${x(event)} ${top}V${bottom}`}
          stroke="var(--amber)"
          strokeDasharray="4 4"
        >
          <title>Intervention</title>
        </path>
      )}
      {cursor !== undefined && (
        <path d={`M${x(cursor)} ${top}V${bottom}`} stroke="var(--muted)" />
      )}
      {[A, B].map(
        (series, index) =>
          series.length > 0 && (
            <g key={index} stroke={index === 0 ? "var(--teal)" : "var(--blue)"}>
              <polyline
                points={series
                  .map((s) => x(s.t) + "," + y(metric.read(s)))
                  .join(" ")}
                fill="none"
                strokeWidth={small ? 1.7 : 2.3}
                strokeLinejoin="round"
              />
              {(() => {
                const sample =
                  cursor === undefined
                    ? series.at(-1)
                    : series.find((frame) => frame.t === cursor);
                return (
                  sample && (
                    <circle
                      cx={x(sample.t)}
                      cy={y(metric.read(sample))}
                      r={small ? 1.7 : 3.7}
                      fill={index === 0 ? "var(--teal)" : "var(--blue)"}
                    >
                      <title>
                        {index === 0 ? "A" : "B"} · {clock(sample.t)} ·{" "}
                        {metric.read(sample).toFixed(metric.digits)}{" "}
                        {metric.unit}
                      </title>
                    </circle>
                  )
                );
              })()}
            </g>
          ),
      )}
    </svg>
  );
}

export function Outlook({ uz }: { uz: boolean }) {
  return (
    <div className="outlook">
      <h3>
        {uz ? "Uzoq muddatli istiqbol" : "Long-term outlook (illustrative)"}
      </h3>
      <p>
        {uz
          ? "Bu belgilar kuzatuv savollarini ko‘rsatadi. Model yillik prognoz bermaydi."
          : "These checkpoints illustrate follow-up questions. Vitalis supplies no long-term risk estimates."}
      </p>
      <div className="years">
        {[
          [
            "1",
            "What baseline measurements would a longitudinal study need?",
            "Qanday boshlang‘ich o‘lchovlar kerak?",
          ],
          [
            "3",
            "How would changing exposures and missing follow-up affect interpretation?",
            "O‘zgaruvchi omillar va yetishmaydigan ma’lumot talqinga qanday ta’sir qiladi?",
          ],
          [
            "5",
            "Which outcomes and external cohorts would help validate a forecast?",
            "Prognozni tekshirish uchun qanday natijalar va guruhlar kerak?",
          ],
        ].map(([year, en, local]) => (
          <div key={year}>
            <b>{year}</b> {uz ? "yil" : year === "1" ? "year" : "years"}
            <p>{uz ? local : en}</p>
          </div>
        ))}
      </div>
      <p className="notice">
        {uz
          ? "Klinik prognoz mavjud emas."
          : "Numerical projections and uncertainty bands are unavailable without a longitudinal model."}
      </p>
    </div>
  );
}
