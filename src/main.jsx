import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store/store";
import "./index.css";
import App from "./App.jsx";
import BroadcastApp from "./BroadcastApp.jsx";
import OperatorDashboard from "./components/OperatorDashboard.jsx";
import SocketProvider from "./components/SocketProvider.jsx";
import { isBroadcast, isDashboard } from "./viewMode";
import { startBroadcastReceiver } from "./crossTabSync";

// The big-screen tab (?broadcast=1) renders only the broadcast view and is
// driven by show commands — it does NOT open a socket connection.
if (isBroadcast) {
  startBroadcastReceiver(store);
}

createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    {isBroadcast ? (
      <BroadcastApp />
    ) : (
      <SocketProvider>
        {isDashboard ? <OperatorDashboard /> : <App />}
      </SocketProvider>
    )}
  </Provider>,
);
