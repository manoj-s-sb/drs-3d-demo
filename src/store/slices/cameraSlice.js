import { createSlice } from "@reduxjs/toolkit";
import cameraData from "../../data/camera.json";

const cameraSlice = createSlice({
  name: "camera",
  initialState: {
    cameras: cameraData,
    activeCamera: "bowling_camera",
    trajectoryRunning: false,
  },
  reducers: {
    setActiveCamera: (state, action) => {
      if (state.cameras[action.payload]) {
        state.activeCamera = action.payload;
      } else {
        console.warn(`Camera "${action.payload}" not found in JSON.`);
      }
    },
  },
});

export const { setActiveCamera } = cameraSlice.actions;
export default cameraSlice.reducer;
