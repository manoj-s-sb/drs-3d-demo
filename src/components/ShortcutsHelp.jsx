// A reference modal listing every keyboard shortcut, grouped by context, so any
// operator can see what each key does at a glance. Opened from the toolbar.

// All keybindings, mirrored from DrsKeyBindings.jsx. Keep in sync if keys change.
const GROUPS = [
  {
    title: "Common",
    accent: "#38BDF8",
    hint: "Always — operator tool",
    rows: [
      ["A", "Open / close the control panel"],
      ["Esc", "Close the control panel"],
      ["T", "Run the DRS test replay"],
      ["F", "Fullscreen — press on the big-screen window"],
    ],
  },
  {
    title: "Playback",
    accent: "#22C55E",
    hint: "Acts on the selected tab",
    rows: [
      ["Space", "Play / replay"],
      ["0", "Reset to the start"],
      ["R", "Return to the idle scene"],
    ],
  },
  {
    title: "Bowling — Camera",
    accent: "#22C55E",
    hint: "After the over plays",
    rows: [
      ["1", "Side view"],
      ["2", "Top-down view"],
      ["3", "Behind the stumps"],
      ["4", "Front-on view"],
      ["5", "Cinematic sweep"],
    ],
  },
  {
    title: "Pitch — Camera",
    accent: "#F59E0B",
    rows: [
      ["1", "Top-down view"],
      ["2", "Overview"],
    ], 
  },
  {
    title: "DRS — Camera",
    accent: "#38BDF8",
    hint: "During the review",
    rows: [
      ["1", "Side view"],
      ["2", "Top-down view"],
      ["3", "Behind the stumps"],
      ["4", "Front-on view"],
      ["5", "Cinematic sweep"],
    ],
  },
  {
    title: "No-Ball — Camera",
    accent: "#F43F5E",
    hint: "During playback",
    rows: [
      ["1", "Side view"],
      ["2", "Top-down view"],
      ["3", "Behind the stumps"],
      ["4", "Front-on view"],
      ["5", "Cinematic sweep"],
    ],
  },
  {
    title: "Single Delivery",
    accent: "#A78BFA",
    rows: [
      ["Space", "Play / replay"],
      ["0", "Reset to the start"],
    ],
  },
];

// On-screen toolbar buttons (top-right of the operator tool).
const BUTTONS = [
  ["Broadcast", "Open / close the big-screen window"],
  ["Push to Display", "Send the current show to the big screen (it waits on the initial frame)"],
  ["Play", "Play / replay the BIG SCREEN — always, regardless of the tab"],
  ["Operator / Broadcast", "Choose which screen the keys above control"],
];

// Standalone modal (kept for callers like BroadcastControls). The operator
// dashboard uses ConsolePanel (Settings + Shortcuts tabs) instead.
export default function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999999] bg-[#05070F]/85 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-[1040px] max-w-[97vw] max-h-[95vh] overflow-hidden rounded-2xl bg-[#0B1222] text-white shadow-[0_24px_70px_rgba(0,0,0,0.7)] ring-1 ring-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#38BDF8] via-[#22C55E] to-[#F59E0B]" />
        <div className="flex items-center justify-between px-7 pt-5 pb-4 border-b border-white/[0.07]">
          <h1 className="text-xl font-bold tracking-tight">Keyboard Shortcuts</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto">
          <ShortcutsBody />
        </div>
      </div>
    </div>
  );
}

// The shortcuts content (routing note + groups + toolbar buttons), without the
// modal shell — so it can be embedded in the combined Console panel's tab.
export function ShortcutsBody() {
  return (
    <>
      {/* Routing note */}
      <div className="px-7 pt-4 flex flex-col gap-2">
          <div className="rounded-lg bg-sky-500/10 ring-1 ring-sky-500/30 px-4 py-2.5 text-sm text-sky-100">
            <b>Keyboard keys</b> act on the screen chosen by the{" "}
            <b>Preview / Broadcast</b> tab — <b>Preview</b> = this tool,{" "}
            <b>Broadcast</b> = the big screen.
          </div>
          <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 px-4 py-2.5 text-sm text-emerald-100">
            The on‑screen <b>Play</b> button always plays / replays the{" "}
            <b>big screen</b>, whatever tab is selected.
          </div>
        </div>

        {/* Groups */}
        <div className="px-7 py-5 grid grid-cols-3 gap-x-8 gap-y-6">
          {GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between border-b border-white/[0.07] pb-1.5">
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: g.accent }}
                >
                  {g.title}
                </span>
                {g.hint && (
                  <span className="text-[11px] text-white/35">{g.hint}</span>
                )}
              </div>
              <div className="flex flex-col gap-2.5">
                {g.rows.map(([k, label]) => (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <Kbd>{k}</Kbd>
                    <span className="text-white/75">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar buttons */}
        <div className="px-7 pb-5">
          <div className="border-b border-white/[0.07] pb-1.5 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">
              Toolbar Buttons (top‑right)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
            {BUTTONS.map(([name, label]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="inline-flex h-7 items-center rounded-md bg-white/[0.07] ring-1 ring-white/10 px-2.5 font-semibold text-white whitespace-nowrap">
                  {name}
                </span>
                <span className="text-white/75">{label}</span>
              </div>
            ))}
          </div>
        </div>

      {/* Footer */}
      <div className="px-7 py-3.5 border-t border-white/[0.07] text-center">
        <span className="text-xs text-white/40">
          Camera angles (1–5) apply once the over has played or the DRS reaches
          review.
        </span>
      </div>
    </>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.9rem] h-7 px-1.5 rounded-md bg-white/[0.07] border-b-2 border-white/15 ring-1 ring-white/10 text-white font-mono text-xs font-bold">
      {children}
    </kbd>
  );
}
