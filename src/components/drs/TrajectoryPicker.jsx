import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setTrajectoryPickerOpen } from "../../store/slices/drsSlice";
import { setCurrentShow } from "../../store/slices/broadcastSlice";
import { setSelection } from "../../store/slices/dataSourceSlice";
import { playSingle, playOver, playPitchMap, playDrs } from "./showCommands";
import {
  listInnings,
  listOvers,
  listBalls,
  collectBallUrls,
  deliveryUrl,
  deliveryFolder,
  cacheBust,
  isLocal,
  getCameraServers,
  deliveryFolderFor,
} from "../../dataSource";

// Scoped "broadcast console" styling for the panel (visual only — no behaviour
// change). Class names are prefixed dc- and injected via a <style> tag so they
// don't leak into the rest of the app. The accent colour is passed in through
// the --dc-accent CSS variable set on the console root.
const DC_STYLE = `
.dc-console{background:linear-gradient(180deg,#0E1626,#090F1B);color:#E9EEF9;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.05)}
.dc-accentbar{height:2px;width:100%;background:linear-gradient(90deg,transparent,var(--dc-accent),transparent);opacity:.9}
.dc-reg{position:absolute;width:14px;height:14px;border:1px solid rgba(255,255,255,.12);opacity:.5;pointer-events:none}
.dc-reg.tl{top:10px;left:10px;border-right:0;border-bottom:0}
.dc-reg.tr{top:10px;right:10px;border-left:0;border-bottom:0}
.dc-reg.bl{bottom:10px;left:10px;border-right:0;border-top:0}
.dc-reg.br{bottom:10px;right:10px;border-left:0;border-top:0}
.dc-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.dc-header-left{display:flex;align-items:center;gap:12px}
.dc-eyebrow{font-size:10px;letter-spacing:.26em;color:#5A6884;font-weight:700;text-transform:uppercase}
.dc-title{margin:2px 0 0;font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1}
.dc-iconbtn{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:#121B2C;border:1px solid rgba(255,255,255,.12);color:#93A0B8;cursor:pointer;transition:.15s}
.dc-iconbtn:hover{background:#182338;color:#E9EEF9}
.dc-body{padding:18px 24px;overflow-y:auto;display:flex;flex-direction:column;gap:18px}
.dc-section{display:flex;flex-direction:column;gap:9px}
.dc-lbl{display:flex;align-items:baseline;justify-content:space-between}
.dc-fieldlabel{font-size:10.5px;letter-spacing:.2em;color:#93A0B8;font-weight:800;text-transform:uppercase}
.dc-hint{font-size:11px;color:#5A6884;font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.dc-empty{font-size:13px;color:rgba(255,255,255,.4)}
.dc-tiles{display:flex;flex-wrap:wrap;gap:8px}
.dc-scroll{max-height:9rem;overflow-y:auto;padding-right:4px}
.dc-num{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.dc-tile{min-width:78px;padding:12px 15px;border-radius:10px;cursor:pointer;text-align:center;background:linear-gradient(180deg,#121B2C,#0B111E);border:1px solid rgba(255,255,255,.12);color:#E9EEF9;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:.12s;font-weight:700;font-size:14px}
.dc-tile:hover{background:#182338;transform:translateY(-1px)}
.dc-tile:active{transform:translateY(1px)}
.dc-tile.on{color:#04101d;border-color:rgba(255,255,255,.5)}
.dc-seg{display:inline-flex;width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:4px;gap:2px}
.dc-segbtn{flex:1;border:0;background:transparent;color:#93A0B8;font-family:inherit;font-weight:700;font-size:13px;padding:9px 14px;border-radius:7px;cursor:pointer;transition:.14s}
.dc-segbtn:hover{color:#E9EEF9}
.dc-segbtn.on{color:#04101d}
.dc-cams{display:flex;gap:8px;flex-wrap:wrap}
.dc-cam{position:relative;min-width:104px;padding:11px 14px 11px 32px;border-radius:10px;cursor:pointer;background:#121B2C;border:1px solid rgba(255,255,255,.12);color:#E9EEF9;font-weight:700;font-size:13px;transition:.12s}
.dc-cam:hover{background:#182338}
.dc-cam.on{color:#04101d;border-color:transparent}
.dc-cam-src{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:13px;height:13px;border-radius:3px;border:1px solid rgba(255,255,255,.12);background:#0a1220}
.dc-cam.on .dc-cam-src{background:#04101d}
.dc-choice{text-align:left;padding:14px 15px;border-radius:11px;cursor:pointer;background:#121B2C;border:1px solid rgba(255,255,255,.12);transition:.14s;color:#E9EEF9;display:flex;flex-direction:column;gap:6px;width:100%}
.dc-choice:hover{background:#182338}
.dc-choice-row{display:flex;align-items:center;gap:10px}
.dc-radio{width:16px;height:16px;border-radius:50%;border:2px solid #5A6884;display:grid;place-items:center;flex:none}
.dc-radio-dot{width:7px;height:7px;border-radius:50%}
.dc-choice-t{font-weight:800;font-size:14px}
.dc-choice-d{font-size:12.5px;color:#93A0B8;line-height:1.4;margin-left:26px}
.dc-mode{position:relative;text-align:left;padding:16px;border-radius:12px;cursor:pointer;background:#101828;border:1px solid rgba(255,255,255,.10);transition:.15s;color:#E9EEF9;display:flex;flex-direction:column}
.dc-mode:hover{background:#152036;border-color:rgba(255,255,255,.22);transform:translateY(-1px)}
.dc-mode-ic{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;margin-bottom:12px}
.dc-mode-t{font-weight:800;font-size:15px}
.dc-mode-d{font-size:12.5px;color:#93A0B8;margin-top:4px;line-height:1.4}
.dc-keys{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:12px 14px;border-radius:10px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.07)}
.dc-keys-inline{display:flex;flex-wrap:wrap;gap:8px 20px}
.dc-key{display:flex;align-items:center;gap:8px;font-size:13px;color:#93A0B8}
.dc-kbd{font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;color:#E9EEF9;background:#0b1220;border:1px solid rgba(255,255,255,.12);border-bottom-width:2px;border-radius:6px;padding:3px 7px;min-width:22px;text-align:center;display:inline-block}
.dc-balls{display:flex;flex-direction:column;gap:10px}
.dc-selectall{display:flex;align-items:center;gap:8px;align-self:flex-start;background:transparent;border:0;color:#E9EEF9;font-weight:700;font-size:14px;cursor:pointer}
.dc-check{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;border:1px solid rgba(255,255,255,.25)}
.dc-tile-chk{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.dc-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.22)}
.dc-foot-hint{font-size:12px;color:#5A6884}
.dc-take{display:flex;align-items:center;gap:14px;margin-left:auto}
.dc-standby{display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:.2em;font-weight:800;color:#F6A821;text-transform:uppercase}
.dc-standby-led{width:8px;height:8px;border-radius:50%;background:#F6A821;box-shadow:0 0 10px #F6A821}
.dc-take-btn{display:inline-flex;align-items:center;gap:10px;padding:13px 30px;border:0;border-radius:11px;cursor:pointer;font-family:inherit;font-weight:900;font-size:15px;letter-spacing:.04em;color:#04101d;transition:.14s}
.dc-take-btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
.dc-take-btn:active{transform:translateY(1px)}
`;

