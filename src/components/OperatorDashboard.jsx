// Operator dashboard UI (preview — open with ?dashboard=1).
// Full-screen console: session header + live 3D stage (centre) + control rail
// (right). Reuses the existing show pipeline, broadcast channel and Redux state
// — no pipeline logic is changed. Built behind a flag so the current operator
// tool stays untouched while this is developed/tested.
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ThreeScene from "./ThreeScene";
import DrsVideoLayer from "./DrsVideoLayer";
import Overlay2D from "./2d_components/Overlay2D";
import MultiTicker from "./drs/MultiTicker";
import MultiPitchTicker from "./drs/MultiPitchTicker";
import PitchMapOverlay from "./2d_components/PitchMapOverlay";
import StumpTicker from "./drs/StumpTicker";
import WagonTicker from "./drs/WagonTicker";
import InterceptionTicker from "./drs/InterceptionTicker";
import { OUTCOME_LEGEND } from "./drs/ballColors";
import DrsKeyBindings from "./DrsKeyBindings";
import ScoreTicker from "./ScoreTicker";
import {
  loadSnapshot,
  loadBowlingAnalysis,
  setBowlingAnalysis,
  clearSnapshot,
  clearBowlingAnalysis,
} from "../score-api";
import ConsolePanel from "./ConsolePanel";
import { setSelection, setSource } from "../store/slices/dataSourceSlice";
import {
  setHideTicker,
  setHideLengthDist,
  setHideBowler,
  setWagonHideCard,
  setWagonHideName,
  setBowlerNameOnly,
  setPitchBowlerType,
  setPitchBowlerName,
  setPitchNameKeepCase,
  setSwingBowlerType,
  setPitchTickerText,
  setStumpBowlerName,
  setBowlingTickerMetric,
  setBallCategories,
  setPitchGlow,
  setStumpGlow,
  setSixRotateStadium,
  setSixRotateDeg,
  setSixShowAngle,
  setSixShowSpeed,
  setMultiPlaybackOpts,
  startSwing,
  setScene,
} from "../store/slices/sessionSlice";
import PitchMapControls from "./pitchmap/PitchMapControls";
import PitchFakeBalls from "./pitchmap/PitchFakeBalls";
// Standalone Pitch mode uses its OWN copy (redesignable independently). The bowling-
// analysis pitch mapping is unaffected — it never used these controls.
import StumpMapFilterControls from "./pitchmap/StumpMapFilterControls";
import InterceptionFilterControls from "./pitchmap/InterceptionFilterControls";
import WagonFilterControls from "./pitchmap/WagonFilterControls";
import { loadPitchMapData, dismissalTag } from "./pitchmap/pitchMapData";
import {
  setCurrentShow,
  setCameraTarget,
  setBroadcasting,
} from "../store/slices/broadcastSlice";
import {
  executeCommand,
  goIdle,
  playSingle,
} from "./drs/showCommands";
import { getDefaultReplayCamera } from "../drs/remoteReplayCommand";
import { sendShow, sendPlay, sendPing, sendClose, sendSnapshot, sendBowlingAnalysis, sendTicker, sendLengthDist, sendHideBowler, sendBowlerNameOnly, sendPitchBowlerType, sendPitchBowlerName, sendPitchNameKeepCase, sendSwingBowlerType, sendPitchFakeBalls, sendPitchTickerText, sendStumpBowlerName, sendBowlingTickerMetric, sendBallCategories, sendPitchGlow, sendStumpGlow, sendSixRotateStadium, sendSixRotateDeg, sendSixShowAngle, sendSixShowSpeed, sendWagonOptions, sendInterceptOptions, sendPipMode, sendScene, getChannel } from "../broadcastChannel";
import {
  listInnings,
  listOvers,
  listBalls,
  listBallsMultiServer,
  resolveDeliveryUrl,
  resolveDeliveryUrls,
  deliveryUrl,
  deliveryFolder,
  deliveryFolderFor,
  getCameraServers,
  isLocal,
  cacheBust,
  DELIVERY_FILE,
} from "../dataSource";
import { loadTrajectory } from "../trajectoryCache";

const MODES = {
  bowling: { label: "Trajectories", accent: "#22C55E" },
  drs: { label: "DRS Review", accent: "#38BDF8" },
  noball: { label: "No-Ball", accent: "#F43F5E" },
  pitch: { label: "Pitch-Map", accent: "#A78BFA" },
  stump: { label: "Stump Beehive", accent: "#2DD4BF" },
  interception: { label: "Interception", accent: "#F59E0B" },
  swing: { label: "Swing (Seamers) / Turn (Spinners)", accent: "#F59E0B" },
  highlights: { label: "Six Beam Tracker", accent: "#EC4899" },
  wagon: { label: "Wagon Wheel", accent: "#F472B6" },
};

// Map the operator's MODE to the broadcast command KIND it produces, so a per-module
// action (e.g. Hide ticker) only affects the big screen when THAT module is the one
// currently on air (broadcast.currentShow.kind).
const MODE_TO_KIND = {
  drs: "drs",
  noball: "drs",
  bowling: "over",
  pitch: "pitch",
  stump: "stump",
  interception: "intercept",
  swing: "swing",
  highlights: "single",
  wagon: "wagon",
};

// Hide stray duplicated dataset folders like "16 copy" from the operator lists.
const CLEAN = (arr) => arr.filter((n) => !/copy/i.test(String(n)));

// A pitching value that means "no pitching point" (full toss): null / empty /
// "NA" / any dash the backend uses ("-", "–", "—").
const PITCH_IS_NA = (v) =>
  !v || v === "NA" || /^[\s\-–—]+$/.test(String(v));

// Display labels for the full-toss overlay-panel checkboxes.
const PANEL_LABELS = {
  pitching: "Pitching",
  impact: "Impact",
  wickets: "Wickets",
  height: "Height",
  originalDecision: "Original Decision",
  playerReview: "Player Review",
};

// Discover the camera feeds a ball ships (same approach as TrajectoryPicker).
async function probeCameras(folder) {
  const base = folder.endsWith("/") ? folder : folder + "/";
  let indices = [];
  try {
    const res = await fetch(cacheBust(base + "ball_coords.json"));
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.ok && !ct.includes("text/html")) {
      const bc = await res.json();
      indices = Object.keys(bc)
        .filter((k) => k.endsWith("_transform"))
        .map((k) => k.slice(0, -"_transform".length))
        .sort((a, b) => Number(a) - Number(b));
    }
  } catch {
    indices = [];
  }
  const checks = await Promise.all(
    indices.map(async (i) => {
      try {
        const r = await fetch(base + `${i}.mp4`, { method: "HEAD" });
        if (!r.ok) return null;
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("text/html")) return null;
        return { index: String(i), label: `CAM ${Number(i) + 1}` };
      } catch {
        return null;
      }
    }),
  );
  return checks.filter(Boolean);
}

// Merge cameras from EVERY configured machine for one ball (same as the operator
// tool) so ALL connected camera-server feeds show — not just one machine's.
// Each entry carries its own machine's folder, so selecting it plays from there.
async function probeCamerasAllServers(innings, over, ball) {
  const folders = isLocal()
    ? [{ serverId: "local", folder: deliveryFolder(innings, over, ball) }]
    : getCameraServers().map((s) => ({
        serverId: s.id,
        folder: deliveryFolderFor(s, innings, over, ball),
      }));
  const perServer = await Promise.all(
    folders.map(async ({ serverId, folder }) => {
      try {
        const cams = await probeCameras(folder);
        return cams.map((c) => ({ serverId, folder, index: c.index }));
      } catch {
        return [];
      }
    }),
  );
  // Flatten in machine order. Label by the REAL camera index (from ball_coords
  // "<i>_transform"), not list position — cameras 1 & 3 show as CAM 1 & CAM 3.
  return perServer.flat().map((c) => ({
    ...c,
    key: `${c.serverId}:${c.index}`,
    label: `Cam ${c.index}`,
  }));
}

