import { useRef } from 'react';
import Chip from '../components/Chip.jsx';
import LevelSwitch from '../components/LevelSwitch.jsx';
import { MIN_SKILLS } from '../lib/navigation.js';
import { LEVEL_CREDIT, skillLevel } from '../lib/scoring.js';

const LEVEL_LINE = `Your level counts in the fit score: Strong ${LEVEL_CREDIT.strong}, Good ${LEVEL_CREDIT.good}, Basic ${LEVEL_CREDIT.basic}.`;

function Card({ children, ...rest }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]" {...rest}>
      {children}
    </section>
  );
}

export default function Skills({ data, profile, onToggleSkill, onSetLevel }) {
  const pickerRef = useRef(null);
  const count = profile.skills.length;

  const goToPicker = () => {
    pickerRef.current?.scrollIntoView({ block: 'start' });
    pickerRef.current?.focus();
  };

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your skills</h1>
        <p className="m-0 text-slate-600">Pick at least {MIN_SKILLS} skills you have now, then check each level.</p>
      </div>

      <Card aria-label="Start from your CV">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled
            className="flex min-h-[52px] cursor-not-allowed flex-col items-start justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 text-left text-slate-500"
          >
            <span className="text-base font-bold">Upload my CV (PDF)</span>
            <span className="text-xs">Coming in the next update</span>
          </button>
          <button
            type="button"
            onClick={goToPicker}
            className="fr-btn min-h-[52px] cursor-pointer rounded-xl border border-[#0F766E] bg-white px-5 text-base font-bold text-[#0F766E]"
          >
            I don't have a CV
          </button>
        </div>
        <p className="m-0 text-[13px] text-slate-600">Your CV is read on this device only. It is never sent or saved.</p>
      </Card>

      <Card aria-labelledby="your-skills-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="your-skills-heading" className="m-0 text-lg font-bold">
            Your skills and levels
          </h2>
          <span className="text-[13px] text-slate-600">
            {count} picked{count < MIN_SKILLS ? ` · pick ${MIN_SKILLS - count} more to continue` : ''}
          </span>
        </div>
        <p className="m-0 text-sm text-slate-600">{LEVEL_LINE}</p>
        {count === 0 ? (
          <p className="m-0 text-sm text-slate-600">No skills yet. Pick them from the list below.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {profile.skills.map((label) => (
              <li
                key={label}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <span className="min-w-0 flex-[1_1_160px] text-[15px] font-semibold">{label}</span>
                <LevelSwitch
                  skill={label}
                  value={skillLevel(label, profile)}
                  onChange={(level) => onSetLevel(label, level)}
                />
                <button
                  type="button"
                  onClick={() => onToggleSkill(label)}
                  aria-label={`Remove ${label}`}
                  className="min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-3 text-[13px] text-slate-700 hover:border-[#C2410C] hover:text-[#C2410C]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section
        ref={pickerRef}
        tabIndex={-1}
        aria-labelledby="skill-picker-heading"
        className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 outline-none sm:p-[22px]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="skill-picker-heading" className="m-0 text-lg font-bold">
            Pick your skills
          </h2>
          <span className="text-[13px] text-slate-600">From eMASCO skill statements</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.skills.labels.map(({ label }) => (
            <Chip key={label} pressed={profile.skills.includes(label)} onClick={() => onToggleSkill(label)}>
              {label}
            </Chip>
          ))}
        </div>
      </section>
    </main>
  );
}
