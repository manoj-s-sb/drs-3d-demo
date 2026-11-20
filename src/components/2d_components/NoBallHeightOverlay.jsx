// No-Ball HEIGHT check overlay (2D). Shows the ball height where the trajectory
// reaches the popping crease (drs.creasePos.y, computed in BowlingTrajectory)
// against the batsman's entered body-height lines, with the ICC verdict:
// a full-toss passing above the waist is a no-ball (above shoulder / head = severity).
import { useSelector } from "react-redux";

const fmt = (m) => (m == null ? "—" : `${Number(m).toFixed(2)} m`);

export default function NoBallHeightOverlay() {
  const { active, noBall, operatorInput, creasePos } = useSelector((s) => s.drs);
  const hc = operatorInput?.heightCheck;

  // Only during a no-ball review, once the trajectory has produced a crease point.
  if (!active || !noBall || !creasePos) return null;

  const ball = Number(creasePos.y);
  const waist = hc?.waist ?? null;
  const shoulder = hc?.shoulder ?? null;
  const head = hc?.head ?? null;
  const name = (hc?.batsman || "BATTER").toUpperCase();

  // Verdict (ICC): no-ball once the ball is above the WAIST line; the label is the
  // HIGHEST line it clears (waist → shoulder → head). Lines checked low→high.
  const ordered = [
    ["waist", waist],
    ["shoulder", shoulder],
    ["head", head],
  ].filter(([, v]) => v != null);
  let band = null;
  for (const [k, v] of ordered) if (ball > Number(v)) band = k;
  const isNoBall = band != null;
  const bandLabel =
    band === "head"
      ? "ABOVE HEAD"
      : band === "shoulder"
        ? "ABOVE SHOULDER"
        : band === "waist"
          ? "ABOVE WAIST"
          : null;
  const hasLines = ordered.length > 0;
  const verdict = !hasLines
    ? null
    : isNoBall
      ? `${bandLabel} · NO-BALL`
      : "BELOW WAIST · FAIR DELIVERY";

  // Vertical scale (px). Map metres → y, tallest reference sets the top.
  const refs = [ball, waist, shoulder, head].filter((v) => v != null);
  const maxH = Math.max(...refs, 1.8) * 1.12;
  const H = 300;
  const y = (m) => H - (m / maxH) * H;

  const markers = [
    { key: "head", label: "HEAD", v: head, color: "#38BDF8" },
    { key: "shoulder", label: "SHOULDER", v: shoulder, color: "#A78BFA" },
    { key: "waist", label: "WAIST", v: waist, color: "#FBBF24" },
    { key: "ball", label: "BALL", v: ball, color: "#F43F5E" },
  ].filter((m) => m.v != null);

  return (
    <>
      {/* Vertical height scale on the right */}
      <div
        className="absolute right-[6%] top-1/2 -translate-y-1/2"
        style={{ height: H }}
      >
        <div className="relative h-full w-px bg-white/40">
          {[0, 0.5, 1.0, 1.5].map((t) => (
            <div
              key={t}
              className="absolute left-0 flex items-center gap-1"
              style={{ top: y(t) - 6 }}
            >
              <span className="w-2 h-px bg-white/40" />
              <span className="text-[10px] font-mono text-white/55">
                {t.toFixed(1)}
              </span>
            </div>
          ))}
          {markers.map((m) => (
            <div
              key={m.key}
              className="absolute right-2 -translate-y-1/2 flex items-center gap-1.5"
              style={{ top: y(m.v) }}
            >
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-[#04121f] whitespace-nowrap"
                style={{ backgroundColor: m.color }}
              >
                {m.label} {m.v.toFixed(2)}m
              </span>
              <span
                className="w-3 h-3 rounded-full ring-2 ring-white/80"
                style={{ backgroundColor: m.color }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Info card, bottom-left */}
      <div className="absolute left-[4%] bottom-[8%] w-[280px] rounded-xl bg-[#05070F]/85 ring-1 ring-white/12 backdrop-blur-sm shadow-[0_8px_28px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
            Height check
          </div>
          <div className="text-[15px] font-extrabold text-white">{name}</div>
        </div>
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <Row label="Ball height at crease" value={fmt(ball)} color="#F43F5E" strong />
          {waist != null && <Row label="Batter waist" value={fmt(waist)} color="#FBBF24" />}
          {shoulder != null && <Row label="Batter shoulder" value={fmt(shoulder)} color="#A78BFA" />}
          {head != null && <Row label="Batter head" value={fmt(head)} color="#38BDF8" />}
        </div>
        {verdict && (
          <div
            className="px-4 py-2 text-center text-[13px] font-extrabold uppercase tracking-wide text-white"
            style={{ backgroundColor: isNoBall ? "#DC2626" : "#16A34A" }}
          >
            {verdict}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value, color, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-2 text-white/70">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${strong ? "text-white font-bold text-[13px]" : "text-white/85"}`}
      >
        {value}
      </span>
    </div>
  );
}