export default function OperatorDashboard() {
  const dispatch = useDispatch();
  const source = useSelector((s) => s.dataSource.source);
  const match = useSelector((s) => s.dataSource.match);
  // Configured camera machines (primary + extras) — reactive, for the bowling-
  // analysis server picker. Mirrors getCameraServers() but from selectors so the
  // list updates when the operator edits servers in the Server modal.
  const dsIp = useSelector((s) => s.dataSource.ip);
  const dsPort = useSelector((s) => s.dataSource.port);
  const extraServers = useSelector((s) => s.dataSource.extraServers);
  const serverList = [
    { id: "m1", ip: dsIp, port: dsPort },
    ...(extraServers || []).filter((s) => s && s.ip),
  ];
  const broadcasting = useSelector((s) => s.broadcast.broadcasting);
  const currentShow = useSelector((s) => s.broadcast.currentShow);
  const cameraTarget = useSelector((s) => s.broadcast.cameraTarget);
  const replayReq = useSelector((s) => s.remoteReplay.request);
  const hideTicker = useSelector((s) => s.session.hideTicker);
  const hideLengthDist = useSelector((s) => s.session.hideLengthDist);
  const hideBowler = useSelector((s) => s.session.hideBowler);
  const wagonHideCard = useSelector((s) => s.session.wagonHideCard);
  const wagonHideName = useSelector((s) => s.session.wagonHideName);
  const wagonBatHand = useSelector((s) => s.session.wagonBatHand);
  const wagonStyle = useSelector((s) => s.session.wagonStyle);
  const wagonSweep = useSelector((s) => s.session.wagonSweep);
  const wagonReveal = useSelector((s) => s.session.wagonReveal);
  const wagonDuration = useSelector((s) => s.session.wagonDuration);
  const wagonBatterName = useSelector((s) => s.session.wagonBatterName);
  const wagonNameKeepCase = useSelector((s) => s.session.wagonNameKeepCase);
  const wagonFours = useSelector((s) => s.session.wagonFours);
  const wagonSixes = useSelector((s) => s.session.wagonSixes);
  const interceptName = useSelector((s) => s.session.interceptName);
  const interceptNameKeepCase = useSelector((s) => s.session.interceptNameKeepCase);
  const bowlerNameOnly = useSelector((s) => s.session.bowlerNameOnly);
  const bowlingTickerMetric = useSelector((s) => s.session.bowlingTickerMetric);
  const pitchBowlerName = useSelector((s) => s.session.pitchBowlerName);
  const pitchNameKeepCase = useSelector((s) => s.session.pitchNameKeepCase);
  const swingBowlerType = useSelector((s) => s.session.swingBowlerType);
  const pitchFakeBalls = useSelector((s) => s.session.pitchFakeBalls);
  const pitchTickerText = useSelector((s) => s.session.pitchTickerText);
  const stumpBowlerName = useSelector((s) => s.session.stumpBowlerName);
  const ballCategories = useSelector((s) => s.session.ballCategories);
  const pitchGlow = useSelector((s) => s.session.pitchGlow);
  const stumpGlow = useSelector((s) => s.session.stumpGlow);
  const sixRotateStadium = useSelector((s) => s.session.sixRotateStadium);
  const sixRotateDeg = useSelector((s) => s.session.sixRotateDeg);
  const sixShowAngle = useSelector((s) => s.session.sixShowAngle);
  const sixShowSpeed = useSelector((s) => s.session.sixShowSpeed);
  const pitchBowlerType = useSelector((s) => s.session.pitchBowlerType);
  const pitchDotStyle = useSelector((s) => s.session.pitchDotStyle);
  // Inputs for a NEW custom figures column (number + label) added on the right.

  // Editable BOWLER NAME for the ticker. Prefilled from the score API
  // (score.bowling.bowler); the operator can override it and the edited name goes to the
  // big screen (and the operator preview). Empty field → re-syncs to the API name.
  const bowlingAnalysis = useSelector((s) => s.score?.bowling);
  const apiBowler = bowlingAnalysis?.bowler;
  const [bowlerName, setBowlerName] = useState("");
  // Prefill the field ONCE, the first time a real API bowler name appears and the field is
  // still empty. After that the operator fully controls it (so typing/clearing is never
  // snapped back). Empty field → the API name is used as a fallback on Apply/Send.
  const bowlerPrefilledRef = useRef(false);
  useEffect(() => {
    if (apiBowler && !bowlerPrefilledRef.current && !bowlerName) {
      setBowlerName(apiBowler);
      bowlerPrefilledRef.current = true;
    }
  }, [apiBowler, bowlerName]);

  const [mode, setMode] = useState("drs");
  const [innings, setInnings] = useState("1");
  const [overNo, setOverNo] = useState("1");
  const [ballNo, setBallNo] = useState("1");
  const [ballSel, setBallSel] = useState([]);
  const [playModeSel, setPlayModeSel] = useState("chronological"); // Sequential (one-by-one) by default
  // Bowling Analysis controls (defaults per operator spec).
  const [bowlAnimType, setBowlAnimType] = useState("automatic"); // manual | automatic (default automatic)
  const [bowlTrajLen, setBowlTrajLen] = useState("full"); // afterImpact | full (default full trajectory)
  // Output is two independent choices: show Bowling analysis, Pitch mapping, or both
  // (both → bowling first, then pitch map). Default: Bowling analysis only.
  const [outBowling, setOutBowling] = useState(true);
  const [outPitchmap, setOutPitchmap] = useState(false);
  // Pausable = Space can pause/resume the over mid-flight; else it plays straight.
  const [pausableSel, setPausableSel] = useState(true);
  // Which camera machine to fetch the bowling-analysis trajectories from.
  const [bowlingServerId, setBowlingServerId] = useState("m1");
  const [drsDecision, setDrsDecision] = useState("NOT_OUT");
  const [drsRightHanded, setDrsRightHanded] = useState(true);
  const [drsSoftSignal, setDrsSoftSignal] = useState(true); // Shot Offer defaults to Yes
  // DRS review animation: Manual (operator drives the keys) vs Auto (after the
  // review, the camera glides on its own). In Auto, the target is key 4 (Default)
  // or key 1 side (Hand — mirrored by the batter's hand).
  const [drsWithVideo, setDrsWithVideo] = useState(true); // DRS: show the video overlay (else 3D only)
  const [drsAnimMode, setDrsAnimMode] = useState("manual"); // "manual" | "auto"
  const [drsAutoTarget, setDrsAutoTarget] = useState("default"); // "default" | "hand"

  // No-Ball HEIGHT check: operator enters the batsman's name + body-height lines
  // (metres). The ball height at the crease comes from the trajectory; the overlay
  // compares them (ICC: a full-toss above waist → no-ball).
  const [nbBatsman, setNbBatsman] = useState("");
  const [nbWaist, setNbWaist] = useState("");
  const [nbShoulder, setNbShoulder] = useState("");
  const [nbHead, setNbHead] = useState("");

  // Full-toss handling: a ball with no pitching. When detected (DRS mode), the
  // operator chooses which overlay panels to show + sets the Final Decision.
  const ALL_PANELS = [
    "pitching",
    "impact",
    "wickets",
    "originalDecision",
    "playerReview",
  ];
  const FT_DEFAULT_PANELS = [
    "pitching",
    "impact",
    "wickets",
    "originalDecision",
  ]; // all except playerReview
  const [isFullToss, setIsFullToss] = useState(false);
  const [ftPanels, setFtPanels] = useState(FT_DEFAULT_PANELS);
  // The selected ball's decision table (keyed by softSignal+originalDecision+hand),
  // kept so we can tell if the CURRENT on-field selection pitched OUTSIDE LEG — in
  // which case Wickets & Impact don't apply (not tracked past a leg-side pitch).
  const [ballDecisions, setBallDecisions] = useState(null);
  // Panels that make no sense for an outside-leg delivery.
  const OUTSIDE_LEG_HIDDEN = ["wickets", "impact"];
  const [camera, setCamera] = useState(""); // selected camera KEY "<serverId>:<index>"
  const [cameraOpts, setCameraOpts] = useState([]);

  const [inningsOpts, setInningsOpts] = useState([]);
  const [overOpts, setOverOpts] = useState([]);
  const [ballOpts, setBallOpts] = useState([]);

  // Bumping this re-runs the innings/overs/balls list effects to pull fresh data
  // (the dashboard is always mounted, so there's no popup-open event to trigger a
  // refresh). Driven by the manual Refresh button + window focus / tab-visible.
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((n) => n + 1);
  // Mirror the current over + ball lists in refs so the auto-poll interval (below) can
  // compare against them WITHOUT being re-created every time a list changes.
  const ballOptsRef = useRef([]);
  const overOptsRef = useRef([]);
  // Bumped on "Start — preview here" in Pitch Mapping mode → tells PitchMapControls
  // to fetch trajectories + render the dots. Nothing loads until the operator starts.
  const [pitchRunToken, setPitchRunToken] = useState(0);
  const [stumpRunToken, setStumpRunToken] = useState(0);
  // Pitch Mapping uses the Filters panel only (the Over & ball selector was removed).
  // Pitch-map Filters UI selection (the filtered balls) → used by "Send to Big Screen".
  const [pitchFilterSel, setPitchFilterSel] = useState([]);
  const [pitchFilterStyle, setPitchFilterStyle] = useState("runs");
  const handlePitchFilterSelection = useCallback((payload) => {
    setPitchFilterSel(payload?.balls || []);
    setPitchFilterStyle(payload?.dotStyle || "runs");
  }, []);
  // Stump Map selection (mirrors the pitch DRS selection) → used by "Send to Big Screen".
  const [stumpSel, setStumpSel] = useState([]);
  const [stumpReveal, setStumpReveal] = useState("together");
  const [stumpStyle, setStumpStyle] = useState("runs");
  const handleStumpSelection = useCallback((payload) => {
    setStumpSel(payload?.balls || []);
    setStumpReveal(payload?.reveal || "together");
    setStumpStyle(payload?.style || "runs");
  }, []);
  // Interception map: filter panel owns the selection; Start bumps its run token to fetch + plot
  // the bat-impact points. (Big-screen Send not wired yet — operator preview.)
  const [interceptRunToken, setInterceptRunToken] = useState(0);
  const [interceptStyle, setInterceptStyle] = useState("ball");
  const interceptSelRef = useRef([]);
  const handleInterceptSelection = useCallback((payload) => {
    interceptSelRef.current = payload?.balls || [];
    setInterceptStyle(payload?.style || "ball");
  }, []);
  // Wagon Wheel: its filter panel owns the selection; Start bumps the run token to fetch
  // each shot's path and draw the lines. (Big-screen Send is wired separately.)
  const [wagonRunToken, setWagonRunToken] = useState(0);
  // Current wagon selection (balls) — kept in a ref for a future big-screen Send; the preview
  // itself is driven entirely by the filter panel via wagonRunToken.
  const wagonSelRef = useRef([]);
  const handleWagonSelection = useCallback((payload) => {
    wagonSelRef.current = payload?.balls || [];
  }, []);
  // Track the last-loaded over so a plain refresh doesn't wipe the ball selection.
  const loadedOverRef = useRef(null);

  // NOTE: no window-focus / tab-visibility auto-refresh. It re-ran the data
  // effects (which depend on refreshTick) on every click-back, re-fetching data
  // unnecessarily. Data now loads on demand (innings/over/ball change) and on the
  // manual Reload button only.

  const [tc, setTc] = useState("--:--:--");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleTab, setConsoleTab] = useState("settings");
  const [cued, setCued] = useState(false);

  const winRef = useRef(null);
  const externalScreenRef = useRef(null);
  const lastReplaySeqRef = useRef(0);
  const lastStartedModeRef = useRef(null); // mode of the last Start → reset on a change
  const [pipMode, setPipMode] = useState(false); // big-screen window shrunk to PiP

  const accent = MODES[mode].accent;

  /* ---------- live clock ---------- */
  useEffect(() => {
    const p = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setTc(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------- broadcast window handling (ported from BroadcastControls) ---------- */
  // Pre-fetch the external (HDMI) screen so the big-screen window can open on it.
  useEffect(() => {
    if (typeof window === "undefined" || !("getScreenDetails" in window)) return;
    let details;
    const pickExternal = (d) =>
      d.screens.find((s) => !s.isInternal && s !== d.currentScreen) ||
      d.screens.find((s) => s !== d.currentScreen) ||
      null;
    const onChange = () => {
      externalScreenRef.current = details ? pickExternal(details) : null;
    };
    window
      .getScreenDetails()
      .then((d) => {
        details = d;
        externalScreenRef.current = pickExternal(d);
        d.addEventListener("screenschange", onChange);
      })
      .catch(() => {});
    return () => details?.removeEventListener("screenschange", onChange);
  }, []);

  // Restore "broadcasting" if a big screen is already open (operator reload).
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const onMsg = (e) => {
      if (e.data?.type === "pong") dispatch(setBroadcasting(true));
    };
    ch.addEventListener("message", onMsg);
    sendPing();
    return () => ch.removeEventListener("message", onMsg);
  }, [dispatch]);

  // Detect the big-screen window being closed.
  useEffect(() => {
    if (!broadcasting) return;
    const id = setInterval(() => {
      if (winRef.current && winRef.current.closed) {
        winRef.current = null;
        dispatch(setBroadcasting(false));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [broadcasting, dispatch]);

  const openBigScreen = () => {
    const url = `${window.location.pathname}?broadcast=1`;
    const ext = externalScreenRef.current;
    const w = ext?.availWidth ?? screen.availWidth;
    const h = ext?.availHeight ?? screen.availHeight;
    const left = ext?.availLeft ?? 0;
    const top = ext?.availTop ?? 0;
    // Open a TRUE popup (explicit size + no toolbar/menubar/location) so Chrome shows
    // NO tab strip / address bar — just the content. (Safari always shows the URL in
    // popups — that's a browser limit; use Chrome, or launch in kiosk mode, for zero
    // chrome.) See docs/PIP_PICTURE_IN_PICTURE.md.
    const features =
      `popup=yes,toolbar=no,menubar=no,location=no,status=no,` +
      `left=${left},top=${top},width=${w},height=${h}`;
    const win = window.open(url, "drs-broadcast-window", features);
    if (!win) return;
    winRef.current = win;
    dispatch(setBroadcasting(true));
  };

  const stopBroadcast = () => {
    if (winRef.current && !winRef.current.closed) winRef.current.close();
    else sendClose();
    winRef.current = null;
    dispatch(setBroadcasting(false));
    setCued(false);
    setPipMode(false);
  };

  // PiP ⟷ Full: tell the big screen to resize ITSELF. It exits fullscreen first (a
  // fullscreen window ignores resizeTo — that's why the operator-side resize did
  // nothing) then sizes the window; its own resize listener flips session.compact.
  // See docs/PIP_PICTURE_IN_PICTURE.md.
  const togglePip = () => {
    if (!broadcasting) return;
    const next = !pipMode;
    sendPipMode(next);
    setPipMode(next);
  };

  // Day / Night: flip the scene mode locally + mirror it to the big screen.
  const scene = useSelector((s) => s.session.scene);
  const toggleScene = () => {
    const next = scene === "night" ? "day" : "night";
    dispatch(setScene(next));
    sendScene(next);
  };

  /* ---------- delivery data loading ---------- */
  // 6 Highlights follows the connection switch like every other function:
  //   • Sample data (local) → the curated public/highlights dataset (ships with the app).
  //   • Machines on network → the machine's normal dataset (same as bowling/DRS).
  // NOTE: the machine's trajectory_data.json must include the six `bat_hit` data for the
  // replay to show the shot arc; otherwise the highlight will have no batting trajectory.
  const listBase =
    mode === "highlights" && isLocal() ? "/highlights" : undefined;
  useEffect(() => {
    let alive = true;
    listInnings(listBase)
      .then((opts) => {
        if (!alive) return;
        setInningsOpts(opts);
        setInnings((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
      })
      .catch(() => alive && setInningsOpts([]));
    return () => {
      alive = false;
    };
  }, [source, match, refreshTick, listBase]);

  useEffect(() => {
    if (!inningsOpts.includes(innings)) return;
    let alive = true;
    listOvers(innings, listBase)
      .then((opts) => {
        if (!alive) return;
        overOptsRef.current = opts;
        setOverOpts(opts);
        setOverNo((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
      })
      .catch(() => alive && setOverOpts([]));
    return () => {
      alive = false;
    };
  }, [source, match, innings, inningsOpts, refreshTick, listBase]);

  useEffect(() => {
    if (!overOpts.includes(overNo)) return;
    let alive = true;
    // Ball picker: list from a fixed base when one is given (e.g. Highlights → /highlights);
    // otherwise UNION the balls across ALL connected machines so a split over still shows
    // every ball (operator never sees "only 3 available").
    (listBase
      ? listBalls(innings, overNo, listBase)
      : listBallsMultiServer(innings, overNo).then((r) => r.balls))
      .then((opts) => {
        if (!alive) return;
        ballOptsRef.current = opts;
        setBallOpts(opts);
        setBallNo((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
        // Reset the Bowling multi-select to "all" only when the OVER actually
        // changed. On a plain refresh (same over) keep the operator's selection,
        // just dropping any balls that no longer exist.
        const overKey = `${source}|${match}|${innings}|${overNo}`;
        if (loadedOverRef.current !== overKey) {
          loadedOverRef.current = overKey;
          setBallSel(opts);
        } else {
          setBallSel((cur) => cur.filter((b) => opts.includes(b)));
        }
      })
      .catch(() => alive && setBallOpts([]));
    return () => {
      alive = false;
    };
  }, [source, match, innings, overNo, overOpts, refreshTick, listBase]);

  // ── Live auto-refresh (mission/server mode) ────────────────────────────────────
  // Every 3s, quietly re-list the CURRENT over's BALLS + the OVER list from the machine(s).
  // If either set changed (a new ball was bowled — including the 7th/8th for wides/no-balls —
  // or a new over started), bump refresh() ONCE so the existing list effects update the
  // picker (preserving the operator's selection). No reload, no flicker. The steady-state
  // cost is just a couple of tiny directory listings per tick; the heavy work (tags/score)
  // only runs when something actually changed. Skipped in local/sample mode and for the
  // fixed-base local Highlights dataset (listBase set) since those never change.
  useEffect(() => {
    if (isLocal() || listBase) return; // only poll live machine data
    if (!innings || !overNo) return;
    let alive = true;
    const POLL_MS = 3000;
    const tick = async () => {
      try {
        const [{ balls }, overs] = await Promise.all([
          listBallsMultiServer(innings, overNo),
          listOvers(innings),
        ]);
        if (!alive) return;
        const ballsChanged = balls.join(",") !== (ballOptsRef.current || []).join(",");
        const oversChanged = overs.join(",") !== (overOptsRef.current || []).join(",");
        if (ballsChanged || oversChanged) refresh(); // let the list effects do the real update
      } catch {
        /* transient listing failure → try again next tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [source, match, innings, overNo, listBase]);

  // Per-ball outcome tags for the DRS / No-Ball / Bowling ball selector
  // (W / 4 / 6 / runs …). CONNECTION-AWARE (same as the Pitch Map): on a server
  // source it uses the score API, on sample data it reads the trajectory JSON — so
  // the runs show for all three modes regardless of source. Keyed by "over/ball".
  const [ballTags, setBallTags] = useState({});
  // Per-ball bowler's end ("near" | "far"), keyed "over/ball" — drives the DRS camera
  // default (near → Cam 1, far → Cam 4). Comes from /api/balls `bowling_end`.
  const [ballEnds, setBallEnds] = useState({});
  // Per-ball on-field call + batter hand, keyed "over/ball" — auto-fill the DRS
  // Original-Decision ("out"|"notout") and Batsman (L/R) from the score API. Both
  // stay EDITABLE (operator can override); server/live data only (sample = manual).
  const [ballOnField, setBallOnField] = useState({});
  const [ballHand, setBallHand] = useState({});
  useEffect(() => {
    setBallTags({});
    setBallEnds({});
    setBallOnField({});
    setBallHand({});
    if (
      !match ||
      (mode !== "drs" &&
        mode !== "noball" &&
        mode !== "bowling" &&
        mode !== "swing" &&
        mode !== "highlights")
    )
      return;
    let alive = true;
    loadPitchMapData()
      .then(({ balls }) => {
        if (!alive) return;
        const m = {};
        const ends = {};
        const onf = {};
        const hand = {};
        (balls || [])
          .filter((b) => Number(b.innings) === Number(innings))
          .forEach((b) => {
            const key = `${b.over}/${b.ball}`;
            m[key] = b.is_wicket
              ? dismissalTag(b.dismissal) // LBW / C / B / RO … (not plain "W")
              : b.outcome === "four"
                ? "4"
                : b.outcome === "six"
                  ? "6"
                  : b.is_legal === false
                    ? "•"
                    : String(b.runs ?? 0);
            if (b.bowling_end) ends[key] = String(b.bowling_end).toLowerCase();
            if (b.onfield_decision)
              onf[key] = String(b.onfield_decision).toLowerCase();
            if (b.batter_hand) hand[key] = b.batter_hand; // "R" | "L"
          });
        setBallTags(m);
        setBallEnds(ends);
        setBallOnField(onf);
        setBallHand(hand);
      })
      .catch(() => {
        if (alive) {
          setBallTags({});
          setBallEnds({});
          setBallOnField({});
          setBallHand({});
        }
      });
    return () => {
      alive = false;
    };
  }, [match, innings, mode, refreshTick]);

  // Ticker default per mode. PITCH MAPPING: all three hide boxes start UNCHECKED (ticker,
  // bowler container and length distribution all SHOW). Every OTHER mode keeps the original
  // defaults (ticker hidden; bowler container shown). Re-applied on each mode switch; the
  // checkboxes still override within a mode.
  useEffect(() => {
    const isPitch = mode === "pitch";
    // Ticker: shown by default in Pitch mapping AND Wagon wheel; hidden by default elsewhere.
    dispatch(setHideTicker(!(isPitch || mode === "wagon" || mode === "interception")));
    // Bowler container: shown by default in Pitch mapping (was hidden) and elsewhere.
    dispatch(setHideBowler(false));
    // Length distribution: shown by default in Pitch mapping.
    if (isPitch) dispatch(setHideLengthDist(false));
    // "Show name only" is a Bowling-analysis option — off in every other mode.
    dispatch(setBowlerNameOnly(false));
  }, [mode, dispatch]);

  // Wagon wheel: push ONLY the live TICKER/DISPLAY options (name + legend containers, name text,
  // fours/sixes legend) to the big screen as they change — these are cosmetic and safe live.
  // The ANIMATION setup (style / sweep direction / reveal / duration) is NOT pushed here: those
  // re-sort + re-play the wheel, so they must only take effect on "Send to Broadcast".
  useEffect(() => {
    if (mode !== "wagon" || !broadcasting || currentShow?.kind !== "wagon") return;
    sendWagonOptions({
      batterName: wagonBatterName,
      nameKeepCase: wagonNameKeepCase,
      fours: wagonFours,
      sixes: wagonSixes,
      hideCard: wagonHideCard,
      hideName: wagonHideName,
    });
  }, [
    mode, broadcasting, currentShow,
    wagonBatterName, wagonNameKeepCase, wagonFours, wagonSixes, wagonHideCard, wagonHideName,
  ]);

  // Interception: push the live ticker name/case + ticker show-hide while it's the show on air.
  useEffect(() => {
    if (mode !== "interception" || !broadcasting || currentShow?.kind !== "intercept") return;
    sendInterceptOptions({ name: interceptName, nameKeepCase: interceptNameKeepCase });
    sendTicker(hideTicker);
  }, [mode, broadcasting, currentShow, interceptName, interceptNameKeepCase, hideTicker]);

  // Switching modules resets ONLY the operator preview to idle — it must NEVER touch the
  // big screen. The big screen keeps showing whatever was last SENT and only changes when
  // the operator clicks "Send to Big Screen". Skip the initial mount.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return; // initial mount → nothing to reset
    prevModeRef.current = mode;
    goIdle(dispatch); // reset the OPERATOR preview only (no broadcast message sent)
  }, [mode, dispatch]);


  useEffect(() => {
    if (!ballOpts.includes(ballNo)) return;
    let alive = true;
    probeCamerasAllServers(innings, overNo, ballNo)
      .then((opts) => {
        if (!alive) return;
        setCameraOpts(opts);
      })
      .catch(() => alive && setCameraOpts([]));
    return () => {
      alive = false;
    };
  }, [source, match, innings, overNo, ballNo, ballOpts]);

  // Detect a FULL TOSS for the selected ball (DRS mode): fetch its trajectory
  // data and check whether it has any pitching point. No pitching → full toss →
  // show the operator the panel-selection + Final Decision controls.
  useEffect(() => {
    if (mode !== "drs" || !ballOpts.includes(ballNo)) {
      setIsFullToss(false);
      setBallDecisions(null);
      return;
    }
    let alive = true;
    loadTrajectory(innings, overNo, ballNo)
      .then((data) => {
        if (!alive) return;
        const b = data?.balls?.[0];
        const decs = b?.ballMeta?.decisions;
        setBallDecisions(decs ?? null);
        const hasPitchCoords = (b?.pitchingCoordinates?.length ?? 0) > 0;
        // Full toss = the DECISION table says pitching is N/A (null / "NA" / dash
        // "–") for every row — that's the authoritative signal (rule 3.4.9 etc.).
        // pitchingCoordinates can contain a spurious end-of-trajectory point, so
        // we do NOT require it to be empty; fall back to it only if there are no
        // decisions.
        const decPitchAllNA =
          decs && Object.values(decs).every((d) => PITCH_IS_NA(d.pitching));
        const ft = decs ? decPitchAllNA : !hasPitchCoords;
        console.log("[drs] FULL-TOSS check", {
          ball: `in-${innings}/${overNo}/${ballNo}`,
          isFullToss: !!ft,
          pitchingCoordsCount: b?.pitchingCoordinates?.length ?? 0,
          decisionPitchingValues: decs
            ? [...new Set(Object.values(decs).map((d) => d.pitching ?? "null"))]
            : "(no decisions)",
        });
        setIsFullToss(!!ft);
        if (ft) setFtPanels(FT_DEFAULT_PANELS); // reset defaults on a new full toss
      })
      .catch(() => alive && setIsFullToss(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, match, innings, overNo, ballNo, ballOpts, mode]);

  // Is the CURRENT on-field selection an outside-leg pitch? Build the same decision
  // key drsController uses (softSignal + originalDecision + hand) and read that row's
  // pitching value. If it pitched outside leg, Wickets & Impact don't apply.
  const isOutsideLeg = (() => {
    if (mode !== "drs" || isFullToss || !ballDecisions) return false;
    const s = drsSoftSignal ? "1" : "0";
    const o = drsDecision === "OUT" ? "1" : "0";
    const h = drsRightHanded ? "1" : "0";
    const pitching = ballDecisions[s + o + h]?.pitching;
    return String(pitching ?? "").toUpperCase() === "OUTSIDE_LEG";
  })();

  // Outside leg → drop Wickets & Impact from the selection so the checkboxes read
  // unselected and they're never sent/shown. (They're also disabled in the UI.)
  useEffect(() => {
    if (isOutsideLeg) {
      setFtPanels((cur) => cur.filter((p) => !OUTSIDE_LEG_HIDDEN.includes(p)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOutsideLeg]);

  // This ball's bowler end ("near" | "far"), used to auto-pick the DRS camera.
  const currentEnd = ballEnds[`${overNo}/${ballNo}`] || null;

  // 6 Highlights: AUTO-rotate the stadium by the bowler's end — FAR end → rotate (by the
  // operator-editable degrees, default 180), NEAR end → no rotation. Re-applies when the
  // selected ball (its end) changes; mirrors live to the big screen while a six is on air.
  useEffect(() => {
    if (mode !== "highlights") return;
    const shouldRotate = currentEnd === "far";
    dispatch(setSixRotateStadium(shouldRotate));
    if (broadcasting && currentShow?.kind === "single") sendSixRotateStadium(shouldRotate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentEnd]);

  // Auto-fill the DRS On-field Decision from the score API when a ball is selected:
  //  • Original Decision ← drs.onField  ("out" → OUT, else NOT OUT)
  //  • Batsman L/R       ← striker's roster style (R → right, L → left)
  // Both stay EDITABLE — this only (re)applies when the SELECTED BALL changes, so a
  // manual override within the same ball is kept. No data (sample mode) → unchanged.
  useEffect(() => {
    if (mode !== "drs") return;
    const key = `${overNo}/${ballNo}`;
    const onf = ballOnField[key];
    if (onf) setDrsDecision(onf === "out" ? "OUT" : "NOT_OUT");
    const hand = ballHand[key];
    if (hand) setDrsRightHanded(hand !== "L"); // "L" → left, else right
  }, [mode, overNo, ballNo, ballOnField, ballHand]);

  // Default camera per mode:
  //  • DRS — AUTO-PICK by the bowler's end: near → Cam 1, far → Cam 4 (falls back to
  //    Cam 1 / the first feed if that index isn't available). Re-runs when the ball's
  //    end changes; a manual pick within the same ball is preserved (end unchanged).
  //  • No-Ball opens on Cam 2 (front-foot angle); others on Cam 1.
  // Keeps the current camera if still valid so an operator/auto-play choice survives.
  useEffect(() => {
    if (!cameraOpts.length) return;
    if (mode === "drs" && currentEnd) {
      const wantIdx = currentEnd === "far" ? "4" : "1";
      const pick =
        cameraOpts.find((c) => String(c.index) === wantIdx) ||
        cameraOpts.find((c) => String(c.index) === "1") ||
        cameraOpts[0];
      if (pick) {
        setCamera(pick.key);
        return;
      }
    }
    setCamera((cur) => {
      if (cameraOpts.some((c) => c.key === cur)) return cur;
      return mode === "noball"
        ? (cameraOpts[1]?.key ?? cameraOpts[0].key)
        : cameraOpts[0].key;
    });
  }, [cameraOpts, mode, currentEnd]);

  // Automatic + Combine auto-advance now lives in <MultiAutoAdvance/> (mounted in
  // both the operator app and the big screen) so both behave identically.

  /* ---------- actions ---------- */
  async function buildCommand(camKey = camera) {
    if (mode === "bowling") {
      const chosen = ballOpts.filter((b) => ballSel.includes(b));
      const balls = chosen.length ? chosen : ballOpts;
      // Resolve EACH ball to the machine that actually has it (an over can be SPLIT across
      // machines — m1 has some balls, m2 the rest). First-machine-wins; local → single source.
      const { urls, missing } = await resolveDeliveryUrls(
        balls.map((b) => ({ innings, over: overNo, ball: b })),
        bowlingServerId,
      );
      if (missing)
        console.warn(
          `[bowling] ${missing} of ${balls.length} ball(s) not found on any machine`,
        );
      dispatch(setSelection({ innings, over: overNo }));
      // Output routing: Pitch mapping ONLY → go straight to the pitch map. Otherwise
      // play the bowling analysis (and combine → advance to the pitch map after).
      if (outPitchmap && !outBowling) {
        return { kind: "pitch", urls };
      }
      // Carry the playback opts so the BIG SCREEN behaves exactly like the operator
      // (trajectory length, combine→pitch-map, Automatic auto-advance).
      return {
        kind: "over",
        urls,
        overNo,
        playMode: playModeSel,
        pausable: pausableSel,
        trajLen: bowlTrajLen,
        combinePitchMap: outBowling && outPitchmap,
        autoPlay: bowlAnimType === "automatic",
      };
    }
    if (mode === "pitch") {
      // Pitch analysis: map bounce points across the length zones (kind "pitch").
      // Send EXACTLY the balls the preview plots, in either UI: the operator-picked
      // balls (Over & ball) or the filtered balls (Filters). Falls back to the whole
      // selected over only if nothing is selected. Each ball is resolved to the machine
      // that has it (split overs supported).
      const filterMode = pitchFilterSel.length;
      const items = filterMode
        ? pitchFilterSel
        : ballOpts.map((b) => ({ innings, over: overNo, ball: b }));
      // Resolve per ball (not resolveDeliveryUrls, which drops misses) so each URL stays
      // paired with its ball meta; balls on no machine are dropped together with their meta.
      // No preferred machine: the preview (loadTrajectory) resolves without one, so the big
      // screen must pick the SAME machine's file when a ball exists on more than one.
      const resolved = await Promise.all(
        items.map((d) => resolveDeliveryUrl(d.innings, d.over, d.ball)),
      );
      const urls = [];
      const meta = [];
      resolved.forEach((u, i) => {
        if (!u) return;
        urls.push(u);
        meta.push(items[i].outcome != null ? items[i] : null);
      });
      dispatch(setSelection({ innings, over: overNo }));
      // Carry the reveal mode + dot style so the big screen matches the preview, plus the
      // per-ball meta so its dots (LHB side, runs, outcome) are built exactly like the preview.
      return {
        kind: "pitch",
        urls,
        meta,
        reveal: "together",
        style: filterMode ? pitchFilterStyle : "runs",
      };
    }
    if (mode === "stump") {
      // Stump Map: plot where each ball crosses the stumps plane (kind "stump").
      // Each ball resolved to the machine that has it (split overs supported).
      const sel = stumpSel.length
        ? stumpSel
        : ballOpts.map((b) => ({ innings, over: overNo, ball: b }));
      // Same as the pitch map: resolve per ball the way the preview does (no preferred
      // machine) and keep each URL paired with its ball meta, so the big screen builds
      // the SAME dots (LHB side, runs, outcome) as the preview.
      const resolved = await Promise.all(
        sel.map((d) => resolveDeliveryUrl(d.innings, d.over, d.ball)),
      );
      const urls = [];
      const meta = [];
      resolved.forEach((u, i) => {
        if (!u) return;
        urls.push(u);
        meta.push(sel[i].outcome != null ? sel[i] : null);
      });
      dispatch(setSelection({ innings, over: overNo }));
      return { kind: "stump", urls, meta, reveal: stumpReveal, style: stumpStyle };
    }
    if (mode === "interception") {
      // Interception: plot each ball's BAT-IMPACT point. Resolve per ball (split-over safe),
      // carry the per-ball meta so the big screen builds the SAME points as the preview.
      const sel = interceptSelRef.current.length
        ? interceptSelRef.current
        : ballOpts.map((b) => ({ innings, over: overNo, ball: b }));
      const resolved = await Promise.all(
        sel.map((d) => resolveDeliveryUrl(d.innings, d.over, d.ball)),
      );
      const urls = [];
      const meta = [];
      resolved.forEach((u, i) => {
        if (!u) return;
        urls.push(u);
        meta.push(sel[i].outcome != null ? sel[i] : null);
      });
      dispatch(setSelection({ innings, over: overNo }));
      return { kind: "intercept", urls, meta, style: interceptStyle };
    }
    if (mode === "wagon") {
      // Wagon wheel: one line per scoring shot (bat → landing). Resolve per ball + carry meta so
      // the big screen builds the SAME lines as the preview; carry the display options too.
      const sel = wagonSelRef.current.length
        ? wagonSelRef.current
        : ballOpts.map((b) => ({ innings, over: overNo, ball: b }));
      const resolved = await Promise.all(
        sel.map((d) => resolveDeliveryUrl(d.innings, d.over, d.ball)),
      );
      const urls = [];
      const meta = [];
      resolved.forEach((u, i) => {
        if (!u) return;
        urls.push(u);
        meta.push(sel[i].outcome != null ? sel[i] : null);
      });
      dispatch(setSelection({ innings, over: overNo }));
      return { kind: "wagon", urls, meta };
    }
    if (mode === "swing") {
      // Swing Analysis: single ball → draw its trajectory release→impact. Same
      // command shape the operator preview uses, so the big screen matches.
      dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
      return { kind: "swing", innings, over: overNo, ball: ballNo };
    }
    if (mode === "highlights") {
      // 6 Highlights → the batting-six replay (camera + labels). Follows the connection
      // switch: Sample → curated /highlights file; Machine → the ball resolved to whichever
      // machine has it (its trajectory_data.json must carry the six bat_hit data). An
      // ABSOLUTE url is sent so the big screen loads the same ball (no primary-only miss).
      const url = isLocal()
        ? `/highlights/in-${innings}/${overNo}/${ballNo}/${DELIVERY_FILE}`
        : (await resolveDeliveryUrl(innings, overNo, ballNo, bowlingServerId)) ||
          deliveryUrl(innings, overNo, ballNo);
      dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
      return { kind: "single", url, session: "BATTING_SESSION", six: true };
    }
    // Resolve the selected camera to ITS OWN machine's folder + local index.
    const cam =
      cameraOpts.find((c) => c.key === camKey) || cameraOpts[0] || null;
    const folderUrl = cam ? cam.folder : deliveryFolder(innings, overNo, ballNo);
    const cameraIndex = cam ? cam.index : "0";
    dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
    const operatorInput = {
      originalDecision: mode === "noball" ? "NOT_OUT" : drsDecision,
      isRightHanded: mode === "noball" ? true : drsRightHanded,
      softSignal: mode === "noball" ? false : drsSoftSignal,
    };
    // DRS: the operator's chosen overlay panels apply to EVERY ball. A full toss
    // also sets the Final Decision override (it has no computed decision of its own);
    // for a normal ball we leave the decision to the rules (don't force it).
    if (mode === "drs") {
      operatorInput.panels = ftPanels;
      if (isFullToss) operatorInput.finalDecision = "NOT_OUT";
      // Auto review animation: glide to key 4 (front) or key 1 (side, hand-aware).
      operatorInput.autoAngle =
        drsAnimMode === "auto"
          ? drsAutoTarget === "hand"
            ? "side"
            : "front"
          : null;
    }
    // No-ball HEIGHT check: carry the batsman name + body-height lines (metres).
    if (mode === "noball") {
      operatorInput.heightCheck = {
        batsman: nbBatsman.trim(),
        waist: nbWaist === "" ? null : Number(nbWaist),
        shoulder: nbShoulder === "" ? null : Number(nbShoulder),
        head: nbHead === "" ? null : Number(nbHead),
      };
    }
    return {
      kind: "drs",
      folderUrl,
      operatorInput,
      noBall: mode === "noball",
      camera: cameraIndex,
      // Video overlay: operator toggle for DRS; no-ball always keeps the video.
      withVideo: mode === "drs" ? drsWithVideo : true,
    };
  }

  // Play the selected show on the OPERATOR preview (centre stage) only, and
  // pull the score snapshot for this delivery (also covers camera-select, which
  // calls startPreview). No snapshot fetch happens on plain selection changes.
  // Load the over's score, then apply the operator's BOWLER-NAME override (if any) to BOTH
  // this store (so the operator-preview ticker shows the edited name) and the returned
  // payload (so the big screen gets it via sendBowlingAnalysis). Empty field → API name.
  async function loadBowlingWithBowler(args) {
    const res = await dispatch(loadBowlingAnalysis(args));
    let payload = res?.payload;
    // The bowler-name override is BOWLING ANALYSIS only. Pitch map / stump map always use
    // the API name (they have their own controls).
    const override = mode === "bowling" ? bowlerName.trim() : "";
    if (payload && override && override !== payload.bowler) {
      payload = { ...payload, bowler: override };
      dispatch(setBowlingAnalysis(payload)); // reflect the override on the operator preview
    }
    return payload;
  }

  // Apply the typed bowler name to the ticker IMMEDIATELY (no need to re-Start): merge it
  // into the current bowling analysis so the operator preview ticker updates now, and push
  // it to the big screen too when broadcasting. Empty field → fall back to the API name.
  function applyBowlerName(name = bowlerName) {
    const trimmed = (name ?? "").trim();
    const cur = bowlingAnalysis || {};
    const payload = { ...cur, bowler: trimmed || cur.bowler || null };
    // OPERATOR PREVIEW ONLY. The big screen updates only when the operator clicks
    // "Send to Big Screen" (which carries the override via loadBowlingWithBowler).
    dispatch(setBowlingAnalysis(payload));
  }

  // Pitch-map figures columns: OPERATOR PREVIEW ONLY. The big screen updates only when the
  // operator clicks "Send to Big Screen" (which pushes the full config). Used by the column
  // toggles + custom-column add/remove.
  // Pitch-map ticker edits: OPERATOR PREVIEW ONLY (the big screen updates on "Send to Big
  // Screen", which pushes both). The blue header shows the bowler name; the white card shows
  // the free text (empty → no white card).
  // Bowler type (seamers | spinners) → the pitch length-zone set. Updates the preview AND
  // the big screen live (the zone bands crossfade), since it's a scene change, not ticker text.
  function updatePitchBowlerType(bt) {
    dispatch(setPitchBowlerType(bt));
    if (broadcasting && currentShow?.kind === "pitch") sendPitchBowlerType(bt);
  }
  function updatePitchBowlerName(v) {
    dispatch(setPitchBowlerName(v));
  }
  // Pitch map: show the bowler name as typed instead of forced UPPERCASE. Live preview;
  // mirrored to the big screen while the pitch map is on air (and again on Send).
  // Swing analysis: Spin (legend "Turn") or Seam (legend "Swing"). Live preview; mirrored
  // to the big screen while the swing is on air (and again on Send).
  function updateSwingBowlerType(t) {
    dispatch(setSwingBowlerType(t));
    if (broadcasting && currentShow?.kind === "swing") sendSwingBowlerType(t);
  }
  function updatePitchNameKeepCase(on) {
    dispatch(setPitchNameKeepCase(on));
    if (broadcasting && currentShow?.kind === "pitch") sendPitchNameKeepCase(on);
  }
  function updatePitchTickerText(v) {
    dispatch(setPitchTickerText(v));
  }
  function updateStumpBowlerName(v) {
    dispatch(setStumpBowlerName(v));
  }
  // Outcome-category checkboxes (DOTS/RUNS/FOURS/SIXES/WICKETS) shown next to the bowler name
  // on the pitch + stump panels. Unchecked → that category's balls + legend swatch are hidden.
  function renderCategoryChecks() {
    const glowMap = mode === "stump" ? stumpGlow : pitchGlow;
    return (
      <div style={{ marginTop: 12 }}>
        <label
          style={{
            display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
          }}
        >
          Show outcomes{" "}
          <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "#5A6884" }}>
            · tap = pulse, ✓ = show
          </span>
        </label>
        <div style={{ display: "flex", flexWrap: "nowrap", gap: 6 }}>
          {OUTCOME_LEGEND.map((l) => {
            const visible = ballCategories[l.key] !== false;
            const pulsing = !!glowMap?.[l.key];
            return (
              <div key={l.key} style={{ position: "relative", flex: 1, minWidth: 0 }}>
                {/* Body = toggle the continuous pulse for this outcome. */}
                <button
                  type="button"
                  onClick={() => toggleGlowCategory(l.key)}
                  title={`${l.label} — tap to ${pulsing ? "stop" : "start"} pulse`}
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "6px 16px 6px 4px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid", borderColor: pulsing ? l.color : "#2A3447",
                    background: pulsing ? "rgba(167,139,250,0.15)" : "transparent",
                    color: visible ? "#E6E9F0" : "#6B7791", fontSize: 11, fontWeight: 700,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  <span
                    className={pulsing ? "db-oc-dot beat" : "db-oc-dot"}
                    style={{
                      flex: "none",
                      width: 11, height: 11, borderRadius: "50%", background: l.color,
                      opacity: visible ? 1 : 0.3, border: "1px solid rgba(0,0,0,0.25)",
                    }}
                  />
                  {l.label}
                </button>
                {/* Corner check = show / hide these dots on the map. */}
                <button
                  type="button"
                  onClick={() => toggleBallCategory(l.key)}
                  title={visible ? "Hide these dots" : "Show these dots"}
                  style={{
                    position: "absolute", top: 3, right: 3, padding: 0,
                    width: 14, height: 14, borderRadius: 4, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid", borderColor: visible ? accent : "#39445A",
                    background: visible ? accent : "transparent",
                    color: "#04121f", fontSize: 10, fontWeight: 900, lineHeight: 1,
                  }}
                >
                  {visible ? "✓" : ""}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  // Toggle one outcome category (dot/runs/four/six/wicket) for the pitch + stump maps. Live
  // in the preview; mirrored to the big screen when the matching show is on air.
  function toggleBallCategory(key) {
    const next = { ...ballCategories, [key]: ballCategories[key] === false };
    dispatch(setBallCategories({ [key]: ballCategories[key] === false }));
    const onAir = currentShow?.kind;
    if (broadcasting && (onAir === "pitch" || onAir === "stump")) {
      sendBallCategories(next);
    }
  }
  // Toggle the continuous heartbeat PULSE for one outcome category. Pitch + Stump keep
  // independent glow state; mirrored to the big screen when that map is on air.
  function toggleGlowCategory(key) {
    const isStump = mode === "stump";
    const cur = isStump ? stumpGlow : pitchGlow;
    const value = !cur?.[key];
    dispatch((isStump ? setStumpGlow : setPitchGlow)({ [key]: value }));
    const onAir = currentShow?.kind;
    if (broadcasting && onAir === (isStump ? "stump" : "pitch")) {
      (isStump ? sendStumpGlow : sendPitchGlow)({ ...cur, [key]: value });
    }
  }
  // Bowling-analysis ticker metric (speed | runs | both). Live preview; mirrored to the big
  // screen immediately while broadcasting (and again on Send) so both stay in sync.
  function updateBowlingTickerMetric(m) {
    dispatch(setBowlingTickerMetric(m));
    if (broadcasting && currentShow?.kind === "bowling") sendBowlingTickerMetric(m);
  }
  // 6 Highlights: set the rotate degrees (operator-editable). Live preview; mirrored on air.
  function updateSixRotateDeg(deg) {
    dispatch(setSixRotateDeg(deg));
    if (broadcasting && currentShow?.kind === "single") sendSixRotateDeg(deg);
  }
  // 6 Highlights: show/hide the Launch angle label. Live preview; mirrored on air.
  function updateSixShowAngle(on) {
    dispatch(setSixShowAngle(on));
    if (broadcasting && currentShow?.kind === "single") sendSixShowAngle(on);
  }
  // 6 Highlights: show/hide the Ball speed label. Live preview; mirrored on air.
  function updateSixShowSpeed(on) {
    dispatch(setSixShowSpeed(on));
    if (broadcasting && currentShow?.kind === "single") sendSixShowSpeed(on);
  }

  async function startPreview(camKey = camera) {
    // If the MODE changed since the last Start, clear the previous view first (active
    // DRS + its panels, a pitch map, a running over) so the new mode starts clean.
    // Skips camera-switches within the same mode (startPreview is called for those too).
    if (lastStartedModeRef.current !== null && lastStartedModeRef.current !== mode) {
      goIdle(dispatch);
    }
    lastStartedModeRef.current = mode;

    // Pitch Mapping: the filter panel owns the selection. Starting just triggers
    // it (pitchRunToken) to fetch the filtered balls' trajectories + render dots —
    // no fetch happens until this point. Still load the over's score for outcomes.
    if (mode === "pitch") {
      setCued(false);
      setPitchRunToken((n) => n + 1);
      if (match) {
        dispatch(clearSnapshot());
        loadBowlingWithBowler({ match, innings, over: overNo, balls: selectedBalls() });
      }
      return;
    }
    // Stump Map: same flow as pitch mapping — its filter panel owns the selection and
    // Start just triggers it (stumpRunToken) to fetch + plot the stumps-crossing dots.
    if (mode === "stump") {
      setCued(false);
      setStumpRunToken((n) => n + 1);
      if (match) {
        dispatch(clearSnapshot());
        loadBowlingWithBowler({ match, innings, over: overNo, balls: selectedBalls() });
      }
      return;
    }
    // Interception: filter panel owns the selection; Start triggers it (interceptRunToken) to
    // fetch + plot the bat-impact points.
    if (mode === "interception") {
      setCued(false);
      setInterceptRunToken((n) => n + 1);
      if (match) {
        dispatch(clearSnapshot());
        loadBowlingWithBowler({ match, innings, over: overNo, balls: selectedBalls() });
      }
      return;
    }
    // Wagon Wheel: like pitch/stump — the filter panel owns the selection, Start triggers it
    // (wagonRunToken) to fetch each shot path and draw the lines.
    if (mode === "wagon") {
      setCued(false);
      setWagonRunToken((n) => n + 1);
      if (match) dispatch(clearSnapshot());
      return;
    }
    // 6 Highlights: play the selected ball's FULL batting trajectory (the six —
    // trajectory + afterImpact) via the existing BattingTrajectory renderer. The
    // highlight data is SEPARATE (its own `public/highlights/` dataset that ships with
    // the build), used ONLY here — never the main/network dataset (no six data there).
    if (mode === "highlights") {
      setCued(false);
      // Follows the connection switch: Sample → curated /highlights; Machine → the ball
      // resolved to whichever machine has it (split overs).
      const url = isLocal()
        ? `/highlights/in-${innings}/${overNo}/${ballNo}/${DELIVERY_FILE}`
        : (await resolveDeliveryUrl(innings, overNo, ballNo, bowlingServerId)) ||
          deliveryUrl(innings, overNo, ballNo);
      dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
      playSingle(dispatch, url, "BATTING_SESSION", true);
      if (match)
        dispatch(loadSnapshot({ match, innings, over: overNo, ball: ballNo }));
      return;
    }
    // Swing Analysis: single ball → draw its trajectory release → impact.
    if (mode === "swing") {
      setCued(false);
      dispatch(clearSnapshot());
      dispatch(setCurrentShow({ kind: "swing", innings, over: overNo, ball: ballNo }));
      dispatch(startSwing({ innings, over: overNo, ball: ballNo }));
      dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
      if (match)
        dispatch(loadBowlingAnalysis({ match, innings, over: overNo, balls: [ballNo] }));
      return;
    }
    // Bowling Analysis playback options → the renderer + the Space-flow read these.
    if (mode === "bowling") {
      dispatch(
        setMultiPlaybackOpts({
          trajLen: bowlTrajLen,
          combinePitchMap: outBowling && outPitchmap, // both ticked → over then pitch map
          autoPlay: bowlAnimType === "automatic",
        }),
      );
    }
    const cmd = await buildCommand(camKey);
    dispatch(setCurrentShow(cmd));
    executeCommand(dispatch, cmd); // "over" plays immediately; auto-advance (combine) is handled by the effect
    setCued(false);
    if (mode === "bowling" || mode === "pitch") {
      // Bowling analysis + pitch map both need the over's score (bowler, teams,
      // and per-ball runs/wickets from ballLog). One call per over.
      dispatch(clearSnapshot());
      if (match) {
        loadBowlingWithBowler({ match, innings, over: overNo, balls: selectedBalls() });
      }
    } else if (match) {
      dispatch(clearBowlingAnalysis());
      dispatch(loadSnapshot({ match, innings, over: overNo, ball: ballNo }));
    }
  }

  // Auto-play a ball requested by the DRS hub over the socket (cmd.replay.load,
  // parsed into remoteReplay.request). Points the data source at the message's
  // server + match, reflects the delivery in the picker, and plays it on the
  // PREVIEW using the operator's CURRENT mode — same as pressing Start. Nothing
  // goes to the big screen; the operator sends it there manually as usual.
  async function applyRemoteReplay(req) {
    const { match: m, innings: inn, over: ov, ball: bl, cam, trajUrl } = req;

    // Only the delivery comes from the message; keep the configured server.
    dispatch(setSource("server"));
    dispatch(setSelection({ match: m, innings: inn, over: ov, ball: bl }));
    setCued(false);

    // Reflect the delivery in the picker.
    setInnings(inn);
    setOverNo(ov);
    setBallNo(bl);

    const trajFor = () =>
      trajUrl || `${deliveryFolder(inn, ov, bl)}trajectory_data.json`;

    // Bowling analysis: play the ball as a one-ball over (trajectory only).
    if (mode === "bowling") {
      const cmd = { kind: "over", urls: [trajFor()], overNo: ov, playMode: playModeSel, pausable: pausableSel };
      dispatch(setCurrentShow(cmd));
      executeCommand(dispatch, cmd);
      dispatch(clearSnapshot());
      if (m) dispatch(loadBowlingAnalysis({ match: m, innings: inn, over: ov, balls: [bl] }));
      return;
    }

    // DRS / No-Ball: probe the ball's cameras — this ALSO drives the "Live
    // Camera Angles" panel and the footer — then play the backend-provided
    // camera (else the default, else the first) and reflect it in the selection.
    const opts = await probeCamerasAllServers(inn, ov, bl);
    setCameraOpts(opts);

    if (!opts.length) {
      // No camera feeds → 3D batting trajectory fallback.
      const cmd = { kind: "single", url: trajFor(), session: "BATTING_SESSION" };
      dispatch(setCurrentShow(cmd));
      executeCommand(dispatch, cmd);
      dispatch(clearBowlingAnalysis());
      if (m) dispatch(loadSnapshot({ match: m, innings: inn, over: ov, ball: bl }));
      return;
    }

    const want =
      cam != null && cam !== "" ? String(cam) : String(getDefaultReplayCamera());
    const chosen = opts.find((c) => String(c.index) === want) || opts[0];
    setCamera(chosen.key); // updates the Live Camera Angles highlight + footer

    const operatorInput = {
      originalDecision: mode === "noball" ? "NOT_OUT" : drsDecision,
      isRightHanded: mode === "noball" ? true : drsRightHanded,
      softSignal: mode === "noball" ? false : drsSoftSignal,
    };
    const cmd = {
      kind: "drs",
      folderUrl: chosen.folder,
      operatorInput,
      noBall: mode === "noball",
      camera: chosen.index,
      withVideo: mode === "drs" ? drsWithVideo : true,
    };
    dispatch(setCurrentShow(cmd));
    executeCommand(dispatch, cmd);
    dispatch(clearBowlingAnalysis());
    if (m) dispatch(loadSnapshot({ match: m, innings: inn, over: ov, ball: bl }));
  }

  // Fire the auto-play when a new socket replay request arrives.
  useEffect(() => {
    if (!replayReq || replayReq.seq === lastReplaySeqRef.current) return;
    lastReplaySeqRef.current = replayReq.seq;
    applyRemoteReplay(replayReq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayReq]);

  // Cue the show on the big screen ONLY — does not touch/replay the operator
  // preview (that's what Start is for). So pressing Send won't restart what's
  // already playing here.
  async function sendToBigScreen() {
    const cmd = await buildCommand();
    dispatch(setCurrentShow(cmd));
    if (broadcasting) {
      sendShow(cmd);
      setCued(true);
      sendTicker(hideTicker); // keep the big-screen ticker in sync with the checkbox
      // Push the ticker-layout config so the big screen matches the operator's current setup.
      if (mode === "pitch" || mode === "stump") sendHideBowler(hideBowler);
      // Always sent so a name-only Bowling show never leaks into Pitch / Stump.
      sendBowlerNameOnly(mode === "bowling" && bowlerNameOnly);
      if (mode === "bowling") {
        sendBowlingTickerMetric(bowlingTickerMetric);
      }
      if (mode === "pitch") {
        sendLengthDist(hideLengthDist);
        sendPitchBowlerType(pitchBowlerType);
        sendPitchBowlerName(pitchBowlerName);
        sendPitchNameKeepCase(pitchNameKeepCase);
        sendPitchFakeBalls(pitchFakeBalls); // operator-placed fake balls
        sendPitchTickerText(pitchTickerText);
      }
      if (mode === "stump") {
        sendStumpBowlerName(stumpBowlerName); // dynamic bowler name → big-screen ticker
      }
      if (mode === "pitch" || mode === "stump") {
        sendBallCategories(ballCategories); // which outcome categories show (balls + legend)
        // Per-outcome heartbeat pulse state (independent for pitch vs stump).
        if (mode === "pitch") sendPitchGlow(pitchGlow);
        else sendStumpGlow(stumpGlow);
      }
      if (mode === "highlights") {
        sendSixRotateStadium(sixRotateStadium); // 6 Highlights: stadium rotate on/off
        sendSixRotateDeg(sixRotateDeg); // ...and the rotate degrees
        sendSixShowAngle(sixShowAngle); // launch-angle label on/off
        sendSixShowSpeed(sixShowSpeed); // ball-speed label on/off
      }
      if (mode === "wagon") {
        // Mirror the wagon display options so the big screen draws the SAME wheel (line/actual,
        // direction, reveal, speed, and the ticker fields).
        sendWagonOptions({
          style: wagonStyle,
          sweep: wagonSweep,
          reveal: wagonReveal,
          duration: wagonDuration,
          batterName: wagonBatterName,
          nameKeepCase: wagonNameKeepCase,
          fours: wagonFours,
          sixes: wagonSixes,
          hideCard: wagonHideCard,
          hideName: wagonHideName,
          batHand: wagonBatHand,
        });
      }
      if (mode === "interception") {
        sendInterceptOptions({ name: interceptName, nameKeepCase: interceptNameKeepCase });
        sendBallCategories(ballCategories); // legend reflects the enabled outcome categories
      }
      if (mode === "swing") sendSwingBowlerType(swingBowlerType); // legend: Turn vs Swing
      if (mode === "bowling" || mode === "pitch" || mode === "stump") {
        // Trigger the over's score and push it to the big-screen ticker. Used by
        // the bowling analysis, the pitch map AND the stump map (bowler + per-ball
        // outcomes/runs). The stump map needs byBall too — its dots colour + run
        // numbers and the stump ticker figures all read score.bowling.byBall, same
        // as the pitch map. Without this the big screen has no runs (shows 0).
        let payload = null;
        if (match) {
          // Loads the over's score + applies the operator's bowler-name override.
          payload = await loadBowlingWithBowler({
            match, innings, over: overNo, balls: selectedBalls(),
          });
        }
        // Bowling analysis: ALWAYS carry the current bowler name to the big screen on
        // every Send — even without a match (sample mode) — so re-typing + Send updates
        // it reliably each time.
        if (mode === "bowling") {
          const name = bowlerName.trim();
          const base = payload || bowlingAnalysis || {};
          payload = { ...base, bowler: name || base.bowler || null };
          dispatch(setBowlingAnalysis(payload)); // operator preview in sync
        }
        if (payload) sendBowlingAnalysis(payload);
      } else if (match) {
        // Pull this delivery's score and push it to the big-screen ticker too.
        const res = await dispatch(
          loadSnapshot({ match, innings, over: overNo, ball: ballNo }),
        );
        if (res?.payload) sendSnapshot(res.payload);
      }
    }
  }

  function play() {
    // Respect the Keys target (same as the Space key in DrsKeyBindings):
    // "Big Screen" plays the broadcast; "Operator" replays the local preview
    // only and never touches the big screen.
    if (cameraTarget === "broadcast") {
      if (broadcasting) {
        sendPlay();
        setCued(false);
      }
    } else if (currentShow) {
      executeCommand(dispatch, currentShow);
    }
  }

  function returnToIdle() {
    // Respect the Keys target: "Big Screen" resets the broadcast only;
    // "Operator" resets the local preview only.
    if (cameraTarget === "broadcast") {
      if (broadcasting) sendShow({ kind: "idle" });
      setCued(false);
    } else {
      goIdle(dispatch);
    }
  }

  function pickCamera(key) {
    setCamera(key);
    // Immediately show the clicked feed on the operator preview. We pass the
    // key explicitly (not the `camera` state, which updates a render later),
    // so the first click already shows the right camera — no lag-by-one.
    startPreview(key);
  }

  // The selected balls of the over, in over order (falls back to all balls).
  const selectedBalls = () => {
    const chosen = ballOpts.filter((b) => ballSel.includes(b));
    return chosen.length ? chosen : ballOpts;
  };

  // Bowling multi-ball selection (which balls of the over to include).
  const toggleBall = (b) =>
    setBallSel((cur) =>
      cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b],
    );
  const toggleAllBalls = () =>
    setBallSel((cur) => (cur.length === ballOpts.length ? [] : ballOpts));

  // Delivery label: over.ball combined (e.g. "In 1 · Ov 2.2"); bowling shows the
  // whole over ("In 1 · Ov 2 · all balls").
  const delText =
    mode === "bowling"
      ? `In ${innings} · Ov ${overNo} · all balls`
      : `In ${innings} · Ov ${overNo}.${ballNo}`;
  const camObj = cameraOpts.find((c) => c.key === camera);
  const camLabel = `CAM ${camObj ? camObj.index : "1"}`;

  // Big-screen status: OFF / IDLE / CUED / ON AIR.
  const status = !broadcasting
    ? { cls: "off", text: "Offline" }
    : cued
      ? { cls: "cued", text: "Cued" }
      : currentShow
        ? { cls: "air", text: "On Air" }
        : { cls: "idle", text: "Idle" };

  return (
    <div className="db-root">
      <style>{DB_STYLE}</style>
      <DrsKeyBindings />

      {/* ============ HEADER ============ */}
      <header className="db-header">
        <div className="db-brand">
          <div className="db-logo">3D</div>
          <div>
            <div className="db-brand-title">DRS Preview Console</div>
            <div className="db-brand-sub">StanceBeam</div>
          </div>
        </div>

        <div className="db-ctx">
          <div className="db-ctx-grp">
            <span className="db-k">Match</span>
            <span className="db-v db-mono">{match || "IND vs AUS · 2nd ODI"}</span>
          </div>
          <div className="db-ctx-grp">
            <span className="db-k">Showing</span>
            <span className="db-v db-mono">{delText}</span>
          </div>
          <div className="db-ctx-grp">
            <span className="db-k">Clock</span>
            <span className="db-v db-mono">{tc}</span>
          </div>
        </div>

        <div className="db-session">
          <button
            className="db-hicon"
            title="Menu — connection, settings & keyboard shortcuts"
            onClick={() => {
              setConsoleTab("data");
              setConsoleOpen(true);
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            <span className="db-hicon-t">Menu</span>
          </button>

          <div className="db-target" title="Which screen the number keys (1–5) control">
            <span className="db-target-k">Keys</span>
            <div className="db-target-seg">
              <button
                className={cameraTarget !== "broadcast" ? "on" : ""}
                onClick={() => dispatch(setCameraTarget("operator"))}
              >
                Preview
              </button>
              <button
                className={cameraTarget === "broadcast" ? "on on-bc" : ""}
                onClick={() => dispatch(setCameraTarget("broadcast"))}
              >
                Broadcast
              </button>
            </div>
          </div>

          <div className="db-htransport">
            <button
              className="db-hbtn db-hbtn-play"
              onClick={play}
              title="Play the big screen (replays the preview if not broadcasting)"
            >
              ▶ Play
            </button>
            <button
              className="db-hbtn"
              onClick={returnToIdle}
              title="Return to the idle scene"
            >
              ↺ Reset
            </button>
          </div>

          {/* Day ⟷ Night toggle. The button shows the ACTION (what clicking switches TO),
              not the current state — so in night mode it offers "Day", and vice-versa. */}
          <button
            className="db-pip"
            onClick={toggleScene}
            title={scene === "night" ? "Switch to Day (bright, no floodlights)" : "Switch to Night (floodlights + night sky)"}
          >
            {scene === "night" ? "☀️ DAY" : "🌙 NIGHT"}
          </button>

          {/* Full ⟷ PiP: shrink/restore the big-screen window (only while broadcasting).
              PiP = 400×600 → the big screen shows only the 3D. */}
          {broadcasting && (
            <button
              className={`db-pip${pipMode ? " on" : ""}`}
              onClick={togglePip}
              title={pipMode ? "Restore the big screen to full size" : "Shrink the big screen to a small PiP (3D only)"}
            >
              {pipMode ? "◱ FULL" : "▭ PiP"}
            </button>
          )}

          {/* Broadcast button + its screen status stacked beneath it. */}
          <div className="db-start-wrap">
            <button
              className={`db-start${broadcasting ? " on" : ""}`}
              onClick={broadcasting ? stopBroadcast : openBigScreen}
              title={broadcasting ? "Stop broadcasting" : "Open the big-screen window"}
            >
              <span className="db-start-led" />
              {broadcasting ? "STOP" : "START BROADCAST"}
            </button>
            <span className={`db-status db-status-${status.cls} db-start-status`}>
              <span className="db-status-led" /> Big screen: {status.text}
            </span>
          </div>
        </div>
      </header>

      {/* ============ MAIN ============ */}
      <div className="db-main">
        {/* ---- centre: live 3D stage ---- */}
        <section className="db-stage-wrap">
          <div className="db-stage-head">
            <div className="db-mode-chips">
              {/* Alphabetical by the static label (stable — the swing chip's dynamic text
                  doesn't reshuffle the order). */}
              {Object.entries(MODES)
                .sort((a, b) => a[1].label.localeCompare(b[1].label))
                .map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  className={`db-mode-chip${mode === key ? " on" : ""}`}
                  style={mode === key ? { background: m.accent, borderColor: m.accent } : undefined}
                  onClick={() => setMode(key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="db-cam-tag">{camLabel}</span>
          </div>

          <div className="db-stage" style={{ "--db-accent": accent }}>
            {/* The real preview pipeline — same components the operator tool
                uses — scoped to this panel by the stage's transform (which
                contains the otherwise full-screen fixed video/overlay layers).
                DrsVideoLayer is what actually plays the DRS video and advances
                the replay, so the preview works exactly like the old UI. */}
            <DrsVideoLayer />
            <ThreeScene />
            <Overlay2D />
            <MultiTicker />
            <PitchMapOverlay />
            <MultiPitchTicker />
            <StumpTicker />
            <WagonTicker />
            <InterceptionTicker />

            {/* Broadcast score ticker — fed by GET /snapshot for the current
                delivery (match/innings/over/ball). */}
            <ScoreTicker />

            <div className="db-stage-foot">
              {delText} · {camLabel}
            </div>
          </div>

        </section>

        {/* ---- right rail ---- */}
        <aside className="db-rail">
          <div className="db-rail-scroll">
            {/* MERGED PANEL: camera angles + delivery / decision setup (one container) */}
            <div className="db-panel">
              {/* CAMERA ANGLES — DRS / No-Ball only. Not for bowling (no feeds),
                  pitch/stump analysis, swing, or 6 Highlights. */}
              {mode !== "bowling" && mode !== "pitch" && mode !== "stump" && mode !== "swing" && mode !== "highlights" && mode !== "wagon" && mode !== "interception" && (
                <>
                  <div className="db-panel-head">
                    <span className="db-panel-title">Camera Angles</span>
                    <span className="db-panel-hint">
                      {cameraOpts.length} feed{cameraOpts.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="db-feeds">
                    {(cameraOpts.length ? cameraOpts : [{ key: "", index: "1" }]).map(
                      (c) => {
                        const on = camera === c.key;
                        return (
                          <button
                            key={c.key || c.index}
                            className={`db-feed${on ? " on" : ""}`}
                            style={on ? { "--db-accent": accent } : undefined}
                            onClick={() => pickCamera(c.key)}
                          >
                            <span className="db-feed-name">CAM {c.index}</span>
                          </button>
                        );
                      },
                    )}
                  </div>
                  <div className="db-divider" />
                </>
              )}

              {/* Pitch mapping drives innings/over from its own filter panel below,
                  so the top delivery selector is only for DRS / Bowling / No-Ball. */}
              {mode !== "pitch" && mode !== "stump" && mode !== "wagon" && mode !== "interception" && (
                <>
                  <div className="db-step">
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Which delivery</span>
                    <button
                      className="db-reload db-reload-inline"
                      title="Refresh innings / over / ball lists"
                      onClick={refresh}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
                      Reload
                    </button>
                  </div>
                  <div className="db-delivery">
                    <DeliveryRow label="Innings" items={CLEAN(inningsOpts)} value={innings} onPick={setInnings} accent={accent} />
                    <DeliveryRow label="Over" items={CLEAN(overOpts)} value={overNo} onPick={setOverNo} accent={accent} />
                    {mode === "bowling" ? (
                      <BallMulti
                        items={CLEAN(ballOpts)}
                        selected={ballSel}
                        onToggle={toggleBall}
                        onToggleAll={toggleAllBalls}
                        accent={accent}
                        sub={(n) => ballTags[`${overNo}/${n}`] ?? null}
                      />
                    ) : (
                      <DeliveryRow
                        label="Ball"
                        items={CLEAN(ballOpts)}
                        value={ballNo}
                        onPick={setBallNo}
                        accent={accent}
                        sub={(n) => ballTags[`${overNo}/${n}`] ?? null}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Swing analysis: bowler type → the legend reads "Turn" (spin, turn_deg) or
                  "Swing" (seam, swing_deg). */}
              {mode === "swing" && (
                <div style={{ marginTop: 14 }}>
                  <div className="db-seg">
                    <button
                      className={`db-segbtn${swingBowlerType === "seam" ? " on" : ""}`}
                      style={swingBowlerType === "seam" ? { background: accent } : undefined}
                      onClick={() => updateSwingBowlerType("seam")}
                    >
                      Seam (Seam Movement)
                    </button>
                    <button
                      className={`db-segbtn${swingBowlerType === "spin" ? " on" : ""}`}
                      style={swingBowlerType === "spin" ? { background: accent } : undefined}
                      onClick={() => updateSwingBowlerType("spin")}
                    >
                      Spin (Turn)
                    </button>
                  </div>
                </div>
              )}

              {/* 6 Highlights: stadium rotation is AUTO by the bowler's end — FAR → rotate by the
                  editable degrees (default 180), NEAR → no rotation. Shows the detected end +
                  the degrees that will be applied. */}
              {mode === "highlights" && (() => {
                const isFar = currentEnd === "far";
                const isNear = currentEnd === "near";
                const appliedDeg = isFar ? (Number(sixRotateDeg) || 0) : 0;
                return (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Labels: Height + Distance ALWAYS show. Launch angle / Ball speed are
                      operator-optional (either, both, or neither). */}
                  <label
                    style={{
                      display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: "#5A6884",
                    }}
                  >
                    Labels (height &amp; distance always on)
                  </label>
                  <div className="db-hide-row" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      className={`db-ft-chk${sixShowAngle ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => updateSixShowAngle(!sixShowAngle)}
                    >
                      <span className="db-ft-box" style={sixShowAngle ? { background: accent, borderColor: accent } : undefined}>
                        {sixShowAngle ? "✓" : ""}
                      </span>
                      Launch angle
                    </button>
                    <button
                      type="button"
                      className={`db-ft-chk${sixShowSpeed ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => updateSixShowSpeed(!sixShowSpeed)}
                    >
                      <span className="db-ft-box" style={sixShowSpeed ? { background: accent, borderColor: accent } : undefined}>
                        {sixShowSpeed ? "✓" : ""}
                      </span>
                      Ball speed
                    </button>
                  </div>

                  <label
                    style={{
                      display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: "#5A6884",
                    }}
                  >
                    Stadium rotation (auto by bowler end)
                  </label>
                  {/* The value ACTUALLY applied this ball — 0° for a near-end six, the far-end
                      setting for a far-end six. Leads, so it's never ambiguous. */}
                  <div
                    className="db-drow db-drow-dec"
                    style={{
                      alignItems: "center",
                      background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 12px",
                    }}
                  >
                    <span className="db-drow-l" style={{ width: 110 }}>
                      {currentEnd ? (isFar ? "Far end" : "Near end") : "No ball picked"}
                    </span>
                    <span style={{ fontWeight: 900, fontSize: 18, color: isFar ? accent : "#E9EEF9", marginLeft: "auto" }}>
                      {currentEnd ? `${appliedDeg}°` : "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "#6B7791", marginLeft: 8 }}>
                      {isNear ? "no rotation" : isFar ? "rotates" : "pick a ball"}
                    </span>
                  </div>
                  {/* The far-end SETTING (only used when a six is bowled from the FAR end). Dimmed
                      when the current ball is near-end, so it's clearly not in effect now. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: isNear ? 0.45 : 1 }}>
                    <span
                      style={{
                        fontSize: 9, letterSpacing: "2px", textTransform: "uppercase",
                        color: "#6B7791", fontWeight: 800, width: 110, flex: "none",
                      }}
                    >
                      Far-end setting
                    </span>
                    <input
                      className="db-nb-input"
                      type="number"
                      style={{ width: 80 }}
                      value={sixRotateDeg}
                      onChange={(e) => updateSixRotateDeg(e.target.value)}
                    />
                    <span style={{ fontSize: 12, color: "#5A6884" }}>° (default 180)</span>
                  </div>
                  <div className="db-nb-hint">
                    Far-end sixes rotate the stadium; near-end sixes never rotate. The degrees above
                    apply only to far-end sixes.
                  </div>
                </div>
                );
              })()}

              {mode === "pitch" && (
                <>
                  {/* Filters-only (the Over & ball selector was removed): the filter panel sits
                      at the top. Dots are fetched + rendered on "Start — preview here". */}
                  <div className="db-step">
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Filters</span>
                    <button
                      className="db-reload db-reload-inline db-reload-icon"
                      title="Refresh innings / over / ball lists"
                      onClick={refresh}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
                    </button>
                  </div>
                  <PitchMapControls
                    runToken={pitchRunToken}
                    onSelection={handlePitchFilterSelection}
                  />
                </>
              )}

              {/* Stump Map: plot where each ball crosses the stumps. Same two selection modes
                  as the pitch map — Filters (bowler/phase/outcome…) or Over & ball (pick
                  overs/balls directly). */}
              {mode === "stump" && (
                <>
                  {/* Filters-only (the Over & ball selector was removed): filter panel at the top. */}
                  <div className="db-step">
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Filters</span>
                    <button
                      className="db-reload db-reload-inline db-reload-icon"
                      title="Refresh innings / over / ball lists"
                      onClick={refresh}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
                    </button>
                  </div>
                  <StumpMapFilterControls runToken={stumpRunToken} accent={accent} onSelection={handleStumpSelection} />
                </>
              )}

              {mode === "interception" && (
                <>
                  {/* Filters-only: bat-impact points. */}
                  <div className="db-step">
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Filters</span>
                    <button
                      className="db-reload db-reload-inline db-reload-icon"
                      title="Refresh innings / over / ball lists"
                      onClick={refresh}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
                    </button>
                  </div>
                  <InterceptionFilterControls runToken={interceptRunToken} accent={accent} onSelection={handleInterceptSelection} />
                </>
              )}

              {mode === "wagon" && (
                <>
                  {/* Wagon Wheel — filter panel owns the selection (defaults to sixes). */}
                  <div className="db-step">
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Filters</span>
                    <button
                      className="db-reload db-reload-inline db-reload-icon"
                      title="Refresh innings / over / ball lists"
                      onClick={refresh}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
                    </button>
                  </div>
                  <WagonFilterControls runToken={wagonRunToken} accent={accent} onSelection={handleWagonSelection} />
                </>
              )}

              {/* Editable BOWLER NAME for the ticker — BOWLING ANALYSIS ONLY. Prefilled from
                  the score API; the operator can override it and the edited name goes to the
                  big screen (and the preview). Clear the field to re-sync to the API name.
                  Pitch map / stump map get their own controls separately. */}
              {mode === "bowling" && (
                <div style={{ marginTop: 14 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: "#5A6884",
                      marginBottom: 6,
                    }}
                  >
                    Bowler name (ticker)
                  </label>
                  {/* Live: the ticker name applies as you type (no Apply button needed). */}
                  <input
                    className="db-nb-input"
                    style={{ width: "100%" }}
                    value={bowlerName}
                    placeholder={apiBowler || "BOWLER"}
                    onChange={(e) => {
                      setBowlerName(e.target.value);
                      applyBowlerName(e.target.value);
                    }}
                  />
                  {/* Name only: show just the blue bowler-name header on the ticker, with
                      no over/speed card under it. */}
                  <button
                    type="button"
                    className={`db-ft-chk${bowlerNameOnly ? " on" : ""}`}
                    style={{ marginTop: 10, width: "100%" }}
                    onClick={() => {
                      // OPERATOR PREVIEW ONLY — the big screen updates on "Send to Big Screen".
                      dispatch(setBowlerNameOnly(!bowlerNameOnly));
                    }}
                  >
                    <span
                      className="db-ft-box"
                      style={bowlerNameOnly ? { background: accent, borderColor: accent } : undefined}
                    >
                      {bowlerNameOnly ? "✓" : ""}
                    </span>
                    Show name only
                  </button>

                  {/* What each ball shows under the circle: Speed (km/h), Runs, Both, or None.
                      Label under "Over" follows: SPEED(KPH) / RUNS / SPEED(KPH) for both;
                      None → no per-ball value and no label under "Over". */}
                  <div
                    style={{
                      marginTop: 12, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
                    }}
                  >
                    Ticker shows
                  </div>
                  <div className="db-seg">
                    {[["speed", "Speed"], ["runs", "Runs"], ["both", "Both"], ["none", "None"]].map(([val, lbl]) => (
                      <button
                        key={val}
                        className={`db-segbtn${bowlingTickerMetric === val ? " on" : ""}`}
                        style={bowlingTickerMetric === val ? { background: accent } : undefined}
                        onClick={() => updateBowlingTickerMetric(val)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Show toggles — ticker / lengths / bowler container — in a single row.
                  Checked = that element is SHOWN (unchecked hides it). Live preview + big screen on Send. */}
              {(mode === "bowling" || mode === "pitch" || mode === "stump" || mode === "swing" || mode === "wagon") && (
                <div className="db-hide-row">
                  {/* Wagon: the first toggle controls the BLUE NAME container (its own flag). Every
                      other mode: the generic ticker show/hide. */}
                  {mode === "wagon" ? (
                    <button
                      type="button"
                      className={`db-ft-chk${!wagonHideName ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => dispatch(setWagonHideName(!wagonHideName))}
                    >
                      <span
                        className="db-ft-box"
                        style={!wagonHideName ? { background: accent, borderColor: accent } : undefined}
                      >
                        {!wagonHideName ? "✓" : ""}
                      </span>
                      Name
                    </button>
                  ) : (
                  <button
                    type="button"
                    className={`db-ft-chk${!hideTicker ? " on" : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      const next = !hideTicker;
                      dispatch(setHideTicker(next)); // operator preview (current module)
                      // Mirror to the big screen ONLY if the module being toggled is the one
                      // currently ON AIR — so hiding e.g. Pitch's ticker never touches the
                      // DRS ticker that's actually playing on the broadcast.
                      const onAir = currentShow?.kind;
                      if (broadcasting && onAir && MODE_TO_KIND[mode] === onAir) {
                        sendTicker(next);
                      }
                    }}
                  >
                    <span
                      className="db-ft-box"
                      style={!hideTicker ? { background: accent, borderColor: accent } : undefined}
                    >
                      {!hideTicker ? "✓" : ""}
                    </span>
                    Ticker
                  </button>
                  )}

                  {mode === "pitch" && (
                    <button
                      type="button"
                      className={`db-ft-chk${!hideLengthDist ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => {
                        // OPERATOR PREVIEW ONLY — the big screen updates on "Send to Big Screen".
                        dispatch(setHideLengthDist(!hideLengthDist));
                      }}
                    >
                      <span
                        className="db-ft-box"
                        style={!hideLengthDist ? { background: accent, borderColor: accent } : undefined}
                      >
                        {!hideLengthDist ? "✓" : ""}
                      </span>
                      Lengths
                    </button>
                  )}

                  {(mode === "pitch" || mode === "stump") && (
                    <button
                      type="button"
                      className={`db-ft-chk${!hideBowler ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => {
                        // OPERATOR PREVIEW ONLY — the big screen updates on "Send to Big Screen".
                        dispatch(setHideBowler(!hideBowler));
                      }}
                    >
                      <span
                        className="db-ft-box"
                        style={!hideBowler ? { background: accent, borderColor: accent } : undefined}
                      >
                        {!hideBowler ? "✓" : ""}
                      </span>
                      Container
                    </button>
                  )}

                  {/* Wagon wheel: show/hide the ticker's WHITE card (the Fours/Sixes legend). */}
                  {mode === "wagon" && (
                    <button
                      type="button"
                      className={`db-ft-chk${!wagonHideCard ? " on" : ""}`}
                      style={{ flex: 1 }}
                      onClick={() => dispatch(setWagonHideCard(!wagonHideCard))}
                    >
                      <span
                        className="db-ft-box"
                        style={!wagonHideCard ? { background: accent, borderColor: accent } : undefined}
                      >
                        {!wagonHideCard ? "✓" : ""}
                      </span>
                      Container
                    </button>
                  )}
                </div>
              )}

              {/* Pitch map: BOWLER TYPE → which length-zone set colours the pitch (Seamers 6
                  zones / Spinners 4 zones). Switching crossfades live on preview + big screen. */}
              {mode === "pitch" && (
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <label
                    style={{
                      flex: "none", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: "#5A6884",
                    }}
                  >
                    Bowler type
                  </label>
                  <div style={{ display: "flex", gap: 8, flex: 1 }}>
                    {[["seamers", "Seamers"], ["spinners", "Spinners"]].map(([val, lbl]) => {
                      const on = pitchBowlerType === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updatePitchBowlerType(val)}
                          style={{
                            flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                            fontWeight: 700, cursor: "pointer", border: "1px solid",
                            borderColor: on ? accent : "#2A3447",
                            background: on ? accent : "transparent",
                            color: on ? "#06110A" : "#7C8AA3",
                          }}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pitch map "with runs" ticker: editable BOWLER NAME (blue header) + a free
                  TEXT line (white card). If the text is empty, only the blue header shows.
                  Preview-only here; pushed to the big screen on "Send to Big Screen". */}
              {mode === "pitch" && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label
                      style={{
                        display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                        textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
                      }}
                    >
                      Bowler name (ticker)
                    </label>
                    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <input
                        className="db-nb-input"
                        style={{ flex: 1, minWidth: 0 }}
                        value={pitchBowlerName}
                        placeholder="BOWLER"
                        onChange={(e) => updatePitchBowlerName(e.target.value)}
                      />
                      {/* Off (default) → name forced to UPPERCASE; on → shown exactly as typed. */}
                      <button
                        type="button"
                        className={`db-ft-chk${pitchNameKeepCase ? " on" : ""}`}
                        style={{ flex: "none" }}
                        title="Keep name case as typed (off → forced UPPERCASE)"
                        onClick={() => updatePitchNameKeepCase(!pitchNameKeepCase)}
                      >
                        <span
                          className="db-ft-box"
                          style={pitchNameKeepCase ? { background: accent, borderColor: accent } : undefined}
                        >
                          {pitchNameKeepCase ? "✓" : ""}
                        </span>
                        Keep case
                      </button>
                    </div>
                  </div>
                  {/* Free-text white card is only for the "With runs" view. In "By ball"
                      the card shows the colour legend instead, so hide this input. */}
                  {pitchDotStyle !== "ball" && (
                    <div>
                      <label
                        style={{
                          display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                          textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
                        }}
                      >
                        Ticker text (white card — blank = hidden)
                      </label>
                      <input
                        className="db-nb-input"
                        style={{ width: "100%" }}
                        value={pitchTickerText}
                        placeholder="e.g. Runs tonight"
                        onChange={(e) => updatePitchTickerText(e.target.value)}
                      />
                    </div>
                  )}
                  {renderCategoryChecks()}
                  {/* Operator-placed fake balls (type + length/line). Live preview; mirrored
                      to the big screen while the pitch map is on air (and again on Send). */}
                  <PitchFakeBalls
                    accent={accent}
                    onChange={(list) => {
                      if (broadcasting && currentShow?.kind === "pitch") sendPitchFakeBalls(list);
                    }}
                  />
                </div>
              )}

              {/* Stump map ticker: editable BOWLER NAME (blue header). Prefills from the Bowler
                  filter; the operator can override it. Clear it to re-sync to the API bowler.
                  Preview-only here; pushed to the big screen on "Send to Big Screen". */}
              {mode === "stump" && (
                <div style={{ marginTop: 14 }}>
                  <label
                    style={{
                      display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: "#5A6884", marginBottom: 6,
                    }}
                  >
                    Bowler name (ticker)
                  </label>
                  <input
                    className="db-nb-input"
                    style={{ width: "100%" }}
                    value={stumpBowlerName}
                    placeholder="BOWLER"
                    onChange={(e) => updateStumpBowlerName(e.target.value)}
                  />
                  {renderCategoryChecks()}
                </div>
              )}

              {/* ── Bowling Analysis controls (ordered). Defaults: Manual · After
                  impact · Combined · Bowling analysis · Pause/Resume · Cinematic. ── */}
              {mode === "bowling" && (
                <>
                  {/* 1 · Animation type — Manual (operator drives) vs Automatic (plays
                      through on its own). */}
                  <div className="db-step" style={{ marginTop: 12 }}>
                    <span className="db-step-n">1</span>
                    <span className="db-step-t">Animation type</span>
                  </div>
                  <div className="db-seg" style={{ marginTop: 6 }}>
                    <button
                      className={`db-segbtn${bowlAnimType === "manual" ? " on" : ""}`}
                      style={bowlAnimType === "manual" ? { background: accent } : undefined}
                      onClick={() => setBowlAnimType("manual")}
                    >
                      Manual
                    </button>
                    <button
                      className={`db-segbtn${bowlAnimType === "automatic" ? " on" : ""}`}
                      style={bowlAnimType === "automatic" ? { background: accent } : undefined}
                      onClick={() => setBowlAnimType("automatic")}
                    >
                      Automatic
                    </button>
                  </div>

                  {/* 2 · Play trajectory — stop just after impact, or play the full path. */}
                  <div className="db-step" style={{ marginTop: 12 }}>
                    <span className="db-step-n">2</span>
                    <span className="db-step-t">Play trajectory</span>
                  </div>
                  <div className="db-seg" style={{ marginTop: 6 }}>
                    <button
                      className={`db-segbtn${bowlTrajLen === "afterImpact" ? " on" : ""}`}
                      style={bowlTrajLen === "afterImpact" ? { background: accent } : undefined}
                      onClick={() => setBowlTrajLen("afterImpact")}
                    >
                      After impact
                    </button>
                    <button
                      className={`db-segbtn${bowlTrajLen === "full" ? " on" : ""}`}
                      style={bowlTrajLen === "full" ? { background: accent } : undefined}
                      onClick={() => setBowlTrajLen("full")}
                    >
                      Full trajectory
                    </button>
                  </div>

                  {/* 3 · Sequence — one ball at a time, or all together. */}
                  <div className="db-step" style={{ marginTop: 12 }}>
                    <span className="db-step-n">3</span>
                    <span className="db-step-t">Sequence</span>
                  </div>
                  <div className="db-seg" style={{ marginTop: 6 }}>
                    <button
                      className={`db-segbtn${playModeSel === "chronological" ? " on" : ""}`}
                      style={playModeSel === "chronological" ? { background: accent } : undefined}
                      onClick={() => setPlayModeSel("chronological")}
                    >
                      Sequential
                    </button>
                    <button
                      className={`db-segbtn${playModeSel === "simultaneous" ? " on" : ""}`}
                      style={playModeSel === "simultaneous" ? { background: accent } : undefined}
                      onClick={() => setPlayModeSel("simultaneous")}
                    >
                      Combined
                    </button>
                  </div>

                  {/* 4 · Output — tick Bowling analysis, Pitch mapping, or both. Both
                      ticked → bowling analysis plays first, then the pitch map. At
                      least one stays on. */}
                  <div className="db-step" style={{ marginTop: 12 }}>
                    <span className="db-step-n">4</span>
                    <span className="db-step-t">Output</span>
                  </div>
                  <div className="db-ft-panels" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className={`db-ft-chk${outBowling ? " on" : ""}`}
                      style={outBowling ? { "--db-accent": accent, borderColor: accent } : undefined}
                      onClick={() => setOutBowling((v) => (outPitchmap ? !v : true))}
                    >
                      <span
                        className="db-ft-box"
                        style={outBowling ? { background: accent, borderColor: accent } : undefined}
                      >
                        {outBowling ? "✓" : ""}
                      </span>
                      Trajectories
                    </button>
                    <button
                      type="button"
                      className={`db-ft-chk${outPitchmap ? " on" : ""}`}
                      style={outPitchmap ? { "--db-accent": accent, borderColor: accent } : undefined}
                      onClick={() => setOutPitchmap((v) => (outBowling ? !v : true))}
                    >
                      <span
                        className="db-ft-box"
                        style={outPitchmap ? { background: accent, borderColor: accent } : undefined}
                      >
                        {outPitchmap ? "✓" : ""}
                      </span>
                      Pitch Map
                    </button>
                  </div>
                  {/* 5 · Playback — pause/resume mid-flight, or play straight through. */}
                  <div className="db-step" style={{ marginTop: 12 }}>
                    <span className="db-step-n">5</span>
                    <span className="db-step-t">Playback</span>
                  </div>
                  <div className="db-seg" style={{ marginTop: 6 }}>
                    <button
                      className={`db-segbtn${pausableSel ? " on" : ""}`}
                      style={pausableSel ? { background: accent } : undefined}
                      onClick={() => setPausableSel(true)}
                    >
                      Pause / Resume
                    </button>
                    <button
                      className={`db-segbtn${!pausableSel ? " on" : ""}`}
                      style={!pausableSel ? { background: accent } : undefined}
                      onClick={() => setPausableSel(false)}
                    >
                      Play Straight
                    </button>
                  </div>

                  {/* Camera view toggle removed — the bowling analysis now uses a single
                      fixed Broadcast ¾ camera. */}
                </>
              )}

              {/* Bowling analysis: which camera machine to fetch trajectories from
                  (server mode only; local has a single dataset). Shown even with
                  one machine so it's visible; add more in Server settings. */}
              {mode === "bowling" && !isLocal() && serverList.length >= 1 && (
                <>
                  <div className="db-step">
                    <span className="db-step-n">S</span>
                    <span className="db-step-t">Fetch from server</span>
                  </div>
                  <div className="db-seg">
                    {serverList.map((s, i) => (
                      <button
                        key={s.id}
                        className={`db-segbtn${bowlingServerId === s.id ? " on" : ""}`}
                        style={bowlingServerId === s.id ? { background: accent } : undefined}
                        onClick={() => setBowlingServerId(s.id)}
                        title={`${s.ip}:${s.port}`}
                      >
                        Machine {i + 1}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {mode === "drs" && (
                <>
                  <div className="db-step">
                    <span className="db-step-n">2</span>
                    <span className="db-step-t">On-field decision</span>
                  </div>
                  <div className="db-dec-grid">
                    <div className="db-dec-cell">
                      <span className="db-dec-l">Original Decision</span>
                      <Seg2 a={["NOT_OUT", "Not Out"]} b={["OUT", "Out"]} value={drsDecision} onChange={setDrsDecision} accent={accent} />
                    </div>
                    <div className="db-dec-cell">
                      <span className="db-dec-l">Batsman</span>
                      <Seg2 a={[false, "Left"]} b={[true, "Right"]} value={drsRightHanded} onChange={setDrsRightHanded} accent={accent} />
                    </div>
                    <div className="db-dec-cell">
                      <span className="db-dec-l">Shot Offer</span>
                      <Seg2 a={[false, "No"]} b={[true, "Yes"]} value={drsSoftSignal} onChange={setDrsSoftSignal} accent={accent} />
                    </div>
                    <div className="db-dec-cell">
                      <span className="db-dec-l">Video overlay</span>
                      <Seg2 a={[false, "Off"]} b={[true, "On"]} value={drsWithVideo} onChange={setDrsWithVideo} accent={accent} />
                    </div>
                  </div>

                  {/* Review animation: Manual = operator drives the keys (as now);
                      Auto = after the review the camera glides on its own to key 4
                      (Default) or key 1 side (Hand — mirrored by the batter's hand). */}
                  <div className="db-step" style={{ marginTop: 14 }}>
                    <span className="db-step-n">3</span>
                    <span className="db-step-t">Animation</span>
                    <div className="db-step-seg">
                      <Seg2 a={["manual", "Manual"]} b={["auto", "Auto"]} value={drsAnimMode} onChange={setDrsAnimMode} accent={accent} />
                    </div>
                  </div>
                  {drsAnimMode === "auto" && (
                    <div className="db-dec-cell" style={{ marginTop: 8 }}>
                      <span className="db-dec-l">Auto view</span>
                      <Seg2 a={["default", "Default · K4"]} b={["hand", "Hand · K1"]} value={drsAutoTarget} onChange={setDrsAutoTarget} accent={accent} />
                    </div>
                  )}

                  {/* Overlay panels — operator chooses which review panels to show,
                      for EVERY ball (not just full tosses). Full toss additionally
                      exposes the Final Decision (Out/Not Out) since it has none. */}
                  <>
                    <div className="db-step">
                      <span className="db-step-n">4</span>
                      <span className="db-step-t">
                        LBW Bugs{isFullToss ? " · full toss" : ""}
                      </span>
                      {/* Select all: on → every SELECTABLE panel checked; off → clear.
                          Outside-leg panels (Wickets/Impact) are excluded from "All". */}
                      {(() => {
                        const selectable = ALL_PANELS.filter(
                          (p) => !(isOutsideLeg && OUTSIDE_LEG_HIDDEN.includes(p)),
                        );
                        const allOn = selectable.every((p) => ftPanels.includes(p));
                        return (
                          <button
                            type="button"
                            className={`db-ft-chk db-ft-all${allOn ? " on" : ""}`}
                            style={allOn ? { "--db-accent": accent, borderColor: accent } : undefined}
                            onClick={() =>
                              setFtPanels(allOn ? [] : [...selectable])
                            }
                          >
                            <span className="db-ft-box">{allOn ? "✓" : ""}</span>
                            All
                          </button>
                        );
                      })()}
                    </div>
                    <div className="db-ft-panels">
                      {ALL_PANELS.map((p, i) => {
                        // Outside leg → Wickets & Impact don't apply: force unchecked,
                        // disabled, and greyed so it's clear they won't be shown.
                        const disabled =
                          isOutsideLeg && OUTSIDE_LEG_HIDDEN.includes(p);
                        const on = !disabled && ftPanels.includes(p);
                        // 6-col grid: first 3 (the LBW bugs) span 2 → thirds; the
                        // remaining panels span 3 → halves, stretching the bottom row.
                        const span = i < 3 ? 2 : 3;
                        return (
                          <button
                            key={p}
                            type="button"
                            disabled={disabled}
                            title={
                              disabled ? "Not applicable — pitched outside leg" : undefined
                            }
                            className={`db-ft-chk${on ? " on" : ""}`}
                            style={{
                              gridColumn: `span ${span}`,
                              ...(on
                                ? { "--db-accent": accent, borderColor: accent }
                                : {}),
                              ...(disabled
                                ? { opacity: 0.4, cursor: "not-allowed" }
                                : {}),
                            }}
                            onClick={
                              disabled
                                ? undefined
                                : () =>
                                    setFtPanels((cur) =>
                                      cur.includes(p)
                                        ? cur.filter((x) => x !== p)
                                        : [...cur, p],
                                    )
                            }
                          >
                            <span className="db-ft-box">{on ? "✓" : ""}</span>
                            {PANEL_LABELS[p]}
                          </button>
                        );
                      })}
                    </div>
                  </>
                </>
              )}

              {mode === "noball" && (
                <>
                  <div className="db-step">
                    <span className="db-step-n">2</span>
                    <span className="db-step-t">Height check — batsman</span>
                  </div>
                  <div className="db-decision">
                    <div className="db-drow db-drow-dec">
                      <span className="db-drow-l">Batsman</span>
                      <input
                        className="db-nb-input"
                        type="text"
                        value={nbBatsman}
                        onChange={(e) => setNbBatsman(e.target.value)}
                        placeholder="Name"
                        style={{ "--db-accent": accent }}
                      />
                    </div>
                    <div className="db-drow db-drow-dec">
                      <span className="db-drow-l">Waist height (m)</span>
                      <input
                        className="db-nb-input db-nb-num"
                        type="number" step="0.01" min="0" max="2.5"
                        value={nbWaist}
                        onChange={(e) => setNbWaist(e.target.value)}
                        placeholder="1.00"
                        style={{ "--db-accent": accent }}
                      />
                    </div>
                    <div className="db-drow db-drow-dec">
                      <span className="db-drow-l">Shoulder height (m)</span>
                      <input
                        className="db-nb-input db-nb-num"
                        type="number" step="0.01" min="0" max="2.5"
                        value={nbShoulder}
                        onChange={(e) => setNbShoulder(e.target.value)}
                        placeholder="1.45"
                        style={{ "--db-accent": accent }}
                      />
                    </div>
                    <div className="db-drow db-drow-dec">
                      <span className="db-drow-l">Head height (m)</span>
                      <input
                        className="db-nb-input db-nb-num"
                        type="number" step="0.01" min="0" max="2.5"
                        value={nbHead}
                        onChange={(e) => setNbHead(e.target.value)}
                        placeholder="1.75"
                        style={{ "--db-accent": accent }}
                      />
                    </div>
                  </div>
                  <p className="db-nb-hint">
                    Ball height at the crease comes from the trajectory. ICC: a
                    full-toss above the waist is a no-ball.
                  </p>
                </>
              )}
            </div>

          </div>

          {/* ---- sticky action bar (always visible) ---- */}
          <div className="db-rail-actions">
            <button
              className="db-send"
              style={{ background: accent, boxShadow: `0 8px 24px ${accent}55` }}
              onClick={() => startPreview()}
            >
              ▶ Start — preview here
            </button>
            <button
              className="db-send-2"
              onClick={sendToBigScreen}
              disabled={!broadcasting}
              title={
                broadcasting
                  ? "Cue this on the big screen"
                  : "Start Broadcast first (top-right)"
              }
            >
              Send to Broadcast
            </button>
            <p className="db-actions-hint">
              {broadcasting
                ? "Start plays the preview here · Send cues the big screen · Play (top) takes it live."
                : "Start plays the preview here · press Start Broadcast (top) to enable Send."}
            </p>
          </div>
        </aside>
      </div>

      <ConsolePanel
        open={consoleOpen}
        initialTab={consoleTab}
        onClose={() => setConsoleOpen(false)}
      />
    </div>
  );
}

/* ---------------- presentational helpers ---------------- */
function Tiles({ items, value, onPick, accent, sub }) {
  return (
    <div className="db-tiles">
      {items.map((n) => {
        const tag = sub ? sub(n) : null;
        return (
          <button
            key={n}
            className={`db-tile${tag != null ? " db-tile-sub" : ""}${String(value) === String(n) ? " on" : ""}`}
            style={String(value) === String(n) ? { background: accent } : undefined}
            onClick={() => onPick(n)}
          >
            <span className="db-tile-n">{n}</span>
            {tag != null && <span className="db-tile-tag">{tag}</span>}
          </button>
        );
      })}
    </div>
  );
}
function DeliveryRow({ label, items, value, onPick, accent, sub }) {
  return (
    <div className="db-drow db-drow-top">
      <span className="db-drow-l">{label}</span>
      <Tiles items={items} value={value} onPick={onPick} accent={accent} sub={sub} />
    </div>
  );
}
function BallMulti({ items, selected, onToggle, onToggleAll, accent, sub }) {
  const allOn = items.length > 0 && items.every((b) => selected.includes(b));
  return (
    <div className="db-drow db-drow-multi">
      <span className="db-drow-l">Balls</span>
      <div className="db-balls">
        <button
          type="button"
          className={`db-tile db-tile-all${allOn ? " on" : ""}`}
          style={allOn ? { background: accent } : undefined}
          onClick={onToggleAll}
        >
          {allOn ? "✓ All" : "All"}
        </button>
        {items.map((b) => {
          const on = selected.includes(b);
          const tag = sub ? sub(b) : null;
          return (
            <button
              key={b}
              type="button"
              className={`db-tile${tag != null ? " db-tile-sub" : ""}${on ? " on" : ""}`}
              style={on ? { background: accent } : undefined}
              onClick={() => onToggle(b)}
            >
              <span className="db-tile-n">{b}</span>
              {tag != null && <span className="db-tile-tag">{tag}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Seg2({ a, b, value, onChange, accent }) {
  const btn = ([val, label]) => (
    <button
      className={`db-segbtn${value === val ? " on" : ""}`}
      style={value === val ? { background: accent } : undefined}
      onClick={() => onChange(val)}
    >
      {label}
    </button>
  );
  return (
    <div className="db-seg">
      {btn(a)}
      {btn(b)}
    </div>
  );
}

/* ---------------- scoped styling ---------------- */
const DB_STYLE = `
.db-root{position:fixed;inset:0;display:flex;flex-direction:column;background:#070B14;color:#E9EEF9;
  --font-body:"Barlow",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-head:"Barlow Condensed","Barlow",ui-sans-serif,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
  font-family:var(--font-body);overflow:hidden}
.db-mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums;letter-spacing:.02em}
/* Broadcast-style condensed headings: section titles, logo, big decision text. */
.db-brand-title,.db-brand-sub,.db-logo,.db-panel-title,
.db-drow-dec .db-segbtn{font-family:var(--font-head);letter-spacing:.03em;padding:6px 10px;font-size:12px}

/* ---- header ---- */
.db-header{display:flex;align-items:center;gap:24px;padding:11px 18px;background:linear-gradient(180deg,#0E1626,#0A111E);
  border-bottom:1px solid rgba(255,255,255,.08);flex:none}
.db-brand{display:flex;align-items:center;gap:12px;flex:none}
.db-logo{width:38px;height:38px;border-radius:9px;display:grid;place-items:center;font-weight:900;color:#04121f;
  background:linear-gradient(140deg,#38BDF8,#6366F1)}
.db-brand-title{font-size:15px;font-weight:800}
.db-brand-sub{font-size:10px;letter-spacing:.24em;color:#5A6884;text-transform:uppercase;font-weight:700}
.db-ctx{display:flex;gap:24px;flex:1;min-width:0}
.db-ctx-grp{display:flex;flex-direction:column;gap:2px}
.db-k{font-size:10px;letter-spacing:.2em;color:#5A6884;text-transform:uppercase;font-weight:700}
.db-v{font-size:15px;font-weight:600;white-space:nowrap}
.db-session{display:flex;align-items:center;gap:8px;flex:none}
.db-hicon{height:38px;padding:0 13px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#93A0B8;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
.db-hicon-t{font-size:13px;font-weight:600;letter-spacing:.01em}
.db-hicon:hover{background:#1B2740;color:#E9EEF9}
.db-target{display:flex;align-items:center;gap:8px;padding-left:6px}
.db-target-k{font-size:9px;letter-spacing:.18em;color:#5A6884;text-transform:uppercase;font-weight:800}
.db-target-seg{display:flex;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:3px}
.db-target-seg button{border:0;background:transparent;color:#93A0B8;font-family:inherit;font-weight:700;font-size:12px;padding:7px 12px;border-radius:6px;cursor:pointer}
.db-target-seg button.on{background:#38BDF8;color:#04121f}
.db-target-seg button.on-bc{background:#EF4444;color:#fff}
.db-start{display:flex;align-items:center;gap:9px;height:40px;padding:0 18px;border-radius:10px;font-weight:800;font-size:12px;
  letter-spacing:.1em;cursor:pointer;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#B8C2D6}
.db-start-led{width:9px;height:9px;border-radius:50%;background:#5A6884}
.db-start-wrap{display:flex;flex-direction:column;align-items:stretch;gap:4px}
/* Plain status TEXT under the button (not a pill): drop the box, keep the LED + text colour.
   Extra-specific so it beats the .db-status-* pill backgrounds defined later. */
.db-start-wrap .db-start-status{justify-content:center;font-size:10px;padding:0;background:transparent;border-color:transparent}
.db-start.on{background:rgba(255,59,78,.14);border-color:rgba(255,59,78,.5);color:#FF98A4}
.db-start.on .db-start-led{background:#FF3B4E;box-shadow:0 0 10px #FF3B4E;animation:dbpulse 1.1s ease-in-out infinite}
.db-pip{height:40px;padding:0 14px;border-radius:10px;font-weight:800;font-size:12px;letter-spacing:.08em;
  cursor:pointer;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#B8C2D6;margin-right:8px}
.db-pip.on{background:rgba(56,189,248,.14);border-color:rgba(56,189,248,.5);color:#8fd3ff}
.db-htransport{display:flex;gap:6px}
.db-hbtn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 15px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#E9EEF9;font-family:inherit;font-weight:800;font-size:12.5px;cursor:pointer}
.db-hbtn:hover{background:#1B2740}
.db-hbtn-play{background:#25D07A;color:#04120A;border:0}
.db-tp-hint{font-size:11px;color:#5A6884}
@keyframes dbpulse{50%{opacity:.35}}

/* ---- main / stage ---- */
.db-main{flex:1;display:flex;min-height:0}
.db-stage-wrap{flex:1;display:flex;flex-direction:column;min-width:0;padding:14px 14px 14px 18px}
.db-stage-head{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.db-status{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.04em;padding:5px 11px;border-radius:8px;border:1px solid transparent}
.db-status-led{width:8px;height:8px;border-radius:50%}
.db-status-off{background:rgba(120,132,158,.12);border-color:rgba(120,132,158,.35);color:#AEB7CC}
.db-status-off .db-status-led{background:#5A6884}
.db-status-idle{background:rgba(37,208,122,.1);border-color:rgba(37,208,122,.4);color:#8CF0BF}
.db-status-idle .db-status-led{background:#25D07A}
.db-status-cued{background:rgba(246,168,33,.12);border-color:rgba(246,168,33,.45);color:#F7C56B}
.db-status-cued .db-status-led{background:#F6A821}
.db-status-air{background:rgba(255,59,78,.12);border-color:rgba(255,59,78,.5);color:#FF98A4}
.db-status-air .db-status-led{background:#FF3B4E;box-shadow:0 0 10px #FF3B4E;animation:dbpulse 1.1s ease-in-out infinite}
.db-cam-tag{margin-left:auto;font-size:11px;color:#93A0B8;background:#141C2E;border:1px solid rgba(255,255,255,.12);padding:5px 12px;border-radius:8px}
.db-mode-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.db-mode-chip{height:28px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#AEB7CC;font-family:inherit;font-weight:700;font-size:11.5px;letter-spacing:.02em;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease}
.db-mode-chip:hover{border-color:rgba(255,255,255,.3);color:#E9EEF9}
.db-mode-chip.on{color:#0A1424;font-weight:800}
.db-stage{position:relative;flex:1;border-radius:14px;overflow:hidden;background:#0A0F1A;border:1px solid rgba(255,255,255,.1);min-height:0;transform:translateZ(0);isolation:isolate}
.db-stage canvas{display:block}
.db-decisions{position:absolute;top:16px;left:16px;display:flex;flex-direction:column;gap:9px;width:206px;z-index:5}
.db-dec-cap{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#7C8AA5;font-weight:800;
  background:rgba(6,12,24,.82);border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:6px 10px;width:max-content}
.db-dec{background:rgba(6,12,24,.72);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:11px 13px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.db-dec-l{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7C8AA5;font-weight:700}
.db-dec-v{font-size:17px;font-weight:800;margin-top:4px}
.db-dec-v.is-out{color:#FF3B4E}
.db-dec-v.is-in{color:#25D07A}
.db-final{background:rgba(37,208,122,.1);border:1px solid rgba(37,208,122,.4);border-radius:11px;padding:11px 13px;text-align:center}
.db-final-cap{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#7C8AA5;font-weight:700}
.db-final-val{font-size:22px;font-weight:900;color:#25D07A;line-height:1}
.db-final-sub{font-size:10px;color:#8CF0BF;letter-spacing:.1em;text-transform:uppercase;margin-top:2px}
.db-stage-foot{position:absolute;left:16px;bottom:14px;font-family:var(--font-mono);font-size:11px;color:#93A0B8;
  background:rgba(6,12,24,.6);border:1px solid rgba(255,255,255,.1);padding:4px 10px;border-radius:7px}

/* ---- preview transport ---- */
.db-transport{margin-top:12px;flex:none}
.db-scrub{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.db-scrub-fill{height:100%;background:linear-gradient(90deg,#38BDF8,#7dd3fc);box-shadow:0 0 12px rgba(56,189,248,.6)}
.db-transport-row{display:flex;align-items:center;gap:14px;margin-top:10px}
.db-tp-label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#5A6884;font-weight:800}
.db-tp-btns{display:flex;align-items:center;gap:8px}
.db-tp{width:40px;height:40px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:#141C2E;color:#E9EEF9;cursor:pointer;font-size:14px}
.db-tp-play{background:#38BDF8;color:#04121f;border:0}
.db-tp-time{margin-left:auto;font-size:13px;color:#93A0B8}

/* ---- right rail ---- */
.db-rail{width:430px;flex:none;display:flex;flex-direction:column;min-height:0;
  background:linear-gradient(180deg,#0B1220,#080D18);border-left:1px solid rgba(255,255,255,.08)}
.db-rail-scroll{flex:1;overflow-y:auto;padding:16px 20px 10px 16px;display:flex;flex-direction:column;gap:16px}
.db-rail-actions{flex:none;padding:14px 18px;border-top:1px solid rgba(255,255,255,.1);background:rgba(6,10,20,.9);display:flex;flex-direction:column;gap:8px}
.db-panel{position:relative;background:#0E1626;border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:16px}
.db-divider{height:1px;background:rgba(255,255,255,.08);margin:16px 0}
.db-reload-inline{margin-left:auto}
.db-reload-icon{padding:0 8px}
.db-step-seg{margin-left:auto;width:184px;flex:none}
.db-panel-head{display:flex;align-items:baseline;justify-content:space-between}
.db-panel-title{font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:800;color:#B8C2D6}
.db-panel-hint{font-size:11px;color:#5A6884}
.db-reload{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:7px;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#93A0B8;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer}
.db-reload:hover{background:#1B2740;color:#E9EEF9}
.db-feeds{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.db-feed{position:relative;text-align:center;padding:11px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#111A2B;color:#E9EEF9;cursor:pointer}
.db-feed.on{border-color:var(--db-accent);box-shadow:0 0 0 1px var(--db-accent);color:var(--db-accent)}
.db-feed-name{display:block;font-size:12px;font-weight:700;line-height:1.15}
.db-step{display:flex;align-items:center;gap:9px;margin:14px 0 8px}
.db-step:first-of-type{margin-top:4px}
.db-step-n{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:800;color:#38BDF8;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.3)}
.db-step-t{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:#93A0B8}
.db-seg{display:flex;gap:2px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:4px}
.db-seg-3 .db-segbtn{flex:1}
.db-segbtn{flex:1;border:0;background:transparent;color:#93A0B8;font-family:inherit;font-weight:700;font-size:12.5px;padding:6px 9px;border-radius:7px;cursor:pointer}
.db-segbtn.on{color:#04121f}
.db-delivery{display:flex;flex-direction:column;gap:9px;margin-top:4px}
.db-balls{display:flex;flex-wrap:wrap;gap:6px}
.db-drow-multi{align-items:flex-start}
.db-drow-multi .db-drow-l{margin-top:11px}
.db-tile-all{min-width:auto;padding:0 14px;font-family:inherit;font-size:12.5px}
.db-drow{display:flex;align-items:center;gap:12px}
/* Delivery rows wrap into lines (no horizontal scroll); label sits at the top. */
.db-drow-top{align-items:flex-start}
.db-drow-top .db-drow-l{padding-top:11px}
.db-drow-l{width:52px;flex:none;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#6B7791;font-weight:800}
.db-drow-dec .db-drow-l{width:92px;line-height:1.25}
/* Tiles wrap onto the next line instead of scrolling horizontally. */
.db-tiles{display:flex;flex-wrap:wrap;gap:6px}
.db-tile{min-width:36px;height:32px;padding:0 9px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#111A2B;color:#E9EEF9;
  font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;cursor:pointer;display:grid;place-items:center;flex:none}
.db-tile:hover{background:#182338}
.db-tile.on{color:#04121f;border-color:transparent}
/* Ball tiles that show an outcome tag under the number (DRS / No-Ball). */
.db-tile-sub{height:40px;flex-direction:column;gap:1px;line-height:1}
.db-tile-sub .db-tile-n{font-size:14px}
.db-tile-sub .db-tile-tag{font-size:9px;font-weight:800;letter-spacing:.02em;opacity:.7}
.db-tile-sub.on .db-tile-tag{opacity:.85}
.db-decision{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.db-dec-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:4px}
.db-dec-cell{display:flex;flex-direction:column;gap:5px;min-width:0}
.db-dec-l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6B7791;font-weight:800}
.db-decision .db-seg{flex:1}
.db-ft-panels{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:6px}
.db-hide-row{display:flex;gap:8px;margin-top:14px}
@keyframes dbbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}
.db-oc-dot.beat{animation:dbbeat .65s ease-in-out infinite}
.db-ft-chk{display:flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #24354d;border-radius:8px;background:#0d1b2e;color:#cdd8e6;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;text-align:left}
.db-ft-chk.on{background:#12263d;color:#fff}
.db-ft-box{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid #35507a;border-radius:4px;font-size:11px;line-height:1;flex:none}
.db-ft-chk.on .db-ft-box{background:var(--db-accent,#38BDF8);border-color:var(--db-accent,#38BDF8);color:#04121f}
.db-ft-all{margin-left:auto;padding:4px 9px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.db-nb-input{flex:1;min-width:0;height:34px;padding:0 11px;border:1px solid #24354d;border-radius:8px;background:#0d1b2e;color:#E9EEF9;font-family:inherit;font-size:13px;font-weight:700;outline:none}
.db-nb-input:focus{border-color:var(--db-accent,#38BDF8)}
.db-nb-input::placeholder{color:#5A6884;font-weight:600}
.db-nb-num{text-align:right;font-variant-numeric:tabular-nums}
.db-nb-hint{margin-top:9px;font-size:11px;line-height:1.5;color:#6B7791}
.db-segbtn{white-space:nowrap}
.db-send{width:100%;padding:14px;border:0;border-radius:11px;color:#04121f;font-family:inherit;font-weight:900;font-size:14px;letter-spacing:.03em;cursor:pointer}
.db-send-2{width:100%;padding:12px;border-radius:11px;border:1px solid #EF4444;background:#EF4444;color:#fff;font-family:inherit;font-weight:800;font-size:13.5px;cursor:pointer}
.db-send-2:hover:not(:disabled){background:#DC2626;border-color:#DC2626}
.db-send-2:disabled{opacity:.45;cursor:not-allowed}
.db-actions-row{display:flex;gap:8px}
.db-act{flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#141C2E;color:#E9EEF9;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer}
.db-act:hover{background:#1B2740}
.db-act-play{background:#25D07A;color:#04120A;border:0}
.db-actions-hint{font-size:11px;color:#6B7791;margin:2px 0 0;line-height:1.4}
.db-actions-hint b{color:#B8C2D6}
.db-info-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.db-info-k{font-size:12px;color:#93A0B8}
.db-info-v{font-size:13px;font-weight:700}
`;
