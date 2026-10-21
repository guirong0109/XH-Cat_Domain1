import { adjacentSteps, stepPosition } from '../lib/journey.js';
import { MIN_SKILLS } from '../lib/navigation.js';

// Back / Next for the four journey steps. Sticky at the bottom on phones,
// a plain row under the content on wide screens.
export default function StepBar({ screen, skillCount, onNavigate }) {
  if (!stepPosition(screen)) return null;
  const { back, next } = adjacentSteps(screen, skillCount);

  return (
    <div className="fr-noprint sticky bottom-0 z-10 border-t border-slate-200 bg-white lg:static lg:border-0 lg:bg-transparent">
      <div className="mx-auto flex max-w-[1180px] gap-2.5 px-4 py-3 sm:px-6 lg:pb-8">
        {back && (
          <button
            type="button"
            onClick={() => onNavigate(back.screen)}
            className="fr-btn min-h-11 flex-1 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-3 text-sm lg:flex-none lg:px-5"
          >
            ← <span className="hidden sm:inline">Back: </span>
            {back.label}
          </button>
        )}
        {next && (
          <button
            type="button"
            disabled={next.locked}
            onClick={() => onNavigate(next.screen)}
            className={`fr-btn min-h-11 flex-[2] rounded-[10px] border-0 px-3 text-sm font-bold lg:ml-auto lg:flex-none lg:px-5 ${
              next.locked ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'cursor-pointer bg-[#0F766E] text-white hover:bg-[#115E59]'
            }`}
          >
            {next.locked ? `Add ${MIN_SKILLS} skills to continue` : `Next: ${next.label} →`}
          </button>
        )}
      </div>
    </div>
  );
}
