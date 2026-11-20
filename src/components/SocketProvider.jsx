import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { initializeSocketHandlers } from "../sockets/socketHandler";
import { closeWebSocket } from "../sockets/socketClient";

const SocketProvider = ({ children }) => {
  const dispatch = useDispatch();
  // Reconnect whenever the configured hub IP/port changes (operator edits it in the
  // Server modal) — the cleanup intentionally closes the old socket (no auto-reconnect),
  // then the effect re-runs and connects to the new ws://ip:port/ws.
  const socketIp = useSelector((s) => s.dataSource.socketIp);
  const socketPort = useSelector((s) => s.dataSource.socketPort);

  useEffect(() => {
    initializeSocketHandlers(dispatch);

    return () => {
      closeWebSocket();
    };
  }, [dispatch, socketIp, socketPort]);

  return <>{children}</>;
};

export default SocketProvider;
