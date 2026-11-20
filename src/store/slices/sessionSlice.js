import { createSlice, createSelector } from "@reduxjs/toolkit";
import { startDrs } from "./drsSlice";

// Helper function to validate URL
const isValidUrl = (url) => {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return false;
  }

  // Basic URL validation - check if it starts with http/https or is a relative path
  const urlPattern = /^(https?:\/\/|\/)/i;
  return urlPattern.test(url.trim());
};
const initialState = {
  animationType: "Default",
  sessionType: "BATTING_SESSION",
  userDetails: null,
  sessionDetails: null,
  isSessionCardShow: false,
  testBallDetails: null,
  actualTrajectoryDetails: null,
  sensorData: null,
  videoUrl: null,
  trajectoryUrl: null,
  sixHighlight: false, // true when the current single play is a 6-Highlights six replay
  sixPaused: false, // 6 Highlights: Space freezes the batting trajectory + camera
  sixRotateStadium: true, // 6 Highlights operator option: spin the stadium during a six
  sixRotateDeg: 180, // 6 Highlights: how many degrees to spin the stadium (operator-editable)
  // 6 Highlights label toggles: Height + Distance are ALWAYS shown; Launch angle & Ball speed
  // are operator-optional (either, both, or neither). Default OFF.
  sixShowAngle: false,
  sixShowSpeed: false,
  sixViewAngle: null, // 6 Highlights camera: null = auto (main cam in flight → side after landing),
  // "side" (key 1) or "main" (key 2) when the operator picks one.
  accumulatedTrajectories: [], // Store completed trajectories for persistent display
  multiTrajectoryPlay: false, // true while animated "Select All" playback is running
  multiPlayMode: "chronological", // "chronological" (one-by-one then together) | "simultaneous" (all together)
  // Highest ball index currently revealed in the SEQUENTIAL one-by-one intro, so the
  // ticker can reveal its ball chips IN SYNC with the trajectory playback. -1 = none
  // yet; set to balls.length-1 once the intro finishes / in simultaneous mode (all).
  multiSeqActive: -1,
  multiPlayStarted: false, // false = loaded/armed at the start; true = actually animating (Play/Space)
  multiPaused: false, // true = playback frozen mid-flight (Space again); resumes where it left off
  multiPausable: true, // operator mode: true = Space can pause/resume; false = play straight through
  multiTubesOff: false, // post-play: Space hides the tubes, leaves only the balls
  multiCameraView: 0, // bowling-analysis playback camera preset (0 = Cinematic, 1 = Straight)
  multiTrajLen: "afterImpact", // "afterImpact" = ball stops at impact | "full" = whole path
  multiCombinePitchMap: false, // true = after the over finishes, advance to the pitch map
  multiAutoPlay: false, // true = Automatic: play + advance the flow without Space
  // True once a bowling-analysis move has SETTLED (playback complete, or a camera-
  // key move finished) → the script stops driving the camera and OrbitControls take
  // over so the operator can zoom/pan/tilt. A new play/key clears it.
  multiInteractive: false,
  // Option B: once the operator manually moves the camera (OrbitControls) during a
  // bowling-analysis pause, the camera STAYS on their angle for the rest of the over
  // — the scripted camera does not reclaim it on resume. Cleared on a new play/key.
  multiManualCam: false,
  multiTrajectoryComplete: false, // true once all balls finish animating (enables 1-5 angles)
  // ── PiP / COMPACT PROFILE ───────────────────────────────────────────────────
  // The ONE global switch for the small-window broadcast profile. Set ONLY by the
  // broadcast window from its own size (width ≤ 400 OR height ≤ 600). When true:
  // show only the 3D (video hidden, panels hidden), fill the box, keep the stadium,
  // and disable auto-fullscreen. Operator window never sets it → unaffected.
  // See docs/PIP_PICTURE_IN_PICTURE.md.
  compact: false,
  // Day/Night scene mode. "day" = full HDRI, bright sky. "night" = dimmed HDRI +
  // stancebeam night-sky dome + dynamic_light.glb floodlights. Operator toggles it;
  // mirrored to the big screen via crossTabSync. Defaults to night (floodlit stadium).
  scene: "night",
  // Standalone Pitch mode uses its own top-view flat-dot renderer + bowler ticker.
  pitchMapStandalone: false,
  // ── SWING ANALYSIS (single ball, trajectory release→impact) ────────────────
  // Pitch map dots DROP from the top when true (used for the "all together" reveal);
  // false = the quick scale-up pop (used for one-by-one).
  pitchMapDrop: false,
  swingActive: false, // true while the swing-analysis view is shown
  swingArmed: false, // cued on the big screen: show the setup, hold the flight until Play
  swingPaused: false, // Space mid-flight: freeze the swing + hand camera to OrbitControls
  swingSel: null, // { innings, over, ball } of the ball being analysed
  swingToken: 0, // bump to (re)trigger the swing load/animation
  swingInteractive: false, // true once the swing flight settles → OrbitControls on
  swingViewAngle: null, // DRS-style review angle for swing: side|top|behind|front|null
  swingViewToken: 0, // bump to re-trigger the same angle
  swingTurnDeg: null, // ball_analytics turn_deg → the legend's "Turn" value (spinners)
  swingSwingDeg: null, // ball_analytics swing_deg → the legend's "Swing" value (seamers)
  swingBowlerType: "spin", // operator option: "spin" → legend shows Turn; "seam" → Swing
  multiViewAngle: null, // selected review angle for multi-ball: side|top|behind|front|tour
  multiViewToken: 0, // bumps each angle press so the same angle re-applies
  multiReplayToken: 0, // bump to replay the multi-ball animation from the start
  pitchMapActive: false, // true while the over pitch-map (bounce dots) is shown
  pitchMapPoints: [], // [{x,y,z,description}] bounce points for the pitch map
  // Operator-placed FAKE balls on the standalone pitch map: [{id, kind, x, z}], kind =
  // "0" | "1" | "2" | "3" | "four" | "six" | "wicket"; x = line (m, + = off side for a
  // RHB), z = length (m from the batter's stumps). Merged in by selectPitchMapPoints.
  pitchFakeBalls: [],
  // Bowling tab, pitch map after the over (combine): hide the ball NUMBER on each dot
  // (dots keep their per-ball colour). Operator option; default shows the number.
  bowlingPitchHideNumber: false,
  pitchMapView: null, // pitch-map review camera: null (default) | "top"
  // Bumped on each fresh startPitchMap so the camera entry runs once per Start —
  // appending dots (addPitchMapPoints) must NOT restart it.
  pitchMapSession: 0,
  // True once a pitch-map camera move has settled → OrbitControls take over so the
  // operator can zoom / pan / tilt / rotate. Cleared while a move is animating.
  pitchMapInteractive: false,
  // Pitch-map dot label: "runs" = each dot shows its run value (W for wicket);
  // "ball" = each dot shows the ball number. Colour is always by outcome either way.
  pitchDotStyle: "ball",
  // Pitch-map bowler type → which length-zone SET colours/labels/buckets the pitch (see
  // drs/pitchZoneSets.js). "seamers" (6 zones) | "spinners" (4 zones). Switching crossfades.
  pitchBowlerType: "seamers",
  // STUMP MAP — like the pitch map, but plots where each ball crosses the stumps plane
  // (z≈1.22m) on a front-on stumps view. Mirrors the pitch-map state keys.
  stumpMapActive: false,
  stumpMapPoints: [], // [{x,y,ballNo,over,runs,isWicket,outcome}] crossing points
  stumpMapSession: 0, // bump per Start so the camera entry runs once
  stumpMapInteractive: false, // settled → OrbitControls on

  // INTERCEPTION MAP — like the stump beehive, but plots the BAT-IMPACT point (where the ball
  // met the bat) and is viewed from a DRS-style SIDE angle. Mirrors the stump-map state keys.
  interceptActive: false,
  interceptPoints: [], // [{x,y,ballNo,over,runs,isWicket,outcome}] bat-impact points
  interceptSession: 0, // bump per Start so the camera entry runs once
  interceptInteractive: false, // settled → OrbitControls on
  interceptStyle: "ball", // "runs" numbered dots | "ball" glossy coloured balls
  interceptName: "", // editable name shown on the interception ticker's blue container
  interceptNameKeepCase: false,

  // WAGON WHEEL — one line per scoring shot (bat impact → landing), plotted top-down on the
  // ground. Mirrors the pitch/stump-map state keys.
  wagonActive: false,
  wagonLines: [], // [{path,sx,sz,lx,lz,…}] one scoring shot each
  wagonSession: 0, // bump per Start so the camera entry runs once
  wagonInteractive: false, // settled → OrbitControls on
  wagonReveal: "sequential", // "sequential" (one-by-one, then recap all-together) | "together"
  wagonDuration: 5, // TOTAL seconds to draw ALL shots; per-ball = duration / count (adapts live)
  wagonSweep: "cw", // one-by-one draw order: sweep round the ground from the leg side — "cw" | "ccw"
  wagonStyle: "line", // beam shape: "line" = straight bat→landing line (default) | "actual" = real flight arc
  wagonBatterName: "", // editable batsman name shown on the wagon-wheel ticker (blue header)
  wagonBatHand: "R", // batsman hand from the filter's Batsman-style → OFF/LEG ground labels ("R"|"L")
  wagonNameKeepCase: false, // show the ticker name exactly as typed (no forced UPPERCASE)
  // Which boundaries the wagon shows (mirrors the panel's Fours/Sixes toggles) → the ticker
  // legend reflects the SAME selection (only Fours → legend shows only Fours).
  wagonFours: false,
  wagonSixes: true,
  wagonHideCard: false, // hide the ticker's WHITE card (the Fours/Sixes legend); default shown
  wagonHideName: false, // hide the ticker's BLUE name container; default shown
  stumpMapDrop: false, // dots drop in (all-together) vs pop (one-by-one)
  stumpMapStyle: "ball", // "runs" = numbered dots | "ball" = glossy coloured balls
  // Stump-map ticker bowler name (blue header). Empty → the score-API bowler, else "BOWLER".
  // Set from the Filters' Bowler selection (or edited by the operator), mirrored to the big
  // screen on Send — same flow as pitchBowlerName.
  stumpBowlerName: "",
  // Which outcome CATEGORIES to show (pitch map + stump map): the balls of an unchecked
  // category are hidden from the 3D plot AND its swatch is dropped from the ticker legend.
  // Default: all on. Operator toggles via the legend checkboxes next to the bowler name.
  ballCategories: { dot: true, runs: true, four: true, six: true, wicket: true },
  // Pitch/stump-map ball FX: the EVENT-COLOUR glow + heartbeat pulse is toggled per
  // outcome by the operator (dot/runs/four/six/wicket) — same keys as OUTCOME_LEGEND.
  pitchGlow: { dot: false, runs: false, four: false, six: false, wicket: false },
  stumpGlow: { dot: false, runs: false, four: false, six: false, wicket: false },
  // Operator toggle: hide the broadcast ticker (bowling analysis + pitch map).
  // Default FALSE → the ticker SHOWS; check the "Hide ticker" box to hide it.
  hideTicker: false,
  // Operator toggle (pitch map): hide the LENGTH DISTRIBUTION % chips independently of
  // the ticker. Default FALSE → shown by default (all three hide boxes start unchecked).
  hideLengthDist: false,
  // Operator toggle (pitch map + stump map): hide the blue BOWLER header container,
  // leaving just the white figures card. Default FALSE → header shown.
  hideBowler: false,
  // Operator toggle (bowling analysis): show ONLY the blue bowler-name header, hiding the
  // white over/speed card under it. Default FALSE → full ticker.
  bowlerNameOnly: false,
  // Bowling-analysis ticker metric per ball: "speed" (km/h), "runs", "both", or "none".
  //   speed → values are km/h, label "SPEED(KPH)"
  //   runs  → values are runs,  label "RUNS"
  //   both  → speed + runs stacked, label "SPEED(KPH)" (speed label only)
  //   none  → no per-ball value AND no unit label under "Over"
  bowlingTickerMetric: "speed",
  // Pitch-map figures ticker config: which of the 5 default columns are hidden, plus any
  // CUSTOM columns the operator added (each { big, small }) shown on the right. Lets the
  // operator drop default stats (e.g. Maidens) and add their own number+label columns.
  pitchFigures: {
    hidden: { overs: false, maidens: false, runs: false, wickets: false, economy: false },
    custom: [], // [{ big: "50", small: "Target" }, …]
  },
  // Pitch-map "with runs" ticker: an editable BOWLER NAME (blue header; empty → the score
  // API bowler, else "BOWLER") and a free TEXT line for the white card. If the text is empty
  // the white card is hidden and only the blue bowler header shows. Operator-edited; mirrored
  // to the big screen on Send.
  pitchBowlerName: "", // override for the blue header (empty → API bowler)
  pitchNameKeepCase: false, // true → show the bowler name as typed (default: forced UPPERCASE)
  pitchTickerText: "RUNS - TONIGHT", // default white-card text (clear it to hide the card)
  pendingTrajectoryUrl: null, // Store trajectory URL while video plays
  pendingVideoUrl: null, // Store video URL while trajectory plays
  isVideoComplete: false, // Track if video has finished playing
  isTrajectoryComplete: false, // Track if trajectory has finished playing
  showTrajectoryPitchmap: false,
  showTrajectoryMidLine: true,
  circle_30_visibility: true, // show the inner 30-yard circle (matches the demo scene)
  isBattingDisplayBlacked: false, // Black overlay for batting display during bowling sessions
  showRunsOverlay: false,
  currentShotRuns: null,
  preReleaseDetails: {
    currentBall: null,
    totalBalls: null,
    timerStart: null,
  },
  flags: {
    bowlerSimulation: false,
    videoReplay: true,
    ballSimulation: false,
    statsOverlay: false,
    isTestBall: false,
    isPreRelease: false,
    isPreSlot: false,
    isSlotEnd: false,
  },
  pauseState: {
    isPaused: false,
    pauseParams: null,
    showResumeDialog: false,
    isTrayEmptyBallLoadingActive: false,
  },
  testBallState: {
    isTestBallActive: false,
    message: null,
    duration: null,
    currentBall: null,
    totalBalls: null,
    reason: null,
    attempt: null,
    maxAttempts: null,
    startTime: null,
  },
  testBallFailureState: {
    isTestBallFailureActive: false,
    message: null,
    attempt: null,
    maxAttempts: null,
  },
  ballLoading: null,
  displayUnits: "metric",
  preSlotTimerID: null,
  globalTimer: {
    duration: null, // Current timer duration (can be temporarily changed by resume)
    ballFrequency: null, // Original ball frequency from DISPLAY_START_INTERVAL
    isActive: false, // Whether timer is running
    isVisible: false, // Whether timer should be displayed (shown after session card is hidden)
    startTime: null, // When the timer started (timestamp)
  },
};

