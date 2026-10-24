import RoleCards from '../components/RoleCards.jsx';
import SourceNote from '../components/SourceNote.jsx';
import FieldTag from '../components/FieldTag.jsx';
import { MAX_TRACKED, trackedEntries, trackedOthers } from '../lib/overviewView.js';
import { MATCH_LABEL, MATCH_MEANING } from '../lib/skillMatchView.js';

// The student's dashboard: the roles they chose to track in Matches.
export default function Overview({ data, ctx, profile, scenario, ranked, onOpenRole, onUntrack, onAdd }) {
  const entries = trackedEntries(ranked, profile.tracked);
  const others = trackedOthers(profile.tracked, profile.trackedCards);
  const total = entries.length + others.length;
  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your roles</h1>
        <p className="m-0 text-slate-600">
          The roles you track, up to {MAX_TRACKED}. {MATCH_LABEL}: {MATCH_MEANING}
        </p>
      </div>
      {total ? (
        <>
          <RoleCards
            entries={entries}
            profile={profile}
            ctx={ctx}
            scenario={scenario}
            trends={data.trends}
            sdgInfo={data.sdg}
            onOpen={onOpenRole}
            onChange={total < MAX_TRACKED ? onAdd : null}
            changeLabel="+ Track another role"
            onRemove={onUntrack}
            extra={others.map((card) => (
              <article key={card.code} className="fr-card box-border flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="m-0 text-base font-bold">{card.title}</h2>
                <span className="text-xs text-slate-600">MASCO {card.code}</span>
                <span className="w-fit rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-[#C2410C]">Full score not available</span>
                <FieldTag field={card.field} transferable={card.transferable} />
                <span className="text-[13px] text-slate-700">
                  AI fit (similarity, not readiness): <strong className="tabular-nums">{card.similarity.toFixed(2)}</strong>
                </span>
                <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs text-[#0F766E] underline">
                  eMASCO role page {card.code}
                </a>
                <button
                  type="button"
                  onClick={() => onUntrack(`emasco:${card.code}`)}
                  className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-3 text-sm"
                >
                  Stop tracking {card.title}
                </button>
              </article>
            ))}
          />
        </>
      ) : (
        <div role="status" className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p className="m-0">No tracked roles yet. Explore roles in Matches and press “Track this role” on the ones you like.</p>
          <button
            type="button"
            onClick={onAdd}
            className="fr-btn min-h-11 cursor-pointer rounded-[10px] border-0 bg-[#0F766E] px-5 text-sm font-bold text-white hover:bg-[#115E59]"
          >
            Explore roles
          </button>
        </div>
      )}
      <SourceNote>
        Click a card to open the full match. Gap numbers show how much a skill counts for the role (eMASCO skill class). The trend is the growth
        in wage recipients of the role's occupation group (OpenDOSM), not a count of openings. Suggestions to discuss with your counsellor, not
        decisions.
      </SourceNote>
    </main>
  );
}
