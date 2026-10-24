import Chip from '../components/Chip.jsx';
import { MAX_LEARN, learnChoice } from '../lib/potential.js';

const GOAL_CHOICES = [
  { id: 'upgrade', title: 'Improve myself', text: 'Grow in your current field. Roles in your field come first.' },
  { id: 'move', title: 'Change work', text: 'Look at other fields where your skills carry over. Those roles come first.' },
  { id: 'unsure', title: 'Not sure yet', text: 'See the same number of roles from your field and from other fields.' },
];

export default function Goal({ data, profile, onChooseGoal, onToggleSdg, onToggleLearn }) {
  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your goal</h1>
        <p className="m-0 text-slate-600">
          Your goal decides which list of matches comes first and how many roles it shows. It never changes a score.
        </p>
      </div>

      <div role="group" aria-label="Your goal" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {GOAL_CHOICES.map((choice) => {
          const picked = profile.goal === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={picked}
              onClick={() => onChooseGoal(choice.id)}
              className={`fr-card flex min-h-[150px] cursor-pointer flex-col justify-center gap-2 rounded-2xl border-2 p-5 text-left ${
                picked ? 'border-[#0F766E] bg-[#F0FDFA]' : 'border-slate-200 bg-white hover:border-[#0F766E]'
              }`}
            >
              <span className="text-xl font-bold">{choice.title}</span>
              <span className="text-sm text-slate-600">{choice.text}</span>
              {picked && <span className="text-[13px] font-bold text-[#0F766E]">Picked</span>}
            </button>
          );
        })}
      </div>

      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-base font-bold sm:px-[22px]">
          More about you (optional)
        </summary>
        <div className="flex flex-col gap-5 px-4 pb-5 sm:px-[22px]">
          <div className="flex flex-col gap-3">
            <h2 className="m-0 text-lg font-bold">Which UN Sustainable Development Goals matter to you?</h2>
            <p className="m-0 text-sm text-slate-600">
              Roles linked to your goals get +5 points per goal, up to +10. Shown in every score.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.sdg).map(([key, info]) => {
                const goal = Number(key);
                return (
                  <Chip key={key} pressed={profile.sdgs.includes(goal)} onClick={() => onToggleSdg(goal)}>
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-[3px] border border-white"
                      style={{ background: info.color }}
                    />
                    {info.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="m-0 text-lg font-bold">Skills you want to learn</h2>
              <span className="text-[13px] text-slate-600">
                {profile.learn.length} of {MAX_LEARN} picked
                {profile.learn.length >= MAX_LEARN ? ' · remove one to pick another' : ''}
              </span>
            </div>
            <p className="m-0 text-sm text-slate-600">
              Pick up to {MAX_LEARN}. We show which roles build them. It does not change any score.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.skills.labels.map(({ label }) => {
                const choice = learnChoice(label, profile);
                const picked = profile.learn.includes(label);
                return (
                  <Chip
                    key={label}
                    tone="learn"
                    pressed={picked}
                    disabled={choice.disabled}
                    onClick={() => onToggleLearn(label)}
                  >
                    {picked && <span aria-hidden="true">★</span>}
                    {label}
                    {profile.skills.includes(label) && <span className="text-xs"> · you have it</span>}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>
      </details>
    </main>
  );
}
