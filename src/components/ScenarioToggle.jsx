import { SCENARIO_NAME } from '../lib/roleView.js';

const OPTIONS = ['moderate', 'fast'];

export default function ScenarioToggle({ value, onChange }) {
  return (
    <div role="group" aria-label="AI disruption scenario" className="inline-flex rounded-xl bg-slate-200 p-1">
      {OPTIONS.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option)}
            className={`min-h-11 cursor-pointer rounded-[9px] border-0 px-4 text-sm transition-colors ${
              on ? 'bg-white font-bold text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.15)]' : 'bg-transparent text-slate-600'
            }`}
          >
            {SCENARIO_NAME[option]}
          </button>
        );
      })}
    </div>
  );
}
