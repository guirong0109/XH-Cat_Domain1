import RoleCards from '../components/RoleCards.jsx';
import SourceNote from '../components/SourceNote.jsx';
import { orderForGoal } from '../lib/goalView.js';
import { cardEntries } from '../lib/overviewView.js';
import { MATCH_LABEL, MATCH_MEANING } from '../lib/skillMatchView.js';

// Shown after Goal, before the full Matches page. The roles are the best-matching of our scored roles, in goal order.
export default function Overview({ data, ctx, profile, scenario, ranked, onOpenRole, onBack, onChange, onAll }) {
  const entries = cardEntries(orderForGoal(ranked, profile, data.fields).entries);
  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your roles</h1>
        <p className="m-0 text-slate-600">
          {entries.length} of our scored roles that fit your skills best, in the order of your goal. {MATCH_LABEL}: {MATCH_MEANING}
        </p>
      </div>
      {entries.length ? (
        <RoleCards
          entries={entries}
          profile={profile}
          ctx={ctx}
          scenario={scenario}
          trends={data.trends}
          sdgInfo={data.sdg}
          onOpen={onOpenRole}
          onChange={onChange}
        />
      ) : (
        <p role="status" className="m-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          No role to show yet. Add skills or change your goal.
        </p>
      )}
      <SourceNote>
        Click a card to open the full match. Gap numbers show how much a skill counts for the role (eMASCO skill class). The trend is the growth in wage recipients
        of the role's occupation group (OpenDOSM), not a count of openings. Suggestions to discuss with your counsellor, not decisions.
      </SourceNote>
      <div className="fr-noprint flex flex-wrap gap-2.5">
        <button type="button" onClick={onBack} className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-5 text-sm">
          ← Back: Your goal
        </button>
        <button
          type="button"
          onClick={onAll}
          className="fr-btn min-h-11 cursor-pointer rounded-[10px] border-0 bg-[#0F766E] px-5 text-sm font-bold text-white hover:bg-[#115E59]"
        >
          See all matches →
        </button>
      </div>
    </main>
  );
}
