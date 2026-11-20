import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { sixDistance } from "../drs/sixDistance";

// 6-Highlights DISTANCE graphic (screen space). Reads the ground line's projected screen
// endpoints from sixDistance (published by SixLabels inside the Canvas) via a rAF loop,
// and draws ONE straight white line BROKEN by a gap where the centred "DISTANCE 92 m"
// label sits — the label's number baseline sits ON the line; the line continues after.
// Everything is in screen px so the gap lines up with the text exactly.

const FONT = '"DejaVu Sans", sans-serif';
const GAP_PAD = 16; // px between the line and the text on each side

export default function SixDistanceOverlay() {
  const compact = useSelector((s) => s.session.compact); // PiP → smaller fonts
  const seg1Ref = useRef(null); // left line piece
  const seg2Ref = useRef(null); // right line piece
  const hLineRef = useRef(null); // max-height vertical line
  const boxRef = useRef(null); // the label box (measured for the gap)
  const wrapRef = useRef(null);
  const numRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const d = sixDistance;
      const wrap = wrapRef.current;
      if (!wrap) return;
      // The wrapper stays displayed whenever EITHER graphic is on.
      wrap.style.display = d.visible || d.hVisible ? "block" : "none";

      // Max-height vertical line — independent of the distance line.
      const hl = hLineRef.current;
      if (hl) {
        if (d.hVisible) {
          hl.style.display = "";
          hl.setAttribute("x1", d.hx1); hl.setAttribute("y1", d.hy1);
          hl.setAttribute("x2", d.hx2); hl.setAttribute("y2", d.hy2);
        } else {
          hl.style.display = "none";
        }
      }

      // Distance line pieces + label — only when the distance is on.
      const box = boxRef.current;
      const s1 = seg1Ref.current;
      const s2 = seg2Ref.current;
      if (!d.visible) {
        if (box) box.style.display = "none";
        if (s1) s1.style.display = "none";
        if (s2) s2.style.display = "none";
        return;
      }
      if (box) box.style.display = "flex";
      if (s1) s1.style.display = "";
      if (s2) s2.style.display = "";

      // Update the number text.
      if (numRef.current) numRef.current.textContent = String(d.value);

      // Label centre = screen midpoint of the two endpoints; sits ON the line.
      const cx = (d.ax + d.bx) / 2;
      const cy = (d.ay + d.by) / 2;
      if (box) {
        box.style.left = `${cx}px`;
        box.style.top = `${cy}px`;
      }
      const halfW = (box?.offsetWidth || 180) / 2 + GAP_PAD;

      // Unit direction along the line.
      let dx = d.bx - d.ax;
      let dy = d.by - d.ay;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Gap endpoints along the line, centred on the label.
      const g1x = cx - dx * halfW;
      const g1y = cy - dy * halfW;
      const g2x = cx + dx * halfW;
      const g2y = cy + dy * halfW;

      // Left piece: launch → gap start. Right piece: gap end → landing.
      if (s1) {
        s1.setAttribute("x1", d.ax); s1.setAttribute("y1", d.ay);
        s1.setAttribute("x2", g1x); s1.setAttribute("y2", g1y);
      }
      if (s2) {
        s2.setAttribute("x1", g2x); s2.setAttribute("y1", g2y);
        s2.setAttribute("x2", d.bx); s2.setAttribute("y2", d.by);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", display: "none", zIndex: 9999990 }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          {/* White arrowhead; userSpaceOnUse so its size is fixed (not tied to the thin
              stroke), auto-start-reverse so marker-start points outward too. */}
          <marker
            id="pmoArrow"
            markerUnits="userSpaceOnUse"
            markerWidth="12"
            markerHeight="12"
            refX="6"
            refY="6"
            orient="auto-start-reverse"
          >
            <path d="M1,1 L11,6 L1,11 Z" fill="#FFF" />
          </marker>
        </defs>
        {/* Distance line (broken by the label): arrow on the OUTER ends only. */}
        <line ref={seg1Ref} stroke="#FFF" strokeWidth="1.3" markerStart="url(#pmoArrow)" />
        <line ref={seg2Ref} stroke="#FFF" strokeWidth="1.3" markerEnd="url(#pmoArrow)" />
        {/* Max-height line: arrows on BOTH ends. */}
        <line ref={hLineRef} stroke="#FFF" strokeWidth="1.3" markerStart="url(#pmoArrow)" markerEnd="url(#pmoArrow)" />
      </svg>
      {/* Label: number's vertical centre ON the line (translate -50% -50%), DISTANCE above. */}
      <div
        ref={boxRef}
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontFamily: FONT,
          color: "#FFF",
          whiteSpace: "nowrap",
          textShadow: "0 2px 6px rgba(0,0,0,.6)",
          lineHeight: 1,
        }}
      >
        {/* Fonts MATCH the Pill labels (Max Height etc.) exactly: title 6-11, number
            26-36, unit 16-24 — so all four readouts are the same size. */}
        <span style={{ fontSize: compact ? "6px" : "clamp(6px, 0.57vw, 11px)", fontWeight: 700, letterSpacing: "0.16px", textTransform: "uppercase" }}>
          DISTANCE
        </span>
        <span style={{ display: "flex", alignItems: "flex-end", gap: 4, fontWeight: 700 }}>
          <span ref={numRef} style={{ fontSize: compact ? "18px" : "clamp(26px, 1.88vw, 36px)" }}>0</span>
          <span style={{ fontSize: compact ? "12px" : "clamp(16px, 1.25vw, 24px)", paddingBottom: 2 }}>m</span>
        </span>
      </div>
    </div>
  );
}
