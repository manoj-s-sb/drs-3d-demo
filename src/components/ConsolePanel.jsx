import { useState } from "react";
import { SettingsBody } from "./SettingsPanel";
import { ShortcutsBody } from "./ShortcutsHelp";
import { ServerCheckBody } from "./ServerCheck";

// One modal for the console menu, with tabs: Data + Settings + Shortcuts. Opened
// from a single header button.
const TABS = [
  { id: "data", label: "Connection" },
  { id: "settings", label: "Settings" },
  { id: "shortcuts", label: "Shortcuts" },
];

export default function ConsolePanel({ open, onClose, initialTab = "settings" }) {
  const [tab, setTab] = useState(initialTab);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999999] bg-[#05070F]/85 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-[860px] max-w-[97vw] max-h-[95vh] overflow-hidden rounded-2xl bg-[#0B1222] text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] ring-1 ring-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#38BDF8] via-[#22C55E] to-[#F59E0B]" />

        {/* header + tabs */}
        <div className="flex items-center justify-between px-7 pt-5 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  tab === t.id
                    ? "bg-sky-500 text-[#04121f]"
                    : "bg-white/[0.06] text-white/70 hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 transition-colors text-white/70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto">
          {tab === "data" && <ServerCheckBody />}
          {tab === "settings" && <SettingsBody />}
          {tab === "shortcuts" && <ShortcutsBody />}
        </div>
      </div>
    </div>
  );
}
