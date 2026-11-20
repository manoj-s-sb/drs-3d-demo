import { createSlice } from "@reduxjs/toolkit";
import {
  setUserWelcome,
  setSessionStartInterval,
  setSessionTestBall,
  setPreRelease,
  setTrajectoryUrl,
  setVideoUrl,
  setSlotEnd,
  setSessionLogout,
  setCurrentShotFourRuns,
  setCurrentShotSixRuns,
  resetCurrentShotRuns,
  startMultiTrajectoryPlay,
  startPitchMap,
} from "./sessionSlice";

const initialState = {
  groundCamera: { isPlaying: false, triggerId: 0 },
  userBoardCamera: { isPlaying: false, triggerId: 0 },
};

const animationSlice = createSlice({
  name: "animation",
  initialState,
  reducers: {
    playAnimation: (state, action) => {
      const key = action.payload;
      if (state[key]) {
        Object.keys(state).forEach((k) => {
          state[k].isPlaying = false;
        });

        state[key].isPlaying = true;
        state[key].triggerId += 1;
      }
    },

    stopAnimation: (state, action) => {
      const key = action.payload;
      if (state[key]) {
        state[key].isPlaying = false;
        state[key].triggerId += 1; // ✅ FORCE EFFECT RE-RUN
      }
    },

    resetAnimation: (state, action) => {
      const key = action.payload;
      if (state[key]) {
        state[key].isPlaying = false;
        state[key].triggerId += 1;
      }
    },
  },

  extraReducers: (builder) => {
    // When session starts (user appeared on screen)
    builder.addCase(setUserWelcome, (state) => {
      state.groundCamera.isPlaying = false;
      state.userBoardCamera.isPlaying = true;
      state.userBoardCamera.triggerId += 1;
    });

    // Generic stop for all these actions
    [
      setSessionStartInterval,
      setSessionTestBall,
      setPreRelease,
      setTrajectoryUrl,
      setVideoUrl,
      // Multi-ball "Select All" playback: stop the idle camera fly-around the
      // same way a single trajectory does.
      startMultiTrajectoryPlay,
      startPitchMap,
    ].forEach((action) => {
      builder.addCase(action, (state) => {
        Object.keys(state).forEach((key) => {
          state[key].isPlaying = false;
          state[key].triggerId += 1;
        });
      });
    });

    // ✅ Special rule for SLOT END
    builder.addCase(setSlotEnd, (state) => {
      Object.keys(state).forEach((key) => {
        state[key].isPlaying = false;
        state[key].triggerId += 1;
      });

      state.groundCamera.isPlaying = true; // ✅ YOUR REQUIREMENT
      state.groundCamera.triggerId += 1;
    });
    //Play ground camera on logout
    builder.addCase(setSessionLogout, (state) => {
      Object.keys(state).forEach((key) => {
        state[key].isPlaying = false;
        state[key].triggerId += 1;
      });

      state.groundCamera.isPlaying = true;
      state.groundCamera.triggerId += 1;
    });

    // Trigger camera animation for 4 runs
    builder.addCase(setCurrentShotFourRuns, (state) => {
      state.groundCamera.isPlaying = false;
      state.userBoardCamera.isPlaying = true;
      state.userBoardCamera.triggerId += 1;
    });

    // Trigger camera animation for 6 runs
    builder.addCase(setCurrentShotSixRuns, (state) => {
      state.groundCamera.isPlaying = false;
      state.userBoardCamera.isPlaying = true;
      state.userBoardCamera.triggerId += 1;
    });

    // Stop camera animation when runs display is reset
    builder.addCase(resetCurrentShotRuns, (state) => {
      state.userBoardCamera.isPlaying = false;
      state.userBoardCamera.triggerId += 1;
    });
  },
});

export const { playAnimation, stopAnimation, resetAnimation } =
  animationSlice.actions;
export default animationSlice.reducer;
