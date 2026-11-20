import { createSlice } from "@reduxjs/toolkit";

// A replay requested from OUTSIDE the app — currently the DRS hub's
// cmd.replay.load over the WebSocket (see sockets/socketHandler.js). The socket
// code runs outside React, so it dispatches the parsed delivery here; the
// operator views (App + OperatorDashboard) each watch `request` and auto-play it
// on their own preview. `seq` bumps on every request so the same ball asked for
// twice still re-triggers the listeners. NOT persisted — it's a transient signal.
const initialState = {
  /** @type {{seq:number, ip:string, port:string, match:string, innings:string,
   *   over:string, ball:string, folderUrl:string, ballId:string|null,
   *   corr:string|null} | null} */
  request: null,
};

const remoteReplaySlice = createSlice({
  name: "remoteReplay",
  initialState,
  reducers: {
    requestReplay: (state, action) => {
      const seq = (state.request?.seq ?? 0) + 1;
      state.request = { ...(action.payload || {}), seq };
    },
    clearReplayRequest: (state) => {
      state.request = null;
    },
  },
});

export const { requestReplay, clearReplayRequest } = remoteReplaySlice.actions;
export default remoteReplaySlice.reducer;
