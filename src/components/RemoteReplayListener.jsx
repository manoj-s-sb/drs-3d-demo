import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setSource, setSelection } from "../store/slices/dataSourceSlice";
import { setCurrentShow } from "../store/slices/broadcastSlice";
import { executeCommand } from "./drs/showCommands";
import { resolveDrsReplay } from "../drs/remoteReplayCommand";
import { loadSnapshot, clearBowlingAnalysis } from "../score-api";
import { deliveryFolder } from "../dataSource";

// Auto-play handler for the classic operator app (App.jsx). When the DRS hub
// sends cmd.replay.load over the socket (parsed into remoteReplay.request), it
// selects that delivery and runs the SAME DRS review flow as a manual Start —
// probing the ball's cameras on the configured server and playing the video +
// tracking on the operator's PREVIEW. Uses the backend-provided camera (cam),


// then the default, then the first available; falls back to the 3D trajectory
// if the ball ships no camera feeds. Nothing is auto-sent to the big screen.
export default function RemoteReplayListener() {
  const dispatch = useDispatch();
  const req = useSelector((s) => s.remoteReplay.request);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!req || req.seq === lastSeq.current) return;
    lastSeq.current = req.seq;
    let cancelled = false;

    (async () => {
      const { match, innings, over, ball, cam, trajUrl } = req;
      console.log("[replay] app auto-play →", { match, innings, over, ball, cam });

      // Only the delivery comes from the message; keep the configured server.
      dispatch(setSource("server"));
      dispatch(setSelection({ match, innings, over, ball }));

      const trajFor = () =>
        trajUrl || `${deliveryFolder(innings, over, ball)}trajectory_data.json`;

      // Probe the ball's cameras and play the backend cam (else default, else
      // first) as a full DRS review; fall back to the trajectory if none.
      const drs = await resolveDrsReplay(innings, over, ball, cam);
      if (cancelled) return;

      const cmd = drs
        ? {
            kind: "drs",
            folderUrl: drs.folderUrl,
            operatorInput: {
              originalDecision: "NOT_OUT",
              isRightHanded: true,
              softSignal: false,
            },
            camera: drs.camera,
          }
        : { kind: "single", url: trajFor(), session: "BATTING_SESSION" };

      dispatch(setCurrentShow(cmd));
      executeCommand(dispatch, cmd);

      // Load the score snapshot for this delivery so the ticker matches.
      if (match) {
        dispatch(clearBowlingAnalysis());
        dispatch(loadSnapshot({ match, innings, over, ball }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [req, dispatch]);

  return null;
}
