// Top-right operator controls for the big screen:
//  - "Broadcast" opens the big-screen window (?broadcast=1).
//  - "Send to Big Screen" pushes whatever the operator is currently previewing.
// Press R (see DrsKeyBindings) to send the big screen back to the idle scene.
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  sendShow,
  sendPlay,
  sendClose,
  sendPing,
  getChannel,
} from "../broadcastChannel";
import { setCameraTarget, setBroadcasting } from "../store/slices/broadcastSlice";
import ShortcutsHelp from "./ShortcutsHelp";
import ServerCheck from "./ServerCheck";

export default function BroadcastControls() {
  const dispatch = useDispatch();
  const currentShow = useSelector((s) => s.broadcast.currentShow);
  const cameraTarget = useSelector((s) => s.broadcast.cameraTarget);
  // Persisted in Redux/localStorage so it survives an operator-tab reload.
  const broadcasting = useSelector((s) => s.broadcast.broadcasting);
  const dsMatch = useSelector((s) => s.dataSource.match);
  const winRef = useRef(null);
  // Cached external (HDMI) screen rect, fetched ahead of time so the window can
  // open ON it synchronously (preserving the click gesture for fullscreen).
  const externalScreenRef = useRef(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  // True after Push to Display until Play — prompts the operator to press Play.
  const [cued, setCued] = useState(false);
  // Live playback telemetry from the big screen (video shows only), used by the
  // broadcast monitor strip below the toolbar to show what's actually on air.
  const [monitor, setMonitor] = useState(null);

  // Listen for the progress messages the big screen posts (see DrsVideoLayer).
  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;
    const onMsg = (e) => {
      if (e.data?.type === "progress") {
        const { currentTime, duration, playing, ended } = e.data;
        setMonitor({ currentTime, duration, playing, ended });
      }
    };
    ch.addEventListener("message", onMsg);
    return () => ch.removeEventListener("message", onMsg);
  }, []);

  // Clear the playback state whenever a new show is set up / cued.
  useEffect(() => {
    setMonitor(null);
  }, [currentShow]);

  // Pre-fetch the external screen (permission is already granted) and keep it
  // current. Lets openBigScreen position the window without an await on click.
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

  // On load, ask whether a big screen is already open (e.g. after an operator
  // refresh — the window survives). If one answers, restore "broadcasting" so
  // Push/Play/camera/Stop all work again. No periodic polling.
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

  // Auto-detect when the big-screen window we opened THIS session is closed.
  // Only flips off when a real handle exists and is now closed — never when the
  // handle is null (e.g. after an operator reload, where the window may still
  // be open but we no longer hold a handle to it).
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

  const stopBroadcast = () => {
    // Close via the handle if we have one; otherwise ask the big screen to
    // close itself (handle lost after a reload).
    if (winRef.current && !winRef.current.closed) winRef.current.close();
    else sendClose();
    winRef.current = null;
    dispatch(setBroadcasting(false));
  };

  const openBigScreen = () => {
    const url = `${window.location.pathname}?broadcast=1`;
    // Open SYNCHRONOUSLY on the click so the user gesture carries into the new
    // window (needed for fullscreen). If we know the external (HDMI) screen,
    // bake its position/size into the features so it opens THERE and fullscreens
    // on that screen.
    let features = "popup=yes";
    const ext = externalScreenRef.current;
    if (ext) {
      features =
        `popup=yes,left=${ext.availLeft},top=${ext.availTop},` +
        `width=${ext.availWidth},height=${ext.availHeight}`;
    }
    const win = window.open(url, "drs-broadcast-window", features);
    if (!win) return;
    winRef.current = win;
    dispatch(setBroadcasting(true));
  };

  // Push to Display CUES the show on the big screen (it waits on idle). The
  // operator then presses Play to take it live.
  const send = () => {
    if (currentShow) {
      sendShow(currentShow);
      setCued(true);
    }
  };

  const play = () => {
    sendPlay();
    setCued(false);
  };

  return (
    <>
    <div className="absolute top-4 right-4 z-[9999999] flex items-center gap-2 rounded-xl bg-[#0B1220]/80 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur">
      <button
        type="button"
        onClick={() => setServerOpen(true)}
        title="Check data server"
        aria-label="Check data server"
        className="grid place-items-center w-9 h-9 rounded-lg bg-white/5 text-slate-200 ring-1 ring-white/15 hover:bg-white/10 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        className="grid place-items-center w-9 h-9 rounded-lg bg-white/5 text-slate-200 ring-1 ring-white/15 hover:bg-white/10 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </svg>
      </button>
      <button
        type="button"
        onClick={broadcasting ? stopBroadcast : openBigScreen}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold tracking-wide transition-colors ${
          broadcasting
            ? "bg-rose-600/15 text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-600/25"
            : "bg-white/5 text-slate-100 ring-1 ring-white/15 hover:bg-white/10"
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            broadcasting ? "animate-pulse bg-rose-400" : "bg-slate-500"
          }`}
        />
        {broadcasting ? "Stop Broadcasting" : "Start Broadcast"}
      </button>
      {broadcasting && (
        <button
          type="button"
          onClick={send}
          disabled={!currentShow}
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {cued ? "Cued ✓ — re-push" : "Push to Display"}
        </button>
      )}
      {broadcasting && (
        <button
          type="button"
          onClick={play}
          title="Play the big screen (Space)"
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold tracking-wide text-white shadow-sm transition-colors ${
            cued
              ? "bg-emerald-500 ring-2 ring-emerald-300 animate-pulse hover:bg-emerald-400"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Play
        </button>
      )}

      {/* Camera-angle target: number keys control whichever screen is selected. */}
      <div
        className="ml-1 flex items-center gap-1 rounded-lg bg-black/30 p-1 ring-1 ring-white/10"
        title="Which screen the number keys (1–5) control"
      >
        <TargetTab
          active={cameraTarget !== "broadcast"}
          onClick={() => dispatch(setCameraTarget("operator"))}
        >
          Preview
        </TargetTab>
        <TargetTab
          active={cameraTarget === "broadcast"}
          activeClass="bg-red-600 text-white"
          onClick={() => dispatch(setCameraTarget("broadcast"))}
        >
          Broadcast
        </TargetTab>
      </div>
    </div>
    <BroadcastMonitor
      broadcasting={broadcasting}
      cued={cued}
      currentShow={currentShow}
      monitor={monitor}
      match={dsMatch}
    />
    <ShortcutsHelp
      open={shortcutsOpen}
      onClose={() => setShortcutsOpen(false)}
    />
    <ServerCheck open={serverOpen} onClose={() => setServerOpen(false)} />
    </>
  );
}

// A segmented tab for the camera-angle target (Operator / Broadcast).
function TargetTab({ active, onClick, children, activeClass = "bg-sky-600 text-white" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? activeClass
          : "text-white/55 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// Derive display details for the monitor from the current show command.
function describeShow(cmd) {
  if (!cmd || !cmd.kind || cmd.kind === "idle") return null;
  if (cmd.kind === "drs") {
    const m = /in-(\d+)\/(\d+)\/(\d+)/.exec(cmd.folderUrl || "");
    const camIx = cmd.camera != null ? Number(cmd.camera) : 0;
    return {
      mode: cmd.noBall ? "No-Ball Check" : "DRS Review",
      accent: cmd.noBall ? "#F43F5E" : "#38BDF8",
      innings: m ? m[1] : null,
      over: m ? m[2] : null,
      ball: m ? m[3] : null,
      cam: String(camIx + 1),
      file: `${camIx}.mp4`,
      hasVideo: true,
    };
  }
  if (cmd.kind === "over") {
    return {
      mode: "Trajectories",
      accent: "#22C55E",
      over: cmd.overNo != null ? String(cmd.overNo) : null,
      balls: cmd.urls?.length ?? 0,
      note: cmd.playMode === "simultaneous" ? "combined" : "sequential",
      hasVideo: false,
    };
  }
  if (cmd.kind === "single") {
    return { mode: "Single Delivery", accent: "#A78BFA", hasVideo: false };
  }
  if (cmd.kind === "pitch") {
    return {
      mode: "Pitch Map",
      accent: "#F59E0B",
      note: `${cmd.urls?.length ?? 0} deliveries`,
      hasVideo: false,
    };
  }
  return null;
}

// A tiny labelled read-out chip (e.g. "IN 1", "OV 16", "CAM 1").
function MonStat({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded bg-white/[0.05] ring-1 ring-white/10">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </span>
      <span className="font-mono text-[12px] text-white tabular-nums">
        {value}
      </span>
    </span>
  );
}

const mmss = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

// The "Big Screen" monitor strip below the toolbar: shows what is on the big
// screen (mode / delivery / camera + file), a live progress track for video
// shows (DRS / No-Ball), and the on-air state. Read-only — it only reflects
// real state (currentShow + telemetry the big screen posts). Hidden until a
// big screen is open.
function BroadcastMonitor({ broadcasting, cued, currentShow, monitor, match }) {
  if (!broadcasting) return null;
  const info = describeShow(currentShow);

  let state = "IDLE";
  let color = "#64748B";
  if (monitor?.ended) {
    state = "FINISHED";
    color = "#22C55E";
  } else if (monitor?.playing) {
    state = "ON AIR";
    color = "#FF3B4E";
  } else if (cued) {
    state = "CUED";
    color = "#F5A623";
  } else if (info) {
    state = "READY";
    color = "#22C55E";
  }

  const accent = info?.accent || "#38BDF8";
  const showBar = info?.hasVideo && monitor && monitor.duration > 0;
  const pct = showBar
    ? Math.min(100, (monitor.currentTime / monitor.duration) * 100)
    : 0;
  const playLabel = monitor?.ended
    ? "✓ Finished"
    : monitor?.playing
      ? "▶ Playing"
      : cued
        ? "⏸ Cued — press Play"
        : "Ready";

  return (
    <div className="absolute top-4 left-4 z-[9999998] max-w-[58vw] flex items-stretch gap-3 rounded-xl bg-[#0B1220]/90 px-3.5 py-2.5 ring-1 ring-white/10 backdrop-blur shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      {/* state column */}
      <div className="flex flex-col gap-1 justify-center pr-3 border-r border-white/10">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
          Big Screen
        </span>
        <span
          className="inline-flex items-center gap-2 self-start px-2 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-[0.1em]"
          style={{ color, background: `${color}22`, border: `1px solid ${color}59` }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          {state}
        </span>
      </div>

      {/* details column */}
      <div className="flex flex-col gap-1.5 justify-center min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm" style={{ color: accent }}>
            {info?.mode || "Idle"}
          </span>
          {match ? (
            <span className="text-[12px] text-white/70 font-semibold truncate max-w-[220px]">
              {match}
            </span>
          ) : null}
        </div>
        {info && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <MonStat label="In" value={info.innings} />
            <MonStat label="Ov" value={info.over} />
            <MonStat label="Bl" value={info.ball} />
            <MonStat label="Cam" value={info.cam} />
            {info.balls != null && <MonStat label="Balls" value={info.balls} />}
            {info.file && (
              <span className="font-mono text-[10.5px] text-white/40 px-1.5 py-0.5 rounded bg-white/[0.03] ring-1 ring-white/[0.08]">
                {info.file}
              </span>
            )}
            {info.note && (
              <span className="text-[11px] text-white/45">{info.note}</span>
            )}
          </div>
        )}
        {info?.hasVideo && (
          <div className="flex items-center gap-3 pt-0.5">
            <span className="text-[11px] font-semibold text-white/70 min-w-[118px]">
              {playLabel}
            </span>
            <div className="h-1.5 w-[220px] rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${pct}%`, background: accent, boxShadow: `0 0 10px ${accent}` }}
              />
            </div>
            {showBar && (
              <span className="font-mono text-[11px] text-white/60 tabular-nums">
                {mmss(monitor.currentTime)} / {mmss(monitor.duration)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
