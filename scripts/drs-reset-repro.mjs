// One-off reproduction for the DRS "0" reset bug:
//   Pressing 0 while the trajectory tube is animating left the screen black
//   with the old tube still playing.
//
// Root cause: restarting a DRS replay only reset the `drs` slice; the `session`
// media state-machine (videoUrl / trajectoryUrl / pending* / *Complete) was
// stale, so re-submitting the SAME urls mid-trajectory routed the video into
// pendingVideoUrl (clearing videoUrl → black) and reused the identical
// trajectoryUrl (BowlingTrajectory effects never re-fire → old tube keeps
// playing).
//
// Run: node scripts/drs-reset-repro.mjs
import reducer, {
  setVideoUrl,
  setTrajectoryUrl,
  setVideoComplete,
  resetDrsMedia,
} from "../src/store/slices/sessionSlice.js";

const MP4 = "/Sample_folder/1/orig_left.mp4";
const TRAJ = "/Sample_folder/1/trajectory_data.json";

// Drive the reducer to the state that exists WHILE the trajectory is animating
// mid-DRS: video played to completion, trajectory active but not yet complete.
function midTrajectoryState() {
  let s = reducer(undefined, { type: "@@init" });
  s = reducer(s, setVideoUrl(MP4)); // video starts (VideoPlayback)
  s = reducer(s, setTrajectoryUrl(TRAJ)); // trajectory pends behind the video
  s = reducer(s, setVideoComplete()); // video done → trajectory activates
  return s; // animationType === "TrajectoryView", isTrajectoryComplete === false
}

let pass = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) pass = false;
};

// --- Reproduce the BUG: resubmit the same urls WITHOUT resetting media ---
{
  let s = midTrajectoryState();
  s = reducer(s, setVideoUrl(MP4));
  s = reducer(s, setTrajectoryUrl(TRAJ));
  console.log("\n[without fix] resubmit mid-trajectory:");
  console.log("  videoUrl:", s.videoUrl, "| animationType:", s.animationType);
  // This documents the broken behaviour (video lost → black screen).
  check("bug reproduced: videoUrl is null (black screen)", s.videoUrl === null);
}

// --- Verify the FIX: resetDrsMedia() before resubmitting the same urls ---
{
  let s = midTrajectoryState();
  s = reducer(s, resetDrsMedia()); // <-- the fix, dispatched in drsReplay()
  // After the reset a render happens (network awaits in drsReplay), then the
  // urls are set again by drsSubmitOperatorInput:
  s = reducer(s, setVideoUrl(MP4));
  s = reducer(s, setTrajectoryUrl(TRAJ));
  console.log("\n[with fix] resetDrsMedia then resubmit:");
  console.log("  videoUrl:", s.videoUrl, "| animationType:", s.animationType);
  check("video plays again (videoUrl set)", s.videoUrl === MP4);
  check("animationType is VideoPlayback", s.animationType === "VideoPlayback");
  check("trajectory pends behind video", s.pendingTrajectoryUrl === TRAJ);
  check("no stale completion flags", s.isVideoComplete === false);
}

console.log(`\n${pass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
process.exit(pass ? 0 : 1);
