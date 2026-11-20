import { createSlice } from "@reduxjs/toolkit";

// phases: idle | loading | operatorInput | video | paused | trajectory | review
const initialState = {
  active: false,
  phase: "idle",
  folderUrl: null,
  virtualCamera: null,
  lastBallWorldPos: null,
  // Video frame numbers (from ball_coords.json): `start` = where playback begins
  // (bowling/release frame); `pitching`/`impact` = when those markers appear.
  videoFrames: { pitching: null, impact: null, start: null },
  // 3D world positions (meters) for the two markers — derived from
  // trajectory_data.json in BowlingTrajectory.
  markerPositions: { pitching: null, impact: null },
  // Visibility toggles flipped on by DrsVideoLayer when the video crosses the
  // corresponding frame threshold.
  markers: { pitching: false, impact: false },
  // Selected review-phase camera angle: "side" | "top" | "behind" | "front" | null
  viewAngle: null,
  viewAngleToken: 0, // bumps each angle press so the same angle re-applies
  // Decision matrix from ballMeta.decisions, keyed by 3-char binary string
  // (softSignal + originalDecision==='OUT' + isRightHanded).
  decisions: null,
  // Operator-supplied inputs collected before the replay starts.
  operatorInput: null,
  // Decision row picked from `decisions` based on operatorInput.
  selectedDecision: null,
  // Whether the bowling-trajectory picker popup (opened with "A") is visible.
  trajectoryPickerOpen: false,
  // When true, the DRS video is held at the first frame (cued, not playing).
  paused: false,
  // When true, the operator paused the review mid-playback (Space) → the video, the
  // 3D trajectory and the camera all freeze, and OrbitControls take over (zoom/pan).
  reviewPaused: false,
  // When true, a camera-angle move has SETTLED → the script stops driving the camera
  // and OrbitControls take over so the operator can zoom/pan/tilt on that view. A new
  // key (setDrsViewAngle) clears it so the next scripted move runs.
  reviewInteractive: false,
  // When true this is a NO-BALL check (reuses the DRS replay) — the OUT/NOT-OUT
  // decision panels are hidden; only the video + ball tracking are shown.
  noBall: false,
  // Operator toggle: show the broadcast VIDEO overlay during the replay. true (default) =
  // video plays then hands off to the 3D review; false = skip the video, show the 3D DRS
  // (ball tracking + review) only.
  withVideo: true,
  // Camera angle to apply automatically once the replay reaches "review"
  // (operator-selected in the panel). null = stay on the default DRS pose.
  pendingViewAngle: null,
  // Which physical camera feed this replay uses, as a numeric index string
  // ("0", "1", …). Selects the video (<index>.mp4) and, via ball_coords, the
  // matching calibration + projection matrix for the folder.
  camera: "0",
  // Available camera index strings for this ball (e.g. ["0","1","2"]), derived
  // from ball_coords in drsReplay. Bounds the number-key camera switching.
  cameras: [],
  // True once the delivery video's first frame is decoded and ready — used to
  // hide the loader and reveal the video only when everything is ready.
  videoStarted: false,
  // Rule-driven plan for what the review shows (trajectory mode, camera, markers,
  // panels) — resolved from public/config/drs-review-rules.json. null = show all.
  reviewPlan: null,
  // No-ball HEIGHT check: the ball's 3D world position (metres) where the trajectory
  // reaches the popping crease (raw z ≤ 120 cm). `{x,y,z}` — y is the ball height.
  // Computed in BowlingTrajectory; the height scale + verdict overlays read it.
  creasePos: null,
};