// The cameras a ball ships are listed in ball_coords.json as "<i>_transform"
// keys (each pairs with the calibration the DRS overlay needs). We read that to
// get the exact indices, then HEAD-probe only those videos (<i>.mp4) — so no
// blind 0..N guessing / 404 spam, and a stray video with no transform/
// calibration is ignored. Adding a real camera (video + transform + calibration
// together) needs no code change.
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
        return { index: String(i), label: `Camera ${i}` };
      } catch {
        return null;
      }
    }),
  );
  return checks.filter(Boolean);
}

// Merge the cameras from EVERY configured machine for one ball. Each machine
// hosts the same match + folder structure, so we probe each machine's ball
// folder, tag every camera with its machine + folder, and return one unified
// list. Selecting a camera later plays it from its own machine's folder (video
// + calibration + trajectory). An offline machine simply contributes nothing.
// Local source → the single public folder.
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
        const cams = await probeCameras(folder); // [{ index, label }]
        return cams.map((c) => ({ serverId, folder, index: c.index }));
      } catch {
        return [];
      }
    }),
  );
  // Flatten in machine order. Label each feed by its REAL camera index (from
  // ball_coords "<i>_transform"), not its list position — so cameras 1 & 3 show
  // as "Cam 1" & "Cam 3", not renumbered to 1 & 2.
  return perServer.flat().map((c) => ({
    ...c,
    key: `${c.serverId}:${c.index}`,
    label: `Cam ${c.index}`,
  }));
}

