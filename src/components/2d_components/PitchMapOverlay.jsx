import { useEffect, useMemo, useRef } from "react";
import { selectPitchMapPoints } from "../../store/slices/sessionSlice";
import { useSelector } from "react-redux";
import { pitchZones, markersFor } from "../drs/pitchZones";
import { PITCH_ZONE_SETS } from "../../drs/pitchZoneSets";

// ── Pitch-Mapping broadcast overlay ──────────────────────────────────────────
// A 2D graphic drawn over the (fixed) pitch-map camera:
//   • left   — distance markers down the pitch (STUMPS / 2M / 4M / 6M / 8M / 10M)
//   • right  — LENGTH DISTRIBUTION %: share of balls in each zone of the active
//              bowler-type set, zone-coloured to match the bands
// Each entry RIDES its pitch band/metre mark: MultiPitchMap projects the world anchor to
// screen px every frame, and a rAF loop here sets each element's left/top so they hug the
// pitch in ANY camera view. The bowler container + by-ball colour legend are the centred
// lower-third ticker (MultiPitchTicker / FiguresTicker), not drawn here.
export default function PitchMapOverlay() {
  const active = useSelector((s) => s.session.pitchMapActive);
  const standalone = useSelector((s) => s.session.pitchMapStandalone);
  const hideLengthDist = useSelector((s) => s.session.hideLengthDist);
  const compact = useSelector((s) => s.session.compact);
  const points = useSelector(selectPitchMapPoints); // real balls + operator fake balls
  const bowlerType = useSelector((s) => s.session.pitchBowlerType);
  // Active bowler-type zone set → drives the % buckets (index-aligned to the anchors
  // MultiPitchMap publishes for the same set).
  const zones = (PITCH_ZONE_SETS[bowlerType] || PITCH_ZONE_SETS.seamers).zones;

  // Each zone chip RIDES its pitch band: a rAF loop reads the projected band anchor
  // (pitch right edge at the band level) and sets the chip's left/top, so it hugs the
  // pitch at its band's level — in BOTH the front and top views (matches the reference).
  const zoneRefs = useRef({});
  const markerRefs = useRef([]); // left-edge metre markers (STUMPS / 2M / …)
  useEffect(() => {
    let raf;
    // Fade a chip out only when its projected anchor is actually OFF the frame (a small
    // negative margin = a little tolerance past the edge), NOT merely near the edge — else a
    // legitimately edge-hugging marker like STUMPS (z=0, top of the frame in the top view)
    // would wrongly hide. The 0.35s opacity transition still smooths the camera 1↔2 crane as
    // far-zone anchors cross the edge, and fades a freshly-mounted chip (bowler switch) IN.
    const M = -28; // px past the viewport edge before a chip is treated as off-screen
    const place = (el, a) => {
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y}px`;
      const W = window.innerWidth || 1;
      const H = window.innerHeight || 1;
      const onScreen =
        a.x >= M && a.x <= W - M && a.y >= M && a.y <= H - M;
      el.style.opacity = onScreen ? "1" : "0";
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!pitchZones.visible) return;
      const anchors = pitchZones.anchors || [];
      for (let i = 0; i < anchors.length; i++) {
        const el = zoneRefs.current[i];
        const a = anchors[i];
        if (el && a) place(el, a);
      }
      // Left-edge metre markers ride the pitch's left edge.
      const dist = pitchZones.distAnchors || [];
      for (let i = 0; i < dist.length; i++) {
        const el = markerRefs.current[i];
        const a = dist[i];
        if (el && a) place(el, a);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Per-zone share of all balls (adds up to 100%), bucketed into the ACTIVE set's zones by
  // bounce distance z (m from the batter's stumps). Index-aligned to `zones`.
  const pct = useMemo(() => {
    const counts = new Array(zones.length).fill(0);
    const pts = points ?? [];
    pts.forEach((p) => {
      const z = Number(p.z) || 0;
      let idx = zones.length - 1;
      for (let i = 0; i < zones.length; i++) {
        if (z < zones[i].to) { idx = i; break; }
      }
      counts[idx] += 1;
    });
    const total = pts.length || 0;
    return counts.map((c) => (total ? (c / total) * 100 : 0));
  }, [points, zones]);

  // This overlay is ONLY for the STANDALONE pitch map. It draws the LENGTH DISTRIBUTION %
  // (right) + metre markers (left) — the bowler container + by-ball legend are the centred
  // lower-third ticker (MultiPitchTicker). Toggle: hideLengthDist.
  // Shows once the dots exist. The chips are projected every frame, so switching the camera
  // view (key 1 / 2) just MOVES them with the pitch — they no longer hide during the move.
  if (
    !active ||
    !standalone ||
    compact ||
    !points?.length
  )
    return null;

  return (
    <div className="pmo-root">
      <style>{STYLE}</style>

      {/* LENGTH DISTRIBUTION % — one chip per ACTIVE-set zone (toggle: hideLengthDist).
          Rides the pitch's right edge at the band's level; rounded % with a % symbol. */}
      {!hideLengthDist && (
        <>
          {zones.map((zn, i) => (
            <div
              key={zn.name}
              ref={(el) => (zoneRefs.current[i] = el)}
              className="pmo-pct"
            >
              {Math.round(pct[i] || 0)}%
            </div>
          ))}
        </>
      )}

      {/* Left-edge DISTANCE markers (STUMPS / 2M / 4M …) — screen-space white text that rides
          the pitch's left edge at each metre mark, always upright + visible. */}
      {!hideLengthDist &&
        markersFor(bowlerType).map((mk, i) => (
          <div
            key={mk.label}
            ref={(el) => (markerRefs.current[i] = el)}
            className="pmo-marker"
          >
            {mk.label}
          </div>
        ))}
    </div>
  );
}

const STYLE = `
.pmo-root {
  position: absolute; inset: 0; z-index: 20; pointer-events: none;
  font-family: "Poppins", system-ui, sans-serif; color: #fff;
  /* Stays visible at all times — including while the camera moves (the chips track the pitch
     via per-frame projection; the per-chip edge fade keeps it smooth). */
}

/* Left-edge distance markers — upright white text riding the pitch's left edge.
   Start hidden (opacity 0) and transition opacity so they EASE in/out: smooth during the
   camera 1↔2 crane (edge fade) and a soft fade-in when (re)mounted. */
.pmo-marker {
  position: absolute; transform: translate(-100%, -50%); opacity: 0;
  font-size: clamp(19px, 1.5vw, 33px); font-weight: 800; font-style: italic;
  color: #fff; letter-spacing: 0.03em; white-space: nowrap;
  text-shadow: 0 2px 5px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.5);
  padding-right: 10px;
  transition: opacity 0.35s ease;
}
/* Right-edge % — EXACT mirror of .pmo-marker (same white text, anchored on the right).
   Same opacity ease → smooth during the camera move AND a soft fade-in when the chips
   remount on a bowler-type switch (matches the zone bands' crossfade). */
.pmo-pct {
  position: absolute; transform: translate(0, -50%); opacity: 0;
  font-size: clamp(19px, 1.5vw, 33px); font-weight: 800; font-style: italic;
  color: #fff; letter-spacing: 0.03em; white-space: nowrap;
  text-shadow: 0 2px 5px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.5);
  padding-left: 10px;
  transition: opacity 0.35s ease;
}
`;
