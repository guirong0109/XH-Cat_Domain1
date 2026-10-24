import { useMemo } from 'react';
import Chip from '../components/Chip.jsx';
import { MAX_LEARN, learnChoice } from '../lib/potential.js';
import { AI_SKILL, AI_USES, aiSkillSuggestion, usesAi } from '../lib/aiUse.js';
import { skillLevel } from '../lib/scoring.js';

const LEVEL_NAME = { basic: 'Basic', good: 'Good', strong: 'Strong' };

const GOAL_CHOICES = [
  { id: 'upgrade', title: 'Upgrade in my field', text: 'Grow in your major or sector. Roles linked to it come first.' },
  { id: 'move', title: 'Move to a new role', text: 'Try a new sector. Pick the sectors you want next.' },
  { id: 'unsure', title: 'Not sure yet', text: 'See every role in plain score order.' },
];

function roleCounts(roles) {
  const counts = {};
  for (const role of roles) counts[role.interest] = (counts[role.interest] ?? 0) + 1;
  return counts;
}

export default function Goal({ data, profile, onChooseGoal, onToggleTarget, onToggleSdg, onToggleLearn, onToggleAiUse, onAddSkill }) {
  const counts = useMemo(() => roleCounts(data.roles), [data.roles]);
  const aiSkill = aiSkillSuggestion(profile.aiUses, profile.skills);
  const aiSkillLevel = profile.skills.includes(AI_SKILL) ? skillLevel(AI_SKILL, profile) : null;
  const groups = data.fields?.groups ?? [];

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your goal</h1>
        <p className="m-0 text-slate-600">Your goal changes the order of your matches only, not the score.</p>
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

      {profile.goal === 'move' && (
        <section
          aria-labelledby="target-heading"
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]"
        >
          <h2 id="target-heading" className="m-0 text-lg font-bold">
            Which sectors do you want to move to?
          </h2>
          {groups.length > 0 ? (
            <>
              <p className="m-0 text-sm text-slate-600">Pick at least one. Roles in these sectors come first.</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <Chip key={group} pressed={profile.targetSectors.includes(group)} onClick={() => onToggleTarget(group)}>
                    {group}
                    <span className="text-xs">
                      · {counts[group] ?? 0} {counts[group] === 1 ? 'role' : 'roles'}
                    </span>
                  </Chip>
                ))}
              </div>
              <p className="m-0 text-[13px] text-slate-600">
                Role counts from our {data.roles.length} eMASCO roles. Major and sector links are a team draft.
              </p>
            </>
          ) : (
            <p role="status" className="m-0 text-sm text-amber-900">
              The list of sectors is not loaded. Please refresh the page or pick another goal.
            </p>
          )}
        </section>
      )}

      <section
        aria-labelledby="ai-use-heading"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]"
      >
        <div>
          <h2 id="ai-use-heading" className="m-0 text-lg font-bold">
            How do you use AI now, at work or in your studies? <span className="text-sm font-normal text-slate-600">(optional)</span>
          </h2>
          <p className="m-0 mt-1 text-sm text-slate-600">Pick all that apply. We use it to order the AI courses on What to study.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_USES.map((use) => (
            <Chip key={use.id} pressed={(profile.aiUses ?? []).includes(use.id)} onClick={() => onToggleAiUse(use.id)}>
              {use.label}
            </Chip>
          ))}
        </div>
        <div aria-live="polite">
          {aiSkill && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-950">
              <p className="m-0 min-w-0 flex-[1_1_240px]">
                You use AI for {aiSkill.count} {aiSkill.count === 1 ? 'thing' : 'things'}, so you may have the skill{' '}
                <strong>{aiSkill.label}</strong>. First guess: {LEVEL_NAME[aiSkill.level]} (1 or 2 uses Basic, 3 or more Good). It
                counts in the fit score of roles that need it. You decide.
              </p>
              <button
                type="button"
                onClick={() => onAddSkill(aiSkill.label, aiSkill.level)}
                className="fr-btn min-h-11 cursor-pointer rounded-xl border border-[#0F766E] bg-white px-4 text-sm font-bold text-[#0F766E]"
              >
                Add {aiSkill.label} ({LEVEL_NAME[aiSkill.level]})
              </button>
            </div>
          )}
          {usesAi(profile.aiUses) && aiSkillLevel && (
            <p className="m-0 text-[13px] text-slate-600">
              {AI_SKILL} is in your skills ({LEVEL_NAME[aiSkillLevel]}). You can change its level on About you.
            </p>
          )}
        </div>
        <p className="m-0 text-[13px] text-slate-600">
          Your answer itself is not part of the score. Only the skill {AI_SKILL}, if you add it, counts like any other skill.
        </p>
      </section>

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
