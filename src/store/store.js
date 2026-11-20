import { configureStore } from "@reduxjs/toolkit";
import animationReducer from "./slices/animationSlice";
import screenTextReducer from "./slices/screenTextSlice";
import sessionReducer from "./slices/sessionSlice";
import cameraReducer from "./slices/cameraSlice";
import drsReducer from "./slices/drsSlice";
import broadcastReducer from "./slices/broadcastSlice";
import dataSourceReducer from "./slices/dataSourceSlice";
import remoteReplayReducer from "./slices/remoteReplaySlice";
import { scoreReducer } from "../score-api";
import { isBroadcast } from "../viewMode";

export const store = configureStore({
  reducer: {
    animation: animationReducer,
    screenText: screenTextReducer,
    session: sessionReducer,
    camera: cameraReducer,
    drs: drsReducer,
    broadcast: broadcastReducer,
    dataSource: dataSourceReducer,
    remoteReplay: remoteReplayReducer,
    score: scoreReducer,
  },
});

// Persist config across reloads — OPERATOR TAB ONLY, so the big-screen tab
// (which shares this origin's localStorage) can never overwrite it with a stale
// copy. Each writer only fires when its slice reference actually changes.
if (!isBroadcast) {
  let lastDataSource;
  let lastBroadcast;
  store.subscribe(() => {
    const state = store.getState();
    const ds = state.dataSource;
    if (ds !== lastDataSource) {
      lastDataSource = ds;
      try {
        localStorage.setItem("dataSourceConfig", JSON.stringify(ds));
      } catch {
        /* ignore storage errors */
      }
    }
    const bc = state.broadcast;
    if (bc !== lastBroadcast) {
      lastBroadcast = bc;
      try {
        // Persist only WHILE broadcasting. On Stop (broadcasting=false) clear it
        // so nothing lingers; on Start it's saved and kept up to date.
        if (bc.broadcasting) {
          localStorage.setItem("broadcastState", JSON.stringify(bc));
        } else {
          localStorage.removeItem("broadcastState");
        }
      } catch {
        /* ignore storage errors */
      }
    }
  });
}

export default store;
