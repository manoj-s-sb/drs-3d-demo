import { createSlice } from "@reduxjs/toolkit";

// Operator-side broadcast control state. Persisted to localStorage (see
// store.js, operator-tab only) so it survives a tab reload / discard:
//  - currentShow  : last show triggered (so Push to Display still has something)
//  - cameraTarget : which screen the keys control ("operator" | "broadcast")
//  - broadcasting : whether the big-screen window is considered open
const DEFAULTS = {
  // The last show command triggered locally, or null if nothing has been shown.
  // Shape matches showCommands.executeCommand, e.g. { kind: "single", url }.
  currentShow: null,
  // Which screen the camera-angle keys (1-5) control: "operator" (this tool's
  // preview) or "broadcast" (the big screen).
  cameraTarget: "operator",
  // True while the big-screen window is open (drives the toolbar buttons).
  broadcasting: false,
};

function loadPersisted() {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const saved = JSON.parse(localStorage.getItem("broadcastState") || "null");
    // `broadcasting` is NEVER restored — it must reflect a real open window this
    // session (we hold no handle after a reload, and the popup may be gone). So
    // a fresh load always starts "Start Broadcast" with the open + fullscreen
    // flow intact. Only cameraTarget / currentShow are restored.
    return saved
      ? { ...DEFAULTS, ...saved, broadcasting: false }
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const broadcastSlice = createSlice({
  name: "broadcast",
  initialState: loadPersisted(),
  reducers: {
    setCurrentShow: (state, action) => {
      state.currentShow = action.payload;
    },
    setCameraTarget: (state, action) => {
      state.cameraTarget =
        action.payload === "broadcast" ? "broadcast" : "operator";
    },
    setBroadcasting: (state, action) => {
      state.broadcasting = !!action.payload;
    },
  },
});

export const { setCurrentShow, setCameraTarget, setBroadcasting } =
  broadcastSlice.actions;
export default broadcastSlice.reducer;
