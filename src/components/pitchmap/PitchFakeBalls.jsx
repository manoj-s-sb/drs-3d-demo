import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addPitchFakeBall,
  removePitchFakeBall,
  clearPitchFakeBalls,
} from "../../store/slices/sessionSlice";

// Pitch map: operator-placed FAKE balls. Pick the ball type + where it pitched (length in
// metres from the batter's stumps, line in metres from middle stump: + = off side, − = leg
// side for a right-hander) and Add. Fakes show on the standalone pitch map alongside the
// real balls (selectPitchMapPoints). `onChange(list)` is called with the new list after
// every edit so the dashboard can mirror it to the big screen.

const KINDS = [
  ["0", "Dot"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["four", "Four"],
  ["six", "Six"],
  ["wicket", "Wicket"],
];
const kindLabel = (k) => KINDS.find(([v]) => v === k)?.[1] ?? k;

export default function PitchFakeBalls({ accent = "#A78BFA", onChange }) {
  const dispatch = useDispatch();
  const fakes = useSelector((s) => s.session.pitchFakeBalls);
  const [kind, setKind] = useState("0");
  const [length, setLength] = useState("6"); // m from the batter's stumps
  const [line, setLine] = useState("0"); // m from middle stump (+ off / − leg)

  const add = () => {
    const z = Number(length);
    const x = Number(line);
    if (!Number.isFinite(z) || !Number.isFinite(x)) return;
    const ball = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, x, z };
    dispatch(addPitchFakeBall(ball));
    onChange?.([...fakes, ball]);
  };
  const remove = (id) => {
    dispatch(removePitchFakeBall(id));
    onChange?.(fakes.filter((b) => b.id !== id));
  };
  const clear = () => {
    dispatch(clearPitchFakeBalls());
    onChange?.([]);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <label style={LBL}>Fake balls</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {KINDS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={`db-segbtn${kind === v ? " on" : ""}`}
            style={kind === v ? { background: accent } : undefined}
            onClick={() => setKind(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <span style={SUB}>Length (m from stumps)</span>
          <input
            className="db-nb-input"
            type="number"
            step="0.1"
            style={{ width: "100%" }}
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <span style={SUB}>Line (m, + off / − leg)</span>
          <input
            className="db-nb-input"
            type="number"
            step="0.05"
            style={{ width: "100%" }}
            value={line}
            onChange={(e) => setLine(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="db-segbtn on"
          style={{ background: accent, height: 34 }}
          onClick={add}
        >
          Add
        </button>
      </div>
      <div className="db-nb-hint">
        Length 0 = batter&apos;s stumps (≈20 m = bowler&apos;s end). Line 0 = middle stump; stumps
        span ±0.11 m. Line is for a right-hander.
      </div>
      {fakes.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {fakes.map((b) => (
            <div
              key={b.id}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#C9D3E6" }}
            >
              <span style={{ flex: 1 }}>
                {kindLabel(b.kind)} · {b.z} m · line {b.x > 0 ? "+" : ""}
                {b.x} m
              </span>
              <button type="button" className="db-segbtn" onClick={() => remove(b.id)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="db-segbtn" style={{ marginTop: 4 }} onClick={clear}>
            Clear all fake balls
          </button>
        </div>
      )}
    </div>
  );
}

const LBL = {
  display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
};
const SUB = { display: "block", fontSize: 10, color: "#5A6884", marginBottom: 4 };
