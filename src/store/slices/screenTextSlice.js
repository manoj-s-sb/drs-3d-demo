import { createSlice } from "@reduxjs/toolkit";
import {
  setUserWelcome,
  setSlotEnd,
  setCurrentShotFourRuns,
  setCurrentShotSixRuns,
  resetCurrentShotRuns,
} from "./sessionSlice";

// Font paths
const SPORTS_WORLD_FONT = "/fonts/SportsWorld.ttf";
// Self-hosted (public/fonts/geist.ttf) — no gstatic / internet dependency.
const GEIST_FONT = "/fonts/geist.ttf";

const initialState = {
  lines: [
    { text: "", fontSize: 2.5, color: "#ffffff", bold: true, font: GEIST_FONT },
    { text: "", fontSize: 5, color: "#ffffff", bold: false, font: GEIST_FONT },
    { text: "", fontSize: 3, color: "#ffffff", bold: true, font: GEIST_FONT },
  ],
};

const screenTextSlice = createSlice({
  name: "screenText",
  initialState,
  reducers: {
    setScreenText: (state, action) => {
      state.lines = action.payload;
    },
    updateLine: (state, action) => {
      const { index, newData } = action.payload;
      if (state.lines[index]) {
        state.lines[index] = { ...state.lines[index], ...newData };
      }
    },
    clearScreenText: (state) => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setUserWelcome, (state, action) => {
      const message = action.payload.message || "";
      const parts = message.split(" ");

      const name = parts.slice(1).join(" ");
      const welcomeText = parts[0] || "Welcome";

      state.lines = [
        {
          text: "Ready to Bat!",
          fontSize: 2.5,
          color: "#ffffff",
          bold: true,
          font: GEIST_FONT,
        },
        {
          text: name,
          fontSize: 5,
          color: "#ffffff",
          bold: false,
          font: GEIST_FONT,
        },
        {
          text: welcomeText,
          fontSize: 3,
          color: "#ffffff",
          bold: true,
          font: GEIST_FONT,
        },
      ];
    });

    // Show "It's a 4!" on screen
    builder.addCase(setCurrentShotFourRuns, (state) => {
      state.lines = [
        {
          text: "4",
          fontSize: 8,
          color: "#ffffff",
          bold: true,
          font: SPORTS_WORLD_FONT,
        },
        {
          text: "IT'S a",
          fontSize: 3,
          color: "#ffffff",
          bold: true,
          font: SPORTS_WORLD_FONT,
        },
      ];
    });

    // Show "It's a 6!" on screen
    builder.addCase(setCurrentShotSixRuns, (state) => {
      state.lines = [
        {
          text: "6",
          fontSize: 8,
          color: "#ffffff",
          bold: true,
          font: SPORTS_WORLD_FONT,
        },
        {
          text: "IT'S a",
          fontSize: 3,
          color: "#ffffff",
          bold: true,
          font: SPORTS_WORLD_FONT,
        },
      ];
    });

    // Clear screen text when runs overlay is reset
    builder.addCase(resetCurrentShotRuns, (state) => {
      Object.assign(state, initialState);
    });

    // Reset on Slot End
    builder.addCase(setSlotEnd, (state) => {
      Object.assign(state, initialState);
    });
  },
});

export const { setScreenText, updateLine, clearScreenText } =
  screenTextSlice.actions;
export default screenTextSlice.reducer;
