// Data-source wizard: choose sample vs live data, configure the camera machines
// and the score server, and pick a match. Config lives in Redux (dataSourceSlice)
// so the whole project uses it. Layout follows the numbered-step design.
import { useState, useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import {
  setSource,
  setServer,
  setApi,
  setSocket,
  setSelection,
  addServer,
  updateServer,
  removeServer,
} from "../store/slices/dataSourceSlice";
import { getServerBase, parseDirectories, cacheBust } from "../dataSource";

// The BODY (no modal shell) — embedded in the Console panel's "Connection" tab.
export function ServerCheckBody() {
  const dispatch = useDispatch();
  const ds = useSelector((s) => s.dataSource);
  const isServer = ds.source === "server";

  // Match list (folders found at the server root).
  const [matches, setMatches] = useState([]);
  const [matchesState, setMatchesState] = useState("idle"); // idle|loading|error

  // Connection-test status for the primary server.
  const [status, setStatus] = useState("idle"); // idle|loading|ok|error
  const [statusMsg, setStatusMsg] = useState(null);

  // Footer: persist these settings across refreshes.
  const [remember, setRemember] = useState(true);

  // Score server: "runs on the primary camera machine" mirrors the primary IP.
  const [apiOnPrimary, setApiOnPrimary] = useState(
    !ds.apiIp || ds.apiIp === ds.ip,
  );
  const apiIp = apiOnPrimary ? ds.ip : ds.apiIp || "";
  const apiPort = ds.apiPort || "";

  // DRS review-hub WebSocket — a SEPARATE server, fully independent of the camera
  // machines and the live score server. Its own IP/port, not mirrored from either.
  const socketIp = ds.socketIp || "";
  const socketPort = ds.socketPort || "";

  // Keep the score IP synced to the primary machine while the checkbox is on.
  useEffect(() => {
    if (apiOnPrimary && ds.apiIp !== ds.ip) dispatch(setApi({ apiIp: ds.ip }));
  }, [apiOnPrimary, ds.ip, ds.apiIp, dispatch]);

  // List the directories at the server root to populate the match dropdown.
  const loadMatches = async () => {
    setMatchesState("loading");
    const url = `${getServerBase()}/`;
    try {
      const res = await axios.get(cacheBust(url));
      const dirs = parseDirectories(res.data);
      setMatches(dirs);
      setMatchesState(dirs.length ? "idle" : "error");
    } catch (err) {
      console.error("[ServerCheck] matches failed", url, err);
      setMatches([]);
      setMatchesState("error");
    }
  };

  // Auto-load the match list on mount (server mode) so the dropdown is populated.
  useEffect(() => {
    if (isServer) loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Test whether the primary server is reachable.
  const checkSelected = async () => {
    setStatus("loading");
    setStatusMsg(null);
    const url = `${getServerBase()}/`;
    try {
      const res = await axios.get(cacheBust(url), {
        validateStatus: () => true,
      });
      const ok = res.status >= 200 && res.status < 300;
      setStatus(ok ? "ok" : "error");
      setStatusMsg(
        ok
          ? "Connected — the server responded."
          : `The server answered with an error (HTTP ${res.status}). Double-check the IP and port.`,
      );
    } catch (err) {
      console.error("[ServerCheck] check failed", url, err);
      setStatus("error");
      setStatusMsg(
        "Can't reach the server. Check the IP and port, and that the machine is on and on the same network.",
      );
    }
  };

  // Persist the current settings so they come back after a refresh.
  const saveDefault = () => {
    try {
      localStorage.setItem(
        "dataSourceConfig",
        JSON.stringify({ ...ds, source: ds.source }),
      );
    } catch {
      /* ignore storage errors */
    }
  };
  const onSaveConnect = () => {
    if (remember) saveDefault();
    if (isServer) checkSelected();
  };

  const statusLabel =
    status === "ok"
      ? "Connected"
      : status === "error"
        ? "Not reachable"
        : status === "loading"
          ? "Testing…"
          : "Not tested yet";
  const statusDot =
    status === "ok"
      ? "bg-emerald-400"
      : status === "error"
        ? "bg-rose-400"
        : "bg-white/35";

  return (
    <div className="flex flex-col">
      <div className="px-7 py-6 flex flex-col gap-7">
        {/* ── Step 1: source ─────────────────────────────────────────── */}
        <Step n={1} title="Where does the data come from?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChoiceCard
              active={!isServer}
              onClick={() => dispatch(setSource("local"))}
              title="Sample data"
              desc="Built-in public matches. Nothing to set up."
            />
            <ChoiceCard
              active={isServer}
              onClick={() => dispatch(setSource("server"))}
              title="Machines on my network"
              desc="Live data from your camera and score servers."
            />
          </div>
        </Step>

        {isServer && (
          <>
            {/* ── Step 2: camera machines ───────────────────────────── */}
            <Step n={2} title="Camera machines" chip="BALL TRACKING">
              <p className="text-[13px] text-white/50 leading-relaxed -mt-1">
                Add every machine recording this match. Cameras from all of them
                are combined for each ball.
              </p>
              <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 overflow-hidden">
                {/* header */}
                <div className="grid grid-cols-[130px_1fr_110px_40px] gap-3 px-4 py-3 border-b border-white/[0.07]">
                  <ColHead>Machine</ColHead>
                  <ColHead>IP Address</ColHead>
                  <ColHead>Port</ColHead>
                  <span />
                </div>

                {/* Machine 1 (primary) */}
                <MachineRow
                  label="Machine 1"
                  sub="Primary"
                  ip={ds.ip}
                  port={ds.port}
                  onIp={(v) => dispatch(setServer({ ip: v, port: ds.port }))}
                  onPort={(v) => dispatch(setServer({ ip: ds.ip, port: v }))}
                  status={status}
                />

                {/* Extra machines */}
                {(ds.extraServers || []).map((s, i) => (
                  <MachineRow
                    key={s.id}
                    label={`Machine ${i + 2}`}
                    ip={s.ip}
                    port={s.port}
                    onIp={(v) => dispatch(updateServer({ id: s.id, ip: v }))}
                    onPort={(v) => dispatch(updateServer({ id: s.id, port: v }))}
                    onRemove={() => dispatch(removeServer(s.id))}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => dispatch(addServer())}
                  className="w-full text-left px-4 py-3 text-[13px] font-bold text-sky-300 hover:text-sky-200 hover:bg-white/[0.02] transition-colors"
                >
                  + Add another machine
                </button>
              </div>
            </Step>

            {/* ── Step 3: live score server ─────────────────────────── */}
            <Step n={3} title="Live score server" chip="SCORE & REVIEWS">
              <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-4 flex flex-col gap-4">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={apiOnPrimary}
                    onChange={(e) => setApiOnPrimary(e.target.checked)}
                    className="w-4 h-4 accent-sky-500"
                  />
                  <span className="text-sm text-white/85">
                    Runs on the primary camera machine
                  </span>
                </label>

                <div className="flex items-end gap-3">
                  <Labelled label="IP address" className="flex-1">
                    <Input
                      value={apiIp}
                      onChange={(v) => dispatch(setApi({ apiIp: v }))}
                      placeholder="192.168.0.100"
                      disabled={apiOnPrimary}
                    />
                  </Labelled>
                  <Labelled label="Port" className="w-28">
                    <Input
                      value={apiPort}
                      onChange={(v) => dispatch(setApi({ apiPort: v }))}
                      placeholder="8091"
                    />
                  </Labelled>
                </div>

                <StatusLine dot={statusDot} label={statusLabel} />
              </div>
            </Step>

            {/* ── Step 4: WebSocket — a SEPARATE server ───────────────── */}
            <Step n={4} title="WebSocket">
              <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-4 flex flex-col gap-4">
                <div className="text-sm text-white/60">
                  Used for DRS auto-replay: when the hub sends a ball over this socket, the
                  operator auto-selects and plays its DRS review.
                </div>
                <div className="flex items-end gap-3">
                  <Labelled label="IP address" className="flex-1">
                    <Input
                      value={socketIp}
                      onChange={(v) => dispatch(setSocket({ socketIp: v }))}
                      placeholder="192.168.0.100"
                    />
                  </Labelled>
                  <Labelled label="Port" className="w-28">
                    <Input
                      value={socketPort}
                      onChange={(v) => dispatch(setSocket({ socketPort: v }))}
                      placeholder="8080"
                    />
                  </Labelled>
                </div>
                <div className="text-[11px] text-white/35 font-mono">
                  → ws://{socketIp || "…"}:{socketPort || "…"}/ws
                </div>
              </div>
            </Step>

            {/* ── Step 5: choose a match ────────────────────────────── */}
            <Step n={5} title="Choose a match">
              <select
                value={ds.match}
                onMouseDown={() => {
                  if (matchesState !== "loading") loadMatches();
                }}
                onChange={(e) =>
                  dispatch(setSelection({ match: e.target.value }))
                }
                className="rounded-lg bg-[#0B1222] ring-1 ring-white/15 focus:ring-sky-400 outline-none px-3 py-3 text-sm text-white"
              >
                <option value="" className="bg-[#0B1222]">
                  {matches.length ? "Select a match…" : "Loading matches…"}
                </option>
                {ds.match && !matches.includes(ds.match) && (
                  <option value={ds.match} className="bg-[#0B1222]">
                    {ds.match}
                  </option>
                )}
                {matches.map((m) => (
                  <option key={m} value={m} className="bg-[#0B1222]">
                    {m}
                  </option>
                ))}
              </select>
              {ds.match ? (
                <p className="text-[12px] text-white/45">
                  Reading from{" "}
                  <span className="font-mono text-white/60 break-all">
                    {getServerBase()}/{ds.match}/
                  </span>
                </p>
              ) : (
                <p className="text-[12px] text-white/35">
                  No match selected — pick one above.
                </p>
              )}
              {matchesState === "error" && (
                <Banner tone="warn">
                  Couldn&apos;t find any matches on the server. Check the IP and
                  port, then try &ldquo;Test connection&rdquo;.
                </Banner>
              )}
            </Step>
          </>
        )}

        {!isServer && (
          <Banner tone="ok">
            Using the app&apos;s built-in sample data. Choose &ldquo;Machines on
            my network&rdquo; above to connect to a live match server.
          </Banner>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 px-7 py-4 bg-[#0B1222] border-t border-white/[0.08]">
        <div className="flex flex-col gap-1.5 min-w-0">
          <StatusLine dot={statusDot} label={statusLabel} strong />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-3.5 h-3.5 accent-sky-500"
            />
            <span className="text-[12px] text-white/55">
              Remember these settings after a refresh
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {isServer && (
            <button
              type="button"
              onClick={checkSelected}
              disabled={status === "loading"}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-white/[0.06] hover:bg-white/10 ring-1 ring-white/15 text-white/85 disabled:opacity-50 transition-colors"
            >
              {status === "loading" ? "Testing…" : "Test connection"}
            </button>
          )}
          <button
            type="button"
            onClick={onSaveConnect}
            className="px-5 py-2.5 rounded-lg text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors"
          >
            Save &amp; connect
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="px-7 pb-4 -mt-1">
          <span
            className={`text-[12px] leading-relaxed ${
              status === "error"
                ? "text-rose-300"
                : status === "ok"
                  ? "text-emerald-300"
                  : "text-white/50"
            }`}
          >
            {statusMsg}
          </span>
        </div>
      )}
    </div>
  );
}

// Standalone modal wrapper (kept for any caller that opens Connection directly).
export default function ServerCheck({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999999] bg-[#05070F]/85 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-[720px] max-w-[95vw] max-h-[92vh] overflow-hidden rounded-2xl bg-[#0B1222] text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] ring-1 ring-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#38BDF8] to-[#22C55E]" />
        <div className="flex items-center justify-between px-7 pt-5 pb-4 border-b border-white/[0.07]">
          <h1 className="text-xl font-bold tracking-tight">Connection</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto">
          <ServerCheckBody />
        </div>
      </div>
    </div>
  );
}

/* ---------------- building blocks ---------------- */

// A numbered step: round badge + title (+ optional chip), then its content.
function Step({ n, title, chip, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-white/[0.08] ring-1 ring-white/15 text-[11px] font-bold text-white/70 shrink-0">
          {n}
        </span>
        <span className="text-[15px] font-bold text-white">{title}</span>
        {chip && (
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/55 bg-white/[0.06] ring-1 ring-white/15 rounded-md px-2 py-1">
            {chip}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// A big selectable card (source choice).
function ChoiceCard({ active, onClick, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl p-4 ring-1 transition-colors ${
        active
          ? "bg-sky-500/[0.08] ring-sky-500/60"
          : "bg-white/[0.02] ring-white/10 hover:ring-white/20"
      }`}
    >
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="text-[12px] text-white/50 mt-1 leading-relaxed">
        {desc}
      </div>
    </button>
  );
}

// One machine row inside the camera-machines table.
function MachineRow({ label, sub, ip, port, onIp, onPort, onRemove, status }) {
  return (
    <div className="grid grid-cols-[130px_1fr_110px_40px] gap-3 px-4 py-3 items-start border-b border-white/[0.05] last:border-b-0">
      <div className="pt-2">
        <div className="text-sm font-bold text-white">{label}</div>
        {sub && <div className="text-[11px] text-sky-300/80">{sub}</div>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Input value={ip} onChange={onIp} placeholder="192.168.0.100" />
        <StatusLine
          dot={
            status === "ok"
              ? "bg-emerald-400"
              : status === "error"
                ? "bg-rose-400"
                : "bg-white/35"
          }
          label={
            status === "ok"
              ? "Connected"
              : status === "error"
                ? "Not reachable"
                : "Not tested yet"
          }
        />
      </div>
      <Input value={port} onChange={onPort} placeholder="7575" />
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove machine"
          className="grid place-items-center w-9 h-9 mt-0.5 rounded-lg bg-white/5 ring-1 ring-white/15 text-white/60 hover:bg-rose-600/20 hover:text-rose-300 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ColHead({ children }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
      {children}
    </span>
  );
}

function StatusLine({ dot, label, strong }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[12px] ${
        strong ? "font-bold text-white/85" : "text-white/45"
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function Labelled({ label, className = "", children }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[12px] text-white/55">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, onEnter, placeholder, disabled, className = "" }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      disabled={disabled}
      className={`rounded-lg bg-[#0B1222] ring-1 ring-white/15 focus:ring-sky-400 outline-none px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/30 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    />
  );
}

function Banner({ tone, children }) {
  const tones = {
    ok: "bg-emerald-500/10 ring-emerald-500/30 text-emerald-200",
    warn: "bg-amber-500/10 ring-amber-500/30 text-amber-200",
    error: "bg-rose-500/10 ring-rose-500/30 text-rose-200",
  };
  return (
    <div className={`rounded-lg ring-1 px-4 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