// Clears EVERY module's persistent visuals (bowling tubes, pitch/stump dots, swing,
// single/six). Each start* reducer calls this FIRST so starting (or sending) a new show
// never leaves the previous module's graphics on screen — then sets its own state.
function clearAllShowVisuals(state) {
  state.multiTrajectoryPlay = false;
  state.multiPaused = false;
  state.multiTubesOff = false;
  state.multiTrajectoryComplete = false;
  state.multiViewAngle = null;
  state.multiManualCam = false;
  state.accumulatedTrajectories = [];
  state.pitchMapActive = false;
  state.pitchMapPoints = [];
  state.showTrajectoryPitchmap = false;
  state.stumpMapActive = false;
  state.stumpMapPoints = [];
  state.interceptActive = false;
  state.interceptPoints = [];
  state.wagonActive = false;
  state.wagonLines = [];
  state.swingActive = false;
  state.swingArmed = false;
  state.swingPaused = false;
  state.trajectoryUrl = null;
  state.sixHighlight = false;
  state.sixPaused = false;
  state.sixViewAngle = null;
}

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setSessionTestBall: (state, action) => {
      // Don't interrupt any ball loading flow
      sessionSlice.caseReducers.resetSession(state);
      if (state.ballLoading !== null) {
        return;
      }
      state.animationType = "SessionTestBall";
      state.testBallDetails = action.payload;
      state.flags.isTestBall = true;
      state.flags.isPreRelease = false;
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    setPreRelease: (state, action) => {
      // Don't interrupt any ball loading flow
      if (state.ballLoading !== null) {
        return;
      }

      state.animationType = "PreRelease";
      state.preReleaseDetails = {
        currentBall: action.payload.currentBall || null,
        totalBalls: action.payload.totalBalls || null,
        timerStart: action.payload.timerStart || null,
      };
      state.flags.isPreRelease = true;
      state.flags.isTestBall = false;
      state.trajectoryUrl = null;
      state.videoUrl = null;
      // Keep global timer visible during pre-release (no longer hiding it)
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
      sessionSlice.caseReducers.resetSensorData(state);
    },

    resetPreRelease: (state) => {
      state.preReleaseDetails = {
        currentBall: null,
        totalBalls: null,
        timerStart: null,
      };
      state.flags.isPreRelease = false;
    },

    setUserWelcome: (state, action) => {
      state.animationType = "UserWelcome";
      state.userDetails = action.payload;
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    setSessionStartInterval: (state, action) => {
      // Don't interrupt any ball loading flow
      if (state.ballLoading !== null) {
        return;
      }
      sessionSlice.caseReducers.resetSession(state);
      state.animationType = "SessionStartInterval";
      state.sessionDetails = action.payload;
      state.isSessionCardShow = true;

      // Store the ball frequency for global timer (ballFrequency is in seconds)
      if (action.payload?.ballFrequency) {
        state.globalTimer.ballFrequency = action.payload.ballFrequency;
        state.globalTimer.duration = action.payload.ballFrequency;
      }

      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    resetSession: (state) => {
      state.sessionDetails = null;
      state.isSessionCardShow = false;
      state.pauseState = {
        isPaused: false,
        pauseParams: null,
        ballLoading: null,
        showResumeDialog: false,
        isTrayEmptyBallLoadingActive: false,
      };
      // Reset test ball and pre-release states
      state.testBallDetails = null;
      state.flags.isTestBall = false;
      state.preReleaseDetails = {
        currentBall: null,
        totalBalls: null,
        timerStart: null,
      };
      state.flags.isPreRelease = false;
      state.globalTimer.isVisible = false;
      sessionSlice.caseReducers.resetGlobalTimer(state);

      // Only remove black overlay if NOT in a bowling session
      if (state.sessionType !== "BOWLING_SESSION") {
        sessionSlice.caseReducers.removeBlackOverlay(state);
      }
    },

    setUpdateSession: (state, action) => {
      const p = action.payload;
      if (p.bowlerSimulation !== undefined)
        state.flags.bowlerSimulation = p.bowlerSimulation;
      if (p.videoReplay !== undefined) state.flags.videoReplay = p.videoReplay;
      if (p.ballSimulation !== undefined)
        state.flags.ballSimulation = p.ballSimulation;
      if (p.statsOverlay !== undefined)
        state.flags.statsOverlay = p.statsOverlay;
    },

    setVideoUrl: (state, action) => {
      // Don't interrupt any ball loading flow
      if (state.ballLoading !== null) {
        return;
      }
      const url = action.payload;

      // If videoReplay is disabled, skip video entirely and mark as complete
      // so trajectory can play immediately when setTrajectoryUrl is called
      if (!state.flags.videoReplay) {
        state.videoUrl = null;
        state.isVideoComplete = true; // Mark video as "complete" so trajectory doesn't wait
        sessionSlice.caseReducers.resetPreRelease(state);
        sessionSlice.caseReducers.resetTrajectoryOverlay(state);
        // If there's already a pending trajectory, activate it now
        if (state.pendingTrajectoryUrl) {
          sessionSlice.caseReducers.activatePendingTrajectory(state);
        }
        return;
      }

      // Check if trajectory is currently ACTIVE (playing, not complete)
      const isTrajectoryActive =
        state.trajectoryUrl !== null && !state.isTrajectoryComplete;

      if (isTrajectoryActive) {
        // Trajectory is still playing - store video as pending (even if invalid)
        // Validation will happen when trajectory completes and activates it
        state.pendingVideoUrl = url;
      } else {
        // No trajectory active - validate and play video immediately
        if (!isValidUrl(url)) {
          state.videoUrl = null;
          state.animationType = "NoVideo";
          sessionSlice.caseReducers.resetTrajectoryOverlay(state);
          sessionSlice.caseReducers.resetPreRelease(state);
          // Don't clear pendingTrajectoryUrl - it might be valid and waiting
          return;
        }

        // Clear any old trajectory URL (from previous ball)
        // Preserve pendingTrajectoryUrl - don't clear it as it might be part of this sequence
        state.trajectoryUrl = null;

        state.flags.videoReplay = true;
        state.animationType = "VideoPlayback";
        state.videoUrl = url;
        state.isVideoComplete = false; // Reset video completion flag
        state.isTrajectoryComplete = false; // Reset trajectory completion (starting new ball)
      }

      sessionSlice.caseReducers.resetPreRelease(state);
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    // Fully reset the video↔trajectory media pipeline so a DRS replay can
    // restart from a clean slate. Needed when a replay is re-run mid-flight
    // (e.g. the "0" reset pressed while the trajectory tube is animating):
    // otherwise the stale completion/pending flags mis-route the new video into
    // pendingVideoUrl (clearing videoUrl → black screen) and the unchanged
    // trajectoryUrl never re-triggers BowlingTrajectory's effects (old tube
    // keeps playing). Clearing the URLs first means the subsequent
    // setVideoUrl / setTrajectoryUrl behave exactly like a first-time replay.
    resetDrsMedia: (state) => {
      state.videoUrl = null;
      state.trajectoryUrl = null;
      state.pendingVideoUrl = null;
      state.pendingTrajectoryUrl = null;
      state.isVideoComplete = false;
      state.isTrajectoryComplete = false;
      state.animationType = "NoTrajectory";
    },

    resetTrajectoryUrl: (state) => {
      state.trajectoryUrl = null;
      state.sixPaused = false;
      state.sixHighlight = false;
      state.animationType = "NoTrajectory";
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    // Marks the current single play as a 6-Highlights six (drives the six camera +
    // labels + red/green tubes). Independent of the URL so it works in BOTH sample mode
    // (/highlights/…) and machine mode (the machine's own ball URL).
    setSixHighlight: (state, action) => {
      state.sixHighlight = !!action.payload;
      state.sixViewAngle = null; // new six → back to auto (main cam → side after landing)
    },
    // 6 Highlights camera view: "side" (key 1) | "main" (key 2) | null (auto).
    setSixViewAngle: (state, action) => {
      state.sixViewAngle = action.payload;
    },

    // Pause / resume the 6-Highlights batting trajectory + camera (Space).
    toggleSixPaused: (state) => {
      state.sixPaused = !state.sixPaused;
    },
    setSixPaused: (state, action) => {
      state.sixPaused = !!action.payload;
    },
    setSixRotateStadium: (state, action) => {
      state.sixRotateStadium = !!action.payload;
    },
    setSixShowAngle: (state, action) => {
      state.sixShowAngle = !!action.payload;
    },
    setSixShowSpeed: (state, action) => {
      state.sixShowSpeed = !!action.payload;
    },
    setSixRotateDeg: (state, action) => {
      const n = Number(action.payload);
      state.sixRotateDeg = Number.isFinite(n) ? n : 0;
    },

    setTrajectoryError: (state) => {
      state.trajectoryUrl = null;
      state.animationType = "NoTrajectory";
      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
    },

    setTrajectoryUrl: (state, action) => {
      // Don't interrupt any ball loading flow
      if (state.ballLoading !== null) {
        return;
      }
      state.sixPaused = false; // fresh play starts running
      const url = action.payload;

      // Check if video is currently ACTIVE (playing, not complete)
      const isVideoActive = state.videoUrl !== null && !state.isVideoComplete;

      if (isVideoActive) {
        // Video is still playing - store trajectory as pending (even if invalid)
        // Validation will happen when video completes and activates it
        state.pendingTrajectoryUrl = url;
        // Don't change animationType - let video play first
      } else {
        // No video active - validate and activate trajectory immediately
        if (!isValidUrl(url)) {
          state.trajectoryUrl = null;
          state.animationType = "NoTrajectory";
          sessionSlice.caseReducers.resetTrajectoryOverlay(state);
          sessionSlice.caseReducers.resetPreRelease(state);
          // Don't clear pendingVideoUrl - it might be valid and waiting
          return;
        }

        // Clear any old video URL (from previous ball)
        // Preserve pendingVideoUrl - don't clear it as it might be part of this sequence
        state.videoUrl = null;

        state.trajectoryUrl = url;
        state.animationType = "TrajectoryView";
        state.isTrajectoryComplete = false; // Reset trajectory completion flag
        state.isVideoComplete = false; // Reset video completion (starting new ball)
      }

      sessionSlice.caseReducers.resetTrajectoryOverlay(state);
      sessionSlice.caseReducers.resetPreRelease(state);
    },

    activatePendingTrajectory: (state) => {
      // Activate trajectory that was pending during video playback
      if (state.pendingTrajectoryUrl) {
        const url = state.pendingTrajectoryUrl;
        state.pendingTrajectoryUrl = null;

        // Validate the pending URL before activation
        if (!isValidUrl(url)) {
          state.trajectoryUrl = null;
          state.animationType = "NoTrajectory";
          sessionSlice.caseReducers.resetTrajectoryOverlay(state);
          return;
        }

        // URL is valid, activate trajectory
        state.trajectoryUrl = url;
        state.animationType = "TrajectoryView";
      }
    },

    activatePendingVideo: (state) => {
      // Activate video that was pending during trajectory playback
      if (state.pendingVideoUrl) {
        const url = state.pendingVideoUrl;
        state.pendingVideoUrl = null;

        // Validate the pending URL before activation
        if (!isValidUrl(url)) {
          state.videoUrl = null;
          state.animationType = "NoVideo";
          sessionSlice.caseReducers.resetTrajectoryOverlay(state);
          sessionSlice.caseReducers.resetPreRelease(state);
          return;
        }

        // URL is valid, activate video
        state.videoUrl = url;
        state.flags.videoReplay = true;
        state.animationType = "VideoPlayback";
        state.isVideoComplete = false; // Reset completion flag for new video
      }
    },

    setVideoComplete: (state) => {
      state.isVideoComplete = true;
      // Check if there's a pending trajectory to activate
      if (state.pendingTrajectoryUrl) {
        sessionSlice.caseReducers.activatePendingTrajectory(state);
      }
    },

    setTrajectoryComplete: (state) => {
      state.isTrajectoryComplete = true;
      // Check if there's a pending video to activate
      if (state.pendingVideoUrl) {
        sessionSlice.caseReducers.activatePendingVideo(state);
      }
    },

    setTrajectoryOverlay: (state, action) => {
      if (state.pauseState.isTrayEmptyBallLoadingActive) {
        return;
      }
      state.showTrajectoryPitchmap = action.payload;
      state.showTrajectoryMidLine = !action.payload;
    },
    resetTrajectoryOverlay: (state) => {
      if (state.pauseState.isTrayEmptyBallLoadingActive) {
        return;
      }
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = true;
    },
    resetSensorData: (state) => {
      state.sensorData = null;
    },

    setTrajectoryDetails: (state, action) => {
      state.actualTrajectoryDetails = action.payload;
    },
    setSlotEnd: (state) => {
      state.animationType = "SlotEnd";
      state.flags.isSlotEnd = true;

      // Clear the timer if it exists
      if (state.preSlotTimerID) {
        clearTimeout(state.preSlotTimerID);
        state.preSlotTimerID = null;
      }

      sessionSlice.caseReducers.resetSensorData(state);
      sessionSlice.caseReducers.removeBlackOverlay(state);
    },

    resetGlobalTimer: (state) => {
      state.globalTimer = {
        duration: null,
        ballFrequency: null,
        isActive: false,
        isVisible: false,
        startTime: null,
      };
    },

    resetAllSessionStates: (state) => {
      // Clear the preSlot timer if it exists
      if (state.preSlotTimerID) {
        clearTimeout(state.preSlotTimerID);
        state.preSlotTimerID = null;
      }

      state.animationType = "Default";
      state.userDetails = null;
      state.sessionDetails = null;
      state.testBallDetails = null;
      state.actualTrajectoryDetails = null;
      state.sensorData = null;
      state.videoUrl = null;
      state.trajectoryUrl = null;
      state.preReleaseDetails = {
        currentBall: null,
        totalBalls: null,
        timerStart: null,
      };
      state.flags = {
        bowlerSimulation: false,
        videoReplay: true,
        ballSimulation: false,
        statsOverlay: false,
        isTestBall: false,
        isPreRelease: false,
        isPreSlot: false,
        isSlotEnd: false,
      };
      state.pauseState = {
        isPaused: false,
        pauseParams: null,
        showResumeDialog: false,
        isTrayEmptyBallLoadingActive: false,
      };
      state.testBallState = {
        isTestBallActive: false,
        message: null,
        duration: null,
        currentBall: null,
        totalBalls: null,
        reason: null,
        attempt: null,
        maxAttempts: null,
        startTime: null,
      };
      state.testBallFailureState = {
        isTestBallFailureActive: false,
        message: null,
        attempt: null,
        maxAttempts: null,
      };
      state.ballLoading = null;
      sessionSlice.caseReducers.resetTrajectoryOverlay(state, false);
      sessionSlice.caseReducers.resetGlobalTimer(state);
      sessionSlice.caseReducers.removeBlackOverlay(state);
    },

    setSessionType: (state, action) => {
      state.sessionType = action.payload;
    },

    setSessionLogout: (state) => {
      sessionSlice.caseReducers.resetAllSessionStates(state);
      state.animationType = "Default";
      state.isSessionCardShow = false;
      sessionSlice.caseReducers.removeBlackOverlay(state);
    },

    removeBlackOverlay: (state) => {
      state.isBattingDisplayBlacked = false;
    },

    setCurrentShotFourRuns: (state) => {
      state.showRunsOverlay = true;
      state.currentShotRuns = 4;
    },

    setCurrentShotSixRuns: (state) => {
      state.showRunsOverlay = true;
      state.currentShotRuns = 6;
    },

    resetCurrentShotRuns: (state) => {
      state.showRunsOverlay = false;
      state.currentShotRuns = null;
    },

    // Accumulated trajectories for persistent display
    addAccumulatedTrajectory: (state, action) => {
      // action.payload should be { positions: [...], impactIndex: number }
      state.accumulatedTrajectories.push(action.payload);
    },

    clearAccumulatedTrajectories: (state) => {
      state.accumulatedTrajectories = [];
      state.multiTrajectoryPlay = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
    },

    // Show the over pitch-map: bounce dots over the length zones, no tubes.
    // Swing Analysis: show one ball's trajectory (release → impact). Mutually
    // exclusive with the other views.
    startSwing: (state, action) => {
      clearAllShowVisuals(state); // clear any previous module's visuals first
      const { innings, over, ball, armed } = action.payload || {};
      state.swingActive = true;
      state.swingArmed = !!armed; // armed → hold the flight until Play (big-screen cue)
      state.swingPaused = false; // fresh play starts running
      state.swingSel = { innings, over, ball };
      state.swingToken += 1;
      state.swingInteractive = false; // scripted flight owns the camera until it settles
      state.swingViewAngle = null;
      state.swingViewToken = 0;
      // Stand down the other modes + the idle camera.
      state.multiTrajectoryPlay = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
      state.accumulatedTrajectories = [];
      state.trajectoryUrl = null;
      state.animationType = "TrajectoryView";
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = false;
    },
    clearSwing: (state) => {
      state.swingActive = false;
      state.swingArmed = false;
      state.swingPaused = false;
      state.swingSel = null;
      state.swingInteractive = false;
    },
    // Release a cued (armed) swing → run the flight. Play presses this on the big screen.
    setSwingArmed: (state, action) => {
      state.swingArmed = !!action.payload;
    },
    // Pause / resume the swing flight (Space).
    toggleSwingPaused: (state) => {
      state.swingPaused = !state.swingPaused;
    },
    setSwingPaused: (state, action) => {
      state.swingPaused = !!action.payload;
    },
    setSwingInteractive: (state, action) => {
      state.swingInteractive = !!action.payload;
    },
    setSwingViewAngle: (state, action) => {
      state.swingViewAngle = action.payload;
      state.swingViewToken = (state.swingViewToken || 0) + 1;
      state.swingInteractive = false; // new scripted move → take control back until settle
    },
    setSwingTurnDeg: (state, action) => {
      state.swingTurnDeg = action.payload;
    },
    setSwingSwingDeg: (state, action) => {
      state.swingSwingDeg = action.payload;
    },
    setSwingBowlerType: (state, action) => {
      state.swingBowlerType = action.payload === "seam" ? "seam" : "spin";
    },

    startPitchMap: (state, action) => {
      clearAllShowVisuals(state); // clear any previous module's visuals first
      state.pitchMapPoints = action.payload || [];
      state.pitchMapActive = true;
      state.pitchMapStandalone = false; // default (bowling-combine); standalone sets true
      state.pitchMapView = null;
      state.pitchMapSession += 1; // new session → camera entry runs once
      state.pitchMapInteractive = false; // scripted move owns the camera until settle
      state.swingActive = false; // mutually exclusive with swing analysis
      // Mutually exclusive with the animated multi-ball play / single ball.
      state.multiTrajectoryPlay = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.accumulatedTrajectories = [];
      state.trajectoryUrl = null;
      // Park animationType so the idle camera (CameraHandler) stands down and
      // no details/NoTrajectory overlay shows; reveal the pitch length zones.
      state.animationType = "TrajectoryView";
      state.showTrajectoryPitchmap = true;
      // Show the centre LBW strip down the pitch for the pitch-mapping view.
      state.showTrajectoryMidLine = true;
    },

    setPitchGlow: (state, action) => {
      state.pitchGlow = { ...state.pitchGlow, ...action.payload };
    },
    setStumpGlow: (state, action) => {
      state.stumpGlow = { ...state.stumpGlow, ...action.payload };
    },

    // Fake pitch-map balls (operator-placed). setPitchFakeBalls replaces the whole list
    // (used by the big-screen mirror); add/remove/clear are the operator edits.
    setPitchFakeBalls: (state, action) => {
      state.pitchFakeBalls = Array.isArray(action.payload) ? action.payload : [];
    },
    addPitchFakeBall: (state, action) => {
      state.pitchFakeBalls = [...state.pitchFakeBalls, action.payload];
    },
    removePitchFakeBall: (state, action) => {
      state.pitchFakeBalls = state.pitchFakeBalls.filter((b) => b.id !== action.payload);
    },
    clearPitchFakeBalls: (state) => {
      state.pitchFakeBalls = [];
    },
    setBowlingPitchHideNumber: (state, action) => {
      state.bowlingPitchHideNumber = !!action.payload;
    },

    clearPitchMap: (state) => {
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
      state.pitchMapView = null;
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = true;
    },

    // Select the pitch-map review camera ("top" = slow move to top-down).
    setPitchMapView: (state, action) => {
      state.pitchMapView = action.payload;
      state.pitchMapInteractive = false; // re-take control until the new move settles
    },

    // Pitch-map dot label style: "runs" | "ball" (colour stays by outcome).
    setPitchDotStyle: (state, action) => {
      state.pitchDotStyle = action.payload === "ball" ? "ball" : "runs";
    },

    // MultiPitchMap flips this true once a camera move settles → OrbitControls on.
    setPitchMapInteractive: (state, action) => {
      state.pitchMapInteractive = !!action.payload;
    },

    // Append dots as they stream in (one over at a time) WITHOUT resetting the
    // camera — the pitch fills progressively instead of waiting for every ball.
    addPitchMapPoints: (state, action) => {
      const add = action.payload || [];
      if (add.length) state.pitchMapPoints = state.pitchMapPoints.concat(add);
    },

    // ── STUMP MAP (mirror of the pitch-map reducers) ──────────────────────────
    startStumpMap: (state, action) => {
      clearAllShowVisuals(state); // clear any previous module's visuals first
      state.stumpMapPoints = action.payload || [];
      state.stumpMapActive = true;
      state.stumpMapSession += 1;
      state.stumpMapInteractive = false;
      // Mutually exclusive with the other shows.
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
      state.swingActive = false;
      state.multiTrajectoryPlay = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.accumulatedTrajectories = [];
      state.trajectoryUrl = null;
      state.animationType = "TrajectoryView";
      // Stumps view: no pitch length zones; keep the LBW strip / crease lines.
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = true;
    },
    addStumpMapPoints: (state, action) => {
      const add = action.payload || [];
      if (add.length) state.stumpMapPoints = state.stumpMapPoints.concat(add);
    },
    setStumpMapDrop: (state, action) => {
      state.stumpMapDrop = !!action.payload;
    },
    setStumpMapInteractive: (state, action) => {
      state.stumpMapInteractive = !!action.payload;
    },
    setStumpMapStyle: (state, action) => {
      state.stumpMapStyle = action.payload === "ball" ? "ball" : "runs";
    },
    setStumpBowlerName: (state, action) => {
      state.stumpBowlerName = action.payload ?? "";
    },
    setBallCategories: (state, action) => {
      state.ballCategories = { ...state.ballCategories, ...(action.payload || {}) };
    },
    clearStumpMap: (state) => {
      state.stumpMapActive = false;
      state.stumpMapPoints = [];
    },

    // ── INTERCEPTION MAP (mirror of the stump-map reducers) ───────────────────
    startIntercept: (state, action) => {
      clearAllShowVisuals(state);
      state.interceptPoints = action.payload || [];
      state.interceptActive = true;
      state.interceptSession += 1;
      state.interceptInteractive = false;
      state.animationType = "TrajectoryView";
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = true;
    },
    addInterceptPoints: (state, action) => {
      const add = action.payload || [];
      if (add.length) state.interceptPoints = state.interceptPoints.concat(add);
    },
    setInterceptInteractive: (state, action) => {
      state.interceptInteractive = !!action.payload;
    },
    setInterceptStyle: (state, action) => {
      state.interceptStyle = action.payload === "runs" ? "runs" : "ball";
    },
    setInterceptName: (state, action) => {
      state.interceptName = action.payload ?? "";
    },
    setInterceptNameKeepCase: (state, action) => {
      state.interceptNameKeepCase = !!action.payload;
    },
    clearIntercept: (state) => {
      state.interceptActive = false;
      state.interceptPoints = [];
    },

    // ── WAGON WHEEL (mirror of the stump-map reducers) ────────────────────────
    startWagon: (state, action) => {
      clearAllShowVisuals(state); // clear any previous module's visuals first
      state.wagonLines = action.payload || [];
      state.wagonActive = true;
      state.wagonSession += 1;
      state.wagonInteractive = false;
      state.animationType = "TrajectoryView";
      // Top-down ground view: no pitch length zones, no LBW strip.
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = false;
    },
    addWagonLines: (state, action) => {
      const add = action.payload || [];
      if (add.length) state.wagonLines = state.wagonLines.concat(add);
    },
    setWagonInteractive: (state, action) => {
      state.wagonInteractive = !!action.payload;
    },
    setWagonReveal: (state, action) => {
      state.wagonReveal = action.payload === "together" ? "together" : "sequential";
    },
    setWagonDuration: (state, action) => {
      const n = Number(action.payload);
      // Total seconds for the whole set; clamp to a sane watchable range.
      state.wagonDuration = Number.isFinite(n) ? Math.min(60, Math.max(0.5, n)) : 5;
    },
    setWagonSweep: (state, action) => {
      state.wagonSweep = action.payload === "ccw" ? "ccw" : "cw";
    },
    setWagonStyle: (state, action) => {
      state.wagonStyle = action.payload === "line" ? "line" : "actual";
    },
    setWagonBatterName: (state, action) => {
      state.wagonBatterName = action.payload ?? "";
    },
    setWagonBatHand: (state, action) => {
      state.wagonBatHand = action.payload === "L" ? "L" : "R";
    },
    setWagonNameKeepCase: (state, action) => {
      state.wagonNameKeepCase = !!action.payload;
    },
    setWagonOutcomes: (state, action) => {
      const { fours, sixes } = action.payload || {};
      if (fours !== undefined) state.wagonFours = !!fours;
      if (sixes !== undefined) state.wagonSixes = !!sixes;
    },
    setWagonHideCard: (state, action) => {
      state.wagonHideCard = !!action.payload;
    },
    setWagonHideName: (state, action) => {
      state.wagonHideName = !!action.payload;
    },
    clearWagon: (state) => {
      state.wagonActive = false;
      state.wagonLines = [];
    },

    // Begin animated playback of every accumulated trajectory at once.
    // Uses the same "TrajectoryView" mode as the single ball so the idle camera
    // (CameraHandler) stands down and the trajectory camera move takes over.
    // trajectoryUrl stays null, so the single-ball player (BowlingTrajectory)
    // and the details card — both of which require a URL — do not appear.
    startMultiTrajectoryPlay: (state, action) => {
      clearAllShowVisuals(state); // clear any previous module's visuals first
      state.multiTrajectoryPlay = true;
      state.multiPlayMode =
        action.payload === "simultaneous" ? "simultaneous" : "chronological";
      // Loaded but NOT playing yet — the operator presses Play/Space to start.
      state.multiPlayStarted = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiSeqActive = -1; // ticker chips hidden until the intro reveals them
      state.multiViewAngle = null;
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
      state.pitchMapView = null;
      state.trajectoryUrl = null;
      state.animationType = "TrajectoryView";
      // Hide the pitch length zones left on by the pitch map, and the dark centre
      // strip (pitch_mid_line) — the bowling analysis shows a clean pitch.
      state.showTrajectoryPitchmap = false;
      state.showTrajectoryMidLine = false;
    },

    // Begin (or restart) the multi-ball animation — Play button / Space key.
    beginMultiPlayback: (state) => {
      state.multiPlayStarted = true;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.multiInteractive = false; // playing → script owns the camera
      state.multiManualCam = false; // new play → cinematic camera, not manual
      state.swingActive = false; // mutually exclusive with swing analysis
      state.multiReplayToken += 1; // restart the timeline from the top
    },

    // Pause/resume the running multi-ball playback IN PLACE (Space while playing).
    // Freezes the single elapsed-time clock in MultiBowlingTrajectory, so balls,
    // tubes AND camera all hold; resuming continues from exactly where it stopped.
    toggleMultiPaused: (state) => {
      state.multiPaused = !state.multiPaused;
      if (!state.multiPaused) state.multiInteractive = false; // resumed → script owns
    },
    setMultiPaused: (state, action) => {
      state.multiPaused = !!action.payload;
      if (!state.multiPaused) state.multiInteractive = false;
    },
    // Set by the camera controllers once a move settles → OrbitControls take over.
    setMultiInteractive: (state, action) => {
      state.multiInteractive = !!action.payload;
    },
    // Pitch map dots: drop-from-top (true, all-together) vs pop (false, one-by-one).
    setPitchMapDrop: (state, action) => {
      state.pitchMapDrop = !!action.payload;
    },
    // Option B: the operator grabbed the camera (orbited) → keep it manual.
    setMultiManualCam: (state, action) => {
      state.multiManualCam = !!action.payload;
    },
    // Sequential intro progress → drives the ticker's one-by-one chip reveal.
    setMultiSeqActive: (state, action) => {
      state.multiSeqActive = action.payload;
    },
    // PiP/compact profile — the single global switch (set by BroadcastApp on resize).
    setCompact: (state, action) => {
      state.compact = !!action.payload;
    },
    // Day/Night scene mode ("day" | "night").
    setScene: (state, action) => {
      state.scene = action.payload === "night" ? "night" : "day";
    },
    // STANDALONE pitch mapping → its own top-view flat-dot renderer + bowler-figures
    // ticker. Set true by the standalone Pitch mode only; bowling-combine stays false.
    setPitchMapStandalone: (state, action) => {
      state.pitchMapStandalone = !!action.payload;
    },
    // Playback mode: whether Space can pause/resume mid-flight (true) or the over
    // just plays straight through (false). Set from the Review Setup toggle.
    setMultiPausable: (state, action) => {
      state.multiPausable = action.payload !== false;
    },
    // Bowling-analysis playback options: trajectory length (afterImpact|full),
    // whether to advance to the pitch map after the over (combinePitchMap), and
    // Automatic mode (auto-play + auto-advance). Set at Start from the operator UI.
    setMultiPlaybackOpts: (state, action) => {
      const o = action.payload || {};
      if (o.trajLen) state.multiTrajLen = o.trajLen === "full" ? "full" : "afterImpact";
      if (o.combinePitchMap !== undefined)
        state.multiCombinePitchMap = !!o.combinePitchMap;
      if (o.autoPlay !== undefined) state.multiAutoPlay = !!o.autoPlay;
    },
    // Post-play: hide the trajectory tubes, keep only the balls resting in place.
    setMultiTubesOff: (state, action) => {
      state.multiTubesOff = !!action.payload;
    },
    // Bowling-analysis playback camera preset (operator "Camera view" selector).
    setMultiCameraView: (state, action) => {
      state.multiCameraView = Number(action.payload) || 0;
    },

    // Hide / show the broadcast ticker (bowling analysis + pitch map).
    setHideTicker: (state, action) => {
      state.hideTicker = !!action.payload;
    },

    // Hide / show the LENGTH DISTRIBUTION % chips (pitch map) — independent of the ticker.
    setHideLengthDist: (state, action) => {
      state.hideLengthDist = !!action.payload;
    },
    // Hide / show the blue BOWLER header container (pitch map + stump map).
    setHideBowler: (state, action) => {
      state.hideBowler = !!action.payload;
    },
    // Bowling ticker: show only the bowler-name header (no over/speed card).
    setBowlerNameOnly: (state, action) => {
      state.bowlerNameOnly = !!action.payload;
    },
    setBowlingTickerMetric: (state, action) => {
      const v = action.payload;
      state.bowlingTickerMetric =
        v === "runs" || v === "both" || v === "none" ? v : "speed";
    },
    // Replace the whole pitch-map figures config ({ hidden, custom }). One setter so the
    // operator UI and the cross-tab sync both go through it.
    setPitchFigures: (state, action) => {
      const p = action.payload || {};
      state.pitchFigures = {
        hidden: p.hidden || {},
        custom: Array.isArray(p.custom) ? p.custom : [],
      };
    },
    // Pitch-map bowler type (seamers | spinners) → the length-zone set.
    setPitchBowlerType: (state, action) => {
      state.pitchBowlerType = action.payload === "spinners" ? "spinners" : "seamers";
    },
    // Pitch-map ticker: editable bowler-name header + free white-card text.
    setPitchBowlerName: (state, action) => {
      state.pitchBowlerName = action.payload ?? "";
    },
    setPitchNameKeepCase: (state, action) => {
      state.pitchNameKeepCase = !!action.payload;
    },
    setPitchTickerText: (state, action) => {
      state.pitchTickerText = action.payload ?? "";
    },

    // Marked true by MultiBowlingTrajectory once every ball finishes; enables
    // the 1-5 review-angle keys.
    setMultiTrajectoryComplete: (state, action) => {
      state.multiTrajectoryComplete = action.payload;
    },

    // Selected review angle for the multi-ball playback (set by keys 1-5). The
    // token bumps every press so re-selecting the SAME angle re-applies it.
    setMultiViewAngle: (state, action) => {
      state.multiViewAngle = action.payload;
      state.multiViewToken = (state.multiViewToken || 0) + 1;
      state.multiInteractive = false; // new scripted camera move → take control back
      state.multiManualCam = false; // a key reclaims the cinematic/scripted camera
    },

    // Reset the multi-ball animation to its initial (armed) state and STAY
    // there (key 0) — Play/Space then starts it again.
    replayMultiTrajectory: (state) => {
      state.multiViewAngle = null;
      state.multiTrajectoryComplete = false;
      state.multiPlayStarted = false;
      state.multiPaused = false;
      state.multiTubesOff = false;
      state.multiReplayToken += 1;
    },
  },

  extraReducers: (builder) => {
    // Starting DRS must clear the multi-ball trajectory + pitch-map views so
    // they don't render on top of the DRS replay.
    builder.addCase(startDrs, (state) => {
      state.multiTrajectoryPlay = false;
      state.multiTrajectoryComplete = false;
      state.multiViewAngle = null;
      state.accumulatedTrajectories = [];
      state.pitchMapActive = false;
      state.pitchMapPoints = [];
      state.pitchMapView = null;
    });
  },
});

export const {
  setPitchFakeBalls,
  addPitchFakeBall,
  removePitchFakeBall,
  clearPitchFakeBalls,
  setBowlingPitchHideNumber,
  setUserWelcome,
  setSessionStartInterval,
  setSessionTestBall,
  setPreRelease,
  resetPreRelease,
  setVideoUrl,
  setTrajectoryUrl,
  setSixHighlight,
  setSixViewAngle,
  toggleSixPaused,
  setSixPaused,
  setSixRotateStadium,
  setSixRotateDeg,
  setSixShowAngle,
  setSixShowSpeed,
  activatePendingTrajectory,
  activatePendingVideo,
  setVideoComplete,
  setTrajectoryComplete,
  resetSession,
  setSlotEnd,
  resetAllSessionStates,
  setTrajectoryDetails,
  setUpdateSession,
  setSessionType,
  setTrajectoryOverlay,
  setSessionLogout,
  resetTrajectoryOverlay,
  resetDrsMedia,
  resetGlobalTimer,
  removeBlackOverlay,
  resetTrajectoryUrl,
  setTrajectoryError,
  setCurrentShotFourRuns,
  setCurrentShotSixRuns,
  resetCurrentShotRuns,
  addAccumulatedTrajectory,
  clearAccumulatedTrajectories,
  startMultiTrajectoryPlay,
  beginMultiPlayback,
  toggleMultiPaused,
  setMultiPaused,
  setMultiPausable,
  setMultiPlaybackOpts,
  setMultiInteractive,
  setMultiManualCam,
  setMultiSeqActive,
  setCompact,
  setScene,
  setPitchMapStandalone,
  setPitchMapDrop,
  startSwing,
  setSwingArmed,
  toggleSwingPaused,
  setSwingPaused,
  setSwingInteractive,
  setSwingViewAngle,
  setSwingTurnDeg,
  setSwingSwingDeg,
  setSwingBowlerType,
  clearSwing,
  setMultiTubesOff,
  setMultiCameraView,
  setHideTicker,
  setHideLengthDist,
  setHideBowler,
  setBowlerNameOnly,
  setBowlingTickerMetric,
  setPitchFigures,
  setPitchBowlerType,
  setPitchBowlerName,
  setPitchNameKeepCase,
  setPitchTickerText,
  setMultiTrajectoryComplete,
  setMultiViewAngle,
  replayMultiTrajectory,
  startPitchMap,
  clearPitchMap,
  setPitchMapView,
  setPitchDotStyle,
  setPitchMapInteractive,
  addPitchMapPoints,
  startStumpMap,
  addStumpMapPoints,
  setStumpBowlerName,
  setBallCategories,
  setStumpMapDrop,
  setStumpMapInteractive,
  setStumpMapStyle,
  clearStumpMap,
  startIntercept,
  addInterceptPoints,
  setInterceptInteractive,
  setInterceptStyle,
  setInterceptName,
  setInterceptNameKeepCase,
  clearIntercept,
  startWagon,
  addWagonLines,
  setWagonInteractive,
  setWagonReveal,
  setWagonDuration,
  setWagonSweep,
  setWagonStyle,
  setWagonBatterName,
  setWagonBatHand,
  setWagonNameKeepCase,
  setWagonOutcomes,
  setWagonHideCard,
  setWagonHideName,
  clearWagon,
  setPitchGlow,
  setStumpGlow,
} = sessionSlice.actions;

// Fake ball kind → the outcome fields the pitch-map dots read (runs / isWicket / outcome).
function fakeBallPoint(b) {
  const runs = b.kind === "four" ? 4 : b.kind === "six" ? 6 : b.kind === "wicket" ? 0 : Number(b.kind) || 0;
  const isWicket = b.kind === "wicket";
  const outcome = isWicket ? "wicket" : b.kind === "four" || b.kind === "six" ? b.kind : runs > 0 ? "runs" : "dot";
  return { x: Number(b.x) || 0, y: 0, z: Number(b.z) || 0, ballNo: null, runs, isWicket, outcome, fake: true };
}

// Pitch-map points INCLUDING the operator's fake balls (standalone pitch map only — never
// the bowling-analysis combine). Fakes go FIRST so real balls streaming in append after
// them without shifting the fakes' indices (the drop-in animation is index-keyed).
export const selectPitchMapPoints = createSelector(
  [
    (s) => s.session.pitchMapPoints,
    (s) => s.session.pitchFakeBalls,
    (s) => s.session.pitchMapStandalone,
  ],
  (points, fakes, standalone) =>
    standalone && fakes?.length ? [...fakes.map(fakeBallPoint), ...points] : points,
);

export default sessionSlice.reducer;
