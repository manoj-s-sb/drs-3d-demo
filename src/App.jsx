// src/App.jsx
import React from "react";
import ThreeScene from "./components/ThreeScene";
import Overlay2D from "./components/2d_components/Overlay2D";
import DrsKeyBindings from "./components/DrsKeyBindings";
import DrsVideoLayer from "./components/DrsVideoLayer";
import TrajectoryPicker from "./components/drs/TrajectoryPicker";
import MultiTicker from "./components/drs/MultiTicker";
import MultiPitchTicker from "./components/drs/MultiPitchTicker";
import WagonTicker from "./components/drs/WagonTicker";
import InterceptionTicker from "./components/drs/InterceptionTicker";
import PitchMapOverlay from "./components/2d_components/PitchMapOverlay";
import BroadcastControls from "./components/BroadcastControls";
import RemoteReplayListener from "./components/RemoteReplayListener";
import LoadDebug from "./components/LoadDebug"; // TEMP: asset load diagnostics

function App() {
  return (
    <div
      className="relative w-screen h-screen bg-black"
      style={{ isolation: "isolate" }}
    >
      {/* DRS video sits BEHIND the 3D canvas (z-0). The canvas is transparent
          during DRS video phases so the video shows through. */}
      <DrsVideoLayer />
      <ThreeScene />
      <Overlay2D />
      <DrsKeyBindings />
      <TrajectoryPicker />
      <MultiTicker />
      <PitchMapOverlay />
      <MultiPitchTicker />
      <WagonTicker />
      <InterceptionTicker />
      <BroadcastControls />
      <RemoteReplayListener />
      <LoadDebug />
    </div>
  );
}

export default App;
