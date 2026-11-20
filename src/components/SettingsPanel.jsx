import { useState } from "react";
import {
  CONFIG_SCHEMA,
  getAllConfig,
  setConfig,
  resetConfig,
} from "../drs/drsConfig";

// Operator-editable config. Values are stored in localStorage (see drsConfig.js)
// and read live via getConfig(...) everywhere they're used — so changes here take
// effect on the next replay, with no code edit. "Reset to defaults" clears them.
// This is the BODY (no modal shell) so it can live in the Console panel's tab.
//
// Layout mirrors the Connection tab: each config group is a NUMBERED step card
// (circle badge + title) with its fields inside a rounded panel.

// Small round step badge (matches the Connection tab's numbered steps).
function StepBadge({ n }) {
  return (
    <span className="grid place-items-center w-6 h-6 rounded-full bg-white/[0.08] ring-1 ring-white/15 text-[11px] font-bold text-white/70 shrink-0">
      {n}
    </span>
  );
}

export function SettingsBody() {
  const [values, setValues] = useState(() => getAllConfig());

  const groups = [...new Set(CONFIG_SCHEMA.map((f) => f.group))];

  const onChange = (key, raw, type) => {
    setValues((v) => ({ ...v, [key]: raw }));
    setConfig(key, type === "number" ? Number(raw) : raw);
  };

  return (
    <div className="px-7 py-6 flex flex-col gap-6">
      <p className="text-sm text-white/50 leading-relaxed">
        Changes save instantly and apply on the next replay. Stored on this
        device only.
      </p>

      {/* One numbered card per config group */}
      {groups.map((group, gi) => (
        <div key={group} className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <StepBadge n={gi + 1} />
            <span className="text-[15px] font-bold text-white">{group}</span>
          </div>

          <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {CONFIG_SCHEMA.filter((f) => f.group === group).map((f) => (
                <label
                  key={f.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-white/70">{f.label}</span>
                  {f.type === "select" ? (
                    <select
                      value={values[f.key] ?? ""}
                      onChange={(e) => onChange(f.key, e.target.value, f.type)}
                      className="w-36 rounded-lg bg-[#0B1222] ring-1 ring-white/15 px-2.5 py-2 text-white focus:outline-none focus:ring-sky-400"
                    >
                      {f.options.map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          className="bg-[#0B1222]"
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={values[f.key] ?? ""}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      onChange={(e) => onChange(f.key, e.target.value, f.type)}
                      className="w-24 rounded-lg bg-[#0B1222] ring-1 ring-white/15 px-2.5 py-2 text-right font-mono text-white focus:outline-none focus:ring-sky-400"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Footer action */}
      <div className="flex items-center justify-between border-t border-white/[0.07] pt-5">
        <span className="text-[11px] text-white/35">
          Reset clears every override back to the built-in defaults.
        </span>
        <button
          onClick={() => {
            resetConfig();
            setValues(getAllConfig());
          }}
          className="rounded-lg bg-white/[0.06] hover:bg-white/10 ring-1 ring-white/15 px-4 py-2 text-sm font-semibold text-white/80"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