const drsSlice = createSlice({
  name: "drs",
  initialState,
  reducers: {
    startDrs: (state, action) => {
      state.active = true;
      state.phase = "loading";
      state.folderUrl = action.payload;
      state.virtualCamera = null;
      state.lastBallWorldPos = null;
      state.videoFrames = { pitching: null, impact: null, start: null };
      state.markerPositions = { pitching: null, impact: null };
      state.markers = { pitching: false, impact: false };
      state.viewAngle = null;
      state.decisions = null;
      state.operatorInput = null;
      state.selectedDecision = null;
      state.paused = false;
      state.reviewPaused = false;
      state.reviewInteractive = false;
      state.noBall = false;
      state.pendingViewAngle = null;
      state.camera = "0";
      state.cameras = [];
      state.videoStarted = false;
      state.reviewPlan = null;
      state.creasePos = null;
    },
    setDrsVideoStarted: (state, action) => {
      state.videoStarted = !!action.payload;
    },
    setDrsCreasePos: (state, action) => {
      state.creasePos = action.payload;
    },
    setDrsReviewPlan: (state, action) => {
      state.reviewPlan = action.payload;
    },
    setDrsVirtualCamera: (state, action) => {
      state.virtualCamera = action.payload;
    },
    setDrsPhase: (state, action) => {
      state.phase = action.payload;
    },
    setDrsLastBallPos: (state, action) => {
      state.lastBallWorldPos = action.payload;
    },
    setDrsVideoFrames: (state, action) => {
      state.videoFrames = {
        pitching: action.payload.pitching ?? null,
        impact: action.payload.impact ?? null,
        start: action.payload.start ?? null,
        file: action.payload.file ?? null, // resolved video filename (trimmed or full)
      };
    },
    setDrsMarkerPositions: (state, action) => {
      state.markerPositions = {
        pitching: action.payload.pitching ?? null,
        impact: action.payload.impact ?? null,
      };
    },
    setDrsMarkerVisibility: (state, action) => {
      state.markers = { ...state.markers, ...action.payload };
    },
    setDrsViewAngle: (state, action) => {
      state.viewAngle = action.payload;
      state.viewAngleToken = (state.viewAngleToken || 0) + 1;
      state.reviewInteractive = false; // new scripted move → take control back
    },
    setDrsPaused: (state, action) => {
      state.paused = action.payload;
    },
    setDrsReviewPaused: (state, action) => {
      state.reviewPaused = !!action.payload;
    },
    toggleDrsReviewPaused: (state) => {
      state.reviewPaused = !state.reviewPaused;
    },
    setDrsReviewInteractive: (state, action) => {
      state.reviewInteractive = !!action.payload;
    },
    setDrsNoBall: (state, action) => {
      state.noBall = !!action.payload;
    },
    // Toggle the video overlay for the DRS replay (operator checkbox).
    setDrsWithVideo: (state, action) => {
      state.withVideo = !!action.payload;
    },
    setDrsPendingViewAngle: (state, action) => {
      state.pendingViewAngle = action.payload;
    },
    setDrsCamera: (state, action) => {
      state.camera = action.payload == null ? "0" : String(action.payload);
    },
    setDrsCameras: (state, action) => {
      state.cameras = Array.isArray(action.payload)
        ? action.payload.map(String)
        : [];
    },
    setDrsDecisions: (state, action) => {
      state.decisions = action.payload;
    },
    setDrsOperatorInput: (state, action) => {
      state.operatorInput = action.payload;
    },
    setDrsSelectedDecision: (state, action) => {
      state.selectedDecision = action.payload;
    },
    setTrajectoryPickerOpen: (state, action) => {
      state.trajectoryPickerOpen = action.payload;
    },
    toggleTrajectoryPicker: (state) => {
      state.trajectoryPickerOpen = !state.trajectoryPickerOpen;
    },
    endDrs: (state) => {
      state.active = false;
      state.phase = "idle";
      state.folderUrl = null;
      state.virtualCamera = null;
      state.lastBallWorldPos = null;
      state.videoFrames = { pitching: null, impact: null, start: null };
      state.markerPositions = { pitching: null, impact: null };
      state.markers = { pitching: false, impact: false };
      state.viewAngle = null;
      state.decisions = null;
      state.operatorInput = null;
      state.selectedDecision = null;
      state.paused = false;
      state.reviewPaused = false;
      state.reviewInteractive = false;
      state.noBall = false;
      state.pendingViewAngle = null;
      state.camera = "0";
      state.cameras = [];
      state.videoStarted = false;
      state.reviewPlan = null;
      state.creasePos = null;
    },
  },
});

export const {
  startDrs,
  setDrsVideoStarted,
  setDrsReviewPlan,
  setDrsCreasePos,
  setDrsVirtualCamera,
  setDrsPhase,
  setDrsLastBallPos,
  setDrsVideoFrames,
  setDrsMarkerPositions,
  setDrsMarkerVisibility,
  setDrsViewAngle,
  setDrsPaused,
  setDrsReviewPaused,
  toggleDrsReviewPaused,
  setDrsReviewInteractive,
  setDrsNoBall,
  setDrsWithVideo,
  setDrsPendingViewAngle,
  setDrsCamera,
  setDrsCameras,
  setDrsDecisions,
  setDrsOperatorInput,
  setDrsSelectedDecision,
  setTrajectoryPickerOpen,
  toggleTrajectoryPicker,
  endDrs,
} = drsSlice.actions;

export default drsSlice.reducer;