const MODE_META = {
  bowling: { label: "Trajectories", accent: "#22C55E" },
  "pitch-go": { label: "Pitch Map", accent: "#F59E0B" },
  "drs-go": { label: "DRS Review", accent: "#38BDF8" },
  "noball-go": { label: "No-Ball Check", accent: "#F43F5E" },
  single: { label: "Single Delivery", accent: "#A78BFA" },
};

// Press "A" to open this guided control panel. Pick a mode → configure → Start.
export default function TrajectoryPicker() {
  const dispatch = useDispatch();
  const open = useSelector((s) => s.drs.trajectoryPickerOpen);
  const source = useSelector((s) => s.dataSource.source);
  const match = useSelector((s) => s.dataSource.match);

  const [step, setStep] = useState("mode");
  const [innings, setInnings] = useState("1");
  const [overNo, setOverNo] = useState("1");
  const [ballNo, setBallNo] = useState("1");
  // Bowling Analysis: which balls of the over to include (multi-select). Defaults
  // to all balls of the selected over.
  const [ballSel, setBallSel] = useState([]);
  const [playModeSel, setPlayModeSel] = useState("chronological");
  const [pitchOver, setPitchOver] = useState("all");
  // DRS review setup (collected here instead of a second popup).
  const [drsDecision, setDrsDecision] = useState("NOT_OUT"); // NOT_OUT | OUT
  const [drsRightHanded, setDrsRightHanded] = useState(true);
  const [drsSoftSignal, setDrsSoftSignal] = useState(false);
  // Selected physical camera feed (index string "0","1",…) for DRS / No-Ball,
  // and the cameras the selected ball folder actually ships (probed on change).
  // Selected camera KEY ("<serverId>:<index>") from the merged multi-machine
  // list, and the merged list itself (each entry carries its machine's folder).
  const [camera, setCamera] = useState("");
  const [cameraOpts, setCameraOpts] = useState([]);

  // Options discovered from the source (server: live folders; local: sample).
  const [inningsOpts, setInningsOpts] = useState([]);
  const [overOpts, setOverOpts] = useState([]);
  const [ballOpts, setBallOpts] = useState([]);

  // Nothing is fetched on the mode-selection screen — data loads only once the
  // operator picks a mode that needs it. Each list also waits for its parent to
  // resolve (innings → overs → balls), so we never request e.g. in-1/1/ before
  // the over list is even known.

  // Load innings when a data mode is chosen.
  useEffect(() => {
    if (!open || step === "mode") return;
    let alive = true;
    listInnings()
      .then((opts) => {
        if (!alive) return;
        setInningsOpts(opts);
        setInnings((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
      })
      .catch(() => {
        if (!alive) return;
        setInningsOpts([]);
        setInnings("");
      });
    return () => {
      alive = false;
    };
  }, [open, step, source, match]);

  // Load overs once the chosen innings is confirmed to exist.
  useEffect(() => {
    if (!open || step === "mode" || !inningsOpts.includes(innings)) return;
    let alive = true;
    listOvers(innings)
      .then((opts) => {
        if (!alive) return;
        setOverOpts(opts);
        setOverNo((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
      })
      .catch(() => {
        if (!alive) return;
        setOverOpts([]);
        setOverNo("");
      });
    return () => {
      alive = false;
    };
  }, [open, step, source, match, innings, inningsOpts]);

  // Load balls once the chosen over is confirmed to exist.
  useEffect(() => {
    if (!open || step === "mode" || !overOpts.includes(overNo)) return;
    let alive = true;
    listBalls(innings, overNo)
      .then((opts) => {
        if (!alive) return;
        setBallOpts(opts);
        setBallNo((cur) => (opts.includes(cur) ? cur : (opts[0] ?? "")));
        // Default the Bowling multi-select to every ball of the over.
        setBallSel(opts);
      })
      .catch(() => {
        if (!alive) return;
        setBallOpts([]);
        setBallNo("");
        setBallSel([]);
      });
    return () => {
      alive = false;
    };
  }, [open, step, source, match, innings, overNo, overOpts]);

  // Probe camera feeds only on the DRS / No-Ball steps, once the ball is
  // confirmed. Keeps the selected camera valid.
  useEffect(() => {
    if (!open || (step !== "drs-go" && step !== "noball-go")) return;
    if (!ballOpts.includes(ballNo)) return;
    let alive = true;
    probeCamerasAllServers(innings, overNo, ballNo)
      .then((opts) => {
        if (!alive) return;
        setCameraOpts(opts);
        setCamera((cur) =>
          opts.some((c) => c.key === cur) ? cur : (opts[0]?.key ?? ""),
        );
      })
      .catch(() => {
        if (!alive) return;
        setCameraOpts([]);
      });
    return () => {
      alive = false;
    };
  }, [open, step, source, match, innings, overNo, ballNo, ballOpts]);

  if (!open) return null;

  const close = () => {
    dispatch(setTrajectoryPickerOpen(false));
    setStep("mode");
  };

  // ---- Start actions ----
  const startSingle = () => {
    const url = deliveryUrl(innings, overNo, ballNo);
    dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
    playSingle(dispatch, url);
    dispatch(setCurrentShow({ kind: "single", url }));
    close();
  };

  const startBowling = async () => {
    // Only the checked balls, kept in over order. Fall back to the whole over
    // if somehow nothing is selected.
    const chosen = ballOpts.filter((b) => ballSel.includes(b));
    const balls = chosen.length ? chosen : ballOpts;
    const urls = balls.map((b) => deliveryUrl(innings, overNo, b));
    dispatch(setSelection({ innings, over: overNo }));
    dispatch(
      setCurrentShow({
        kind: "over",
        urls,
        overNo,
        playMode: playModeSel,
      }),
    );
    close();
    await playOver(dispatch, urls, overNo, playModeSel);
  };

  const startPitch = async () => {
    const overs = pitchOver === "all" ? overOpts : [pitchOver];
    const urls = await collectBallUrls(innings, overs);
    dispatch(setSelection({ innings }));
    dispatch(setCurrentShow({ kind: "pitch", urls }));
    close();
    await playPitchMap(dispatch, urls);
  };

  const startDrs = () => {
    // Resolve the selected camera to its own machine's folder + local index.
    const cam =
      cameraOpts.find((c) => c.key === camera) || cameraOpts[0] || null;
    const folderUrl = cam ? cam.folder : deliveryFolder(innings, overNo, ballNo);
    const cameraIndex = cam ? cam.index : "0";
    dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
    const operatorInput = {
      originalDecision: drsDecision,
      isRightHanded: drsRightHanded,
      softSignal: drsSoftSignal,
    };
    dispatch(
      setCurrentShow({
        kind: "drs",
        folderUrl,
        operatorInput,
        camera: cameraIndex,
      }),
    );
    close();
    playDrs(dispatch, folderUrl, operatorInput, false, null, cameraIndex);
  };

  // No-ball check: reuses the DRS replay (video + 3D tracking) but with the
  // decision panels hidden (noBall: true). Inputs aren't needed for a no-ball,
  // so a default is passed just to advance the replay to the video.
  const startNoBall = () => {
    const cam =
      cameraOpts.find((c) => c.key === camera) || cameraOpts[0] || null;
    const folderUrl = cam ? cam.folder : deliveryFolder(innings, overNo, ballNo);
    const cameraIndex = cam ? cam.index : "0";
    dispatch(setSelection({ innings, over: overNo, ball: ballNo }));
    const operatorInput = {
      originalDecision: "NOT_OUT",
      isRightHanded: true,
      softSignal: false,
    };
    dispatch(
      setCurrentShow({
        kind: "drs",
        folderUrl,
        operatorInput,
        noBall: true,
        camera: cameraIndex,
      }),
    );
    close();
    playDrs(dispatch, folderUrl, operatorInput, true, null, cameraIndex);
  };

  const meta = MODE_META[step];
  const accent = meta?.accent ?? "#38BDF8";

  return (
    <div
      className="fixed inset-0 z-[9999998] bg-[#05070F]/85 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={close}
    >
      <div
        className="dc-console relative w-[720px] max-w-[95vw] max-h-[92vh] overflow-hidden flex flex-col font-sans"
        style={{ "--dc-accent": accent }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{DC_STYLE}</style>

        {/* corner registration marks (broadcast-panel styling) */}
        <span className="dc-reg tl" />
        <span className="dc-reg tr" />
        <span className="dc-reg bl" />
        <span className="dc-reg br" />

        {/* Accent top bar */}
        <div className="dc-accentbar" />

        {/* Title bar */}
        <div className="dc-header">
          <div className="dc-header-left">
            {step !== "mode" && (
              <button
                type="button"
                onClick={() => setStep("mode")}
                aria-label="Back"
                className="dc-iconbtn"
              >
                <ChevronLeft />
              </button>
            )}
            <div>
              <div className="dc-eyebrow">Broadcast Control · Replay Setup</div>
              <h1 className="dc-title">
                {step === "mode" ? "Select Analysis" : meta?.label}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="dc-iconbtn"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="dc-body">
          {/* ===== MODE ===== */}
          {step === "mode" && (
            <div className="grid grid-cols-2 gap-3.5">
              <ModeCard
                icon={<BowlingIcon />}
                title="Trajectories"
                desc="Replay a full over with ball trajectories and broadcast camera angles."
                accent={MODE_META.bowling.accent}
                onClick={() => setStep("bowling")}
              />
              {/* Hidden for now (keep for later):
              <ModeCard
                icon={<PitchIcon />}
                title="Pitch Map"
                desc="Map where deliveries bounced across the length zones."
                accent={MODE_META["pitch-go"].accent}
                onClick={() => setStep("pitch-go")}
              />
              */}
              <ModeCard
                icon={<DrsIcon />}
                title="DRS Review"
                desc="Decision review with video, ball tracking and the final verdict."
                accent={MODE_META["drs-go"].accent}
                onClick={() => setStep("drs-go")}
              />
              <ModeCard
                icon={<NoBallIcon />}
                title="No-Ball Check"
                desc="Front-foot check — video + 3D ball tracking, no out/not-out panels."
                accent={MODE_META["noball-go"].accent}
                onClick={() => setStep("noball-go")}
              />
              {/* Hidden for now (keep for later):
              <ModeCard
                icon={<SingleIcon />}
                title="Single Delivery"
                desc="Replay one delivery with its full trajectory and ball details."
                accent={MODE_META.single.accent}
                onClick={() => setStep("single")}
              />
              */}
            </div>
          )}

          {/* No data for the server source until a match is picked. */}
          {step !== "mode" &&
            source === "server" &&
            inningsOpts.length === 0 && (
              <div className="rounded-lg ring-1 ring-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                No data loaded. Open “Check data server”, pick a match, then come
                back.
              </div>
            )}

          {/* ===== SINGLE DELIVERY ===== */}
          {step === "single" && (
            <>
              <Field label="Innings">
                <NumberRow
                  numbers={inningsOpts}
                  selected={innings}
                  onSelect={setInnings}
                  accent={accent}
                  prefix="Innings "
                />
              </Field>
              <Field label="Over">
                <NumberRow
                  numbers={overOpts}
                  selected={overNo}
                  onSelect={setOverNo}
                  accent={accent}
                  prefix="Over "
                />
              </Field>
              <Field label="Ball">
                <NumberRow
                  numbers={ballOpts}
                  selected={ballNo}
                  onSelect={setBallNo}
                  accent={accent}
                  prefix="Ball "
                />
              </Field>
            </>
          )}

          {/* ===== BOWLING ===== */}
          {step === "bowling" && (
            <>
              <Field label="Innings">
                <NumberRow
                  numbers={inningsOpts}
                  selected={innings}
                  onSelect={setInnings}
                  accent={accent}
                  prefix="Innings "
                />
              </Field>
              <Field label="Select Over" hint={`${overOpts.length} overs`}>
                <NumberRow
                  numbers={overOpts}
                  selected={overNo}
                  onSelect={setOverNo}
                  accent={accent}
                  prefix="Over "
                />
              </Field>

              <Field
                label="Balls"
                hint={`${ballSel.length}/${ballOpts.length} selected`}
              >
                <BallChecklist
                  balls={ballOpts}
                  selected={ballSel}
                  accent={accent}
                  onToggle={(b) =>
                    setBallSel((cur) =>
                      cur.includes(b)
                        ? cur.filter((x) => x !== b)
                        : [...cur, b],
                    )
                  }
                  onToggleAll={() =>
                    setBallSel((cur) =>
                      cur.length === ballOpts.length ? [] : ballOpts,
                    )
                  }
                />
              </Field>

              <Field label="Playback Style">
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard
                    active={playModeSel === "chronological"}
                    title="Sequential"
                    desc="Each delivery plays in turn, then all replay together."
                    accent={accent}
                    onClick={() => setPlayModeSel("chronological")}
                  />
                  <ChoiceCard
                    active={playModeSel === "simultaneous"}
                    title="Combined"
                    desc="All selected deliveries play together at once."
                    accent={accent}
                    onClick={() => setPlayModeSel("simultaneous")}
                  />
                </div>
              </Field>

              <Field label="Controls" hint="After it's on screen">
                <ControlGrid
                  rows={[
                    ["Space", "Play / replay"],
                    ["0", "Reset to start"],
                    ["1", "Side view"],
                    ["2", "Top-down view"],
                    ["3", "Behind the stumps"],
                    ["4", "Front-on view"],
                    ["5", "Cinematic sweep"],
                  ]}
                />
              </Field>
            </>
          )}

          {/* ===== PITCH ===== */}
          {step === "pitch-go" && (
            <>
              <Field label="Innings">
                <NumberRow
                  numbers={inningsOpts}
                  selected={innings}
                  onSelect={setInnings}
                  accent={accent}
                  prefix="Innings "
                />
              </Field>
              <Field label="Select Over">
                <div className="grid grid-cols-4 gap-3">
                  <SelectButton
                    active={pitchOver === "all"}
                    accent={accent}
                    onClick={() => setPitchOver("all")}
                  >
                    All Overs
                  </SelectButton>
                  {overOpts.map((o) => (
                    <SelectButton
                      key={o}
                      active={pitchOver === o}
                      accent={accent}
                      onClick={() => setPitchOver(o)}
                    >
                      Over {o}
                    </SelectButton>
                  ))}
                </div>
              </Field>

              <Field label="Controls" hint="After it's on screen">
                <ControlGrid
                  rows={[
                    ["Space", "Play / replay"],
                    ["0", "Reset to start"],
                    ["1", "Top-down view"],
                    ["2", "Overview"],
                  ]}
                />
              </Field>
            </>
          )}

          {/* ===== DRS ===== */}
          {step === "drs-go" && (
            <>
              <Field label="Innings">
                <NumberRow
                  numbers={inningsOpts}
                  selected={innings}
                  onSelect={setInnings}
                  accent={accent}
                  prefix="Innings "
                />
              </Field>
              <Field label="Over" hint={`${overOpts.length} overs`}>
                <NumberRow
                  numbers={overOpts}
                  selected={overNo}
                  onSelect={setOverNo}
                  accent={accent}
                  prefix="Over "
                />
              </Field>
              <Field
                label="Ball"
                hint={
                  ballOpts.length
                    ? `${ballOpts.length} ball${ballOpts.length > 1 ? "s" : ""} in over ${overNo}`
                    : "no balls"
                }
              >
                <NumberRow
                  numbers={ballOpts}
                  selected={ballNo}
                  onSelect={setBallNo}
                  accent={accent}
                  prefix="Ball "
                />
              </Field>
              {/* Original decision, batsman hand and soft signal on one row. */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Original Decision">
                  <PairToggle
                    left={["NOT_OUT", "Not Out"]}
                    right={["OUT", "Out"]}
                    value={drsDecision}
                    onChange={setDrsDecision}
                    accent={accent}
                  />
                </Field>
                <Field label="Batsman">
                  <PairToggle
                    left={[false, "Left"]}
                    right={[true, "Right"]}
                    value={drsRightHanded}
                    onChange={setDrsRightHanded}
                    accent={accent}
                  />
                </Field>
                <Field label="Soft Signal">
                  <PairToggle
                    left={[false, "False"]}
                    right={[true, "True"]}
                    value={drsSoftSignal}
                    onChange={setDrsSoftSignal}
                    accent={accent}
                  />
                </Field>
              </div>
              {/* Camera feeds on their own single scrollable row. */}
              <Field label="Camera" hint="Broadcast feed">
                <CameraRow
                  options={cameraOpts}
                  value={camera}
                  onChange={setCamera}
                  accent={accent}
                />
              </Field>
              {/* Shortcuts on a single row. */}
              <Field label="Keyboard" hint="During review">
                <ControlGrid
                  inline
                  rows={[
                    ["Space", "Play / replay"],
                    ["0", "Reset to start"],
                    ["1-5", "Review angle"],
                  ]}
                />
              </Field>
            </>
          )}

          {/* ===== NO-BALL CHECK ===== */}
          {step === "noball-go" && (
            <>
              <p className="text-sm text-white/60 leading-relaxed">
                Front-foot no-ball check — plays the delivery video with 3D ball
                tracking. No out / not-out panels.
              </p>
              <Field label="Innings">
                <NumberRow
                  numbers={inningsOpts}
                  selected={innings}
                  onSelect={setInnings}
                  accent={accent}
                  prefix="Innings "
                />
              </Field>
              <Field label="Over" hint={`${overOpts.length} overs`}>
                <NumberRow
                  numbers={overOpts}
                  selected={overNo}
                  onSelect={setOverNo}
                  accent={accent}
                  prefix="Over "
                />
              </Field>
              <Field
                label="Ball"
                hint={
                  ballOpts.length
                    ? `${ballOpts.length} ball${ballOpts.length > 1 ? "s" : ""} in over ${overNo}`
                    : "no balls"
                }
              >
                <NumberRow
                  numbers={ballOpts}
                  selected={ballNo}
                  onSelect={setBallNo}
                  accent={accent}
                  prefix="Ball "
                />
              </Field>
              <Field label="Camera" hint="Broadcast feed">
                <CameraRow
                  options={cameraOpts}
                  value={camera}
                  onChange={setCamera}
                  accent={accent}
                />
              </Field>
              <Field label="Keyboard" hint="During playback">
                <ControlGrid
                  inline
                  rows={[
                    ["Space", "Play / replay"],
                    ["0", "Reset to start"],
                    ...(cameraOpts.length > 1
                      ? [[`1-${cameraOpts.length}`, "Switch camera"]]
                      : cameraOpts.length === 1
                        ? [["1", "Switch camera"]]
                        : []),
                  ]}
                />
              </Field>
            </>
          )}
        </div>

        {/* Footer / transport */}
        <div className="dc-footer">
          <span className="dc-foot-hint">
            Press <Kbd>A</Kbd> or <Kbd>Esc</Kbd> to close
          </span>
          {step !== "mode" && (
            <div className="dc-take">
              <span className="dc-standby">
                <span className="dc-standby-led" /> Standby
              </span>
              <button
                type="button"
                onClick={
                  step === "bowling"
                    ? startBowling
                    : step === "pitch-go"
                      ? startPitch
                      : step === "single"
                        ? startSingle
                        : step === "noball-go"
                          ? startNoBall
                          : startDrs
                }
                className="dc-take-btn"
                style={{ background: accent, boxShadow: `0 8px 24px ${accent}59` }}
              >
                <PlayIcon /> Start
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- presentational helpers ---------------- */

// A titled form field with an optional hint on the right.
function Field({ label, hint, children }) {
  return (
    <div className="dc-section">
      <div className="dc-lbl">
        <span className="dc-fieldlabel">{label}</span>
        {hint && <span className="dc-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// A wrapping grid of selectable number buttons (innings / over / ball). Six per
// row; caps at ~3 rows and scrolls vertically so a big count (e.g. 100 overs)
// stays neat while a small count (6 balls) still shows on one row.
function NumberRow({ numbers, selected, onSelect, accent, prefix = "" }) {
  return (
    <div className="dc-tiles dc-scroll">
      {numbers.map((n) => (
        <SelectButton
          key={n}
          active={String(selected) === String(n)}
          accent={accent}
          onClick={() => onSelect(n)}
        >
          {prefix}
          <span className="dc-num">{n}</span>
        </SelectButton>
      ))}
    </div>
  );
}

// Physical camera feeds (Camera 1, Camera 2, …), keyed by numeric index, on a
// single horizontally-scrolling row so any number of cameras (discovered
// dynamically from the ball folder) fits without wrapping. Shows a hint when
// the selected ball ships no camera videos.
function CameraRow({ options, value, onChange, accent }) {
  if (!options.length) {
    return <div className="dc-empty">No camera videos for this ball.</div>;
  }
  return (
    <div className="dc-cams">
      {options.map((opt) => {
        const on = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`dc-cam${on ? " on" : ""}`}
            style={on ? { background: accent } : undefined}
          >
            <span className="dc-cam-src" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// A two-option toggle ([value, label] pairs) for the DRS setup.
function PairToggle({ left, right, value, onChange, accent }) {
  const opt = (pair) => {
    const [val, label] = pair;
    const isActive = value === val;
    return (
      <button
        type="button"
        onClick={() => onChange(val)}
        className={`dc-segbtn${isActive ? " on" : ""}`}
        style={isActive ? { background: accent } : undefined}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="dc-seg">
      {opt(left)}
      {opt(right)}
    </div>
  );
}

// Multi-select ball list for Bowling Analysis: a "Select all" toggle plus a
// checkable chip per ball (default all selected). Scrolls if the over is long.
function BallChecklist({ balls, selected, onToggle, onToggleAll, accent }) {
  if (!balls.length) {
    return <div className="dc-empty">No balls in this over.</div>;
  }
  const allOn = balls.every((b) => selected.includes(b));
  return (
    <div className="dc-balls">
      <button type="button" onClick={onToggleAll} className="dc-selectall">
        <span
          className="dc-check"
          style={allOn ? { background: accent, borderColor: accent } : undefined}
        >
          {allOn && <CheckIcon dark />}
        </span>
        Select all
      </button>
      <div className="dc-tiles dc-scroll">
        {balls.map((b) => {
          const on = selected.includes(b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => onToggle(b)}
              className={`dc-tile dc-tile-chk${on ? " on" : ""}`}
              style={on ? { background: accent, boxShadow: `0 6px 18px ${accent}44` } : undefined}
            >
              {on && <CheckIcon dark />}
              Ball <span className="dc-num">{b}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckIcon({ dark = false }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={dark ? "#05070F" : "currentColor"}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// A pill-style selectable button (over / ball / camera selection). `className`
// lets callers add layout hints (e.g. shrink-0 for the horizontally-scrolling
// camera row).
function SelectButton({ active, accent, onClick, children, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dc-tile${active ? " on" : ""} ${className}`}
      style={
        active
          ? { background: accent, boxShadow: `0 6px 18px ${accent}44` }
          : undefined
      }
    >
      {children}
    </button>
  );
}

// A big mode-selection card with an icon.
function ModeCard({ icon, title, desc, accent, onClick }) {
  return (
    <button type="button" onClick={onClick} className="dc-mode">
      <span
        className="dc-mode-ic"
        style={{ background: `${accent}1f`, color: accent }}
      >
        {icon}
      </span>
      <span className="dc-mode-t">{title}</span>
      <span className="dc-mode-d">{desc}</span>
    </button>
  );
}

// A selectable option card (animation choice) with a radio dot.
function ChoiceCard({ active, title, desc, accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dc-choice${active ? " on" : ""}`}
      style={active ? { borderColor: accent } : undefined}
    >
      <span className="dc-choice-row">
        <span
          className="dc-radio"
          style={active ? { borderColor: accent } : undefined}
        >
          {active && (
            <span className="dc-radio-dot" style={{ background: accent }} />
          )}
        </span>
        <span className="dc-choice-t">{title}</span>
      </span>
      <span className="dc-choice-d">{desc}</span>
    </button>
  );
}

function ControlGrid({ rows, inline = false }) {
  return (
    <div className={`dc-keys${inline ? " dc-keys-inline" : ""}`}>
      {rows.map(([k, label]) => (
        <span key={k} className="dc-key">
          <Kbd>{k}</Kbd>
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}

function Kbd({ children }) {
  return <kbd className="dc-kbd">{children}</kbd>;
}

/* ---------------- icons (inline, currentColor) ---------------- */

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function BowlingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20c4-8 14-8 18 0" />
      <circle cx="18" cy="6" r="2.5" />
    </svg>
  );
}
function PitchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="8" height="18" rx="1" />
      <circle cx="12" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function DrsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function SingleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function NoBallIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
