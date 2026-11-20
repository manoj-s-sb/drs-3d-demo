// Compute bowling figures from pitch/stump points (each carries over, runs, isWicket).
// Overs = the over NUMBER when one over, else the COUNT of overs.
export function figuresFromPoints(points) {
  const byOver = new Map();
  let runs = 0;
  let wickets = 0;
  for (const p of points) {
    const r = Number(p.runs) || 0;
    runs += r;
    if (p.isWicket) wickets += 1;
    const ov = p.over ?? 0;
    byOver.set(ov, (byOver.get(ov) || 0) + r);
  }
  const overKeys = Array.from(byOver.keys());
  const overs = overKeys.length === 1 ? overKeys[0] : overKeys.length;
  const numOvers = overKeys.length;
  const maidens = Array.from(byOver.values()).filter((r) => r === 0).length;
  const economy = numOvers > 0 ? (runs / numOvers).toFixed(2) : "0.00";
  return [
    { big: String(overs), small: "Overs" },
    { big: String(maidens), small: "Maidens" },
    { big: String(runs), small: "Runs" },
    { big: String(wickets), small: "Wickets" },
    { big: economy, small: "Economy" },
  ];
}
