import SourceNote from './SourceNote.jsx';
import { formatDate, groupLabel } from '../lib/roleView.js';

function demandText(group, oldGroups, newGroups) {
  const before = oldGroups?.[group]?.demand;
  const after = newGroups?.[group]?.demand;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return `Demand for ${groupLabel(group)}: ${before} → ${after}`;
}

export default function ReplanNotice({ changes, roles, oldGroups, newGroups, trendsSource, onSeeRoles, onDismiss }) {
  const year = trendsSource?.latestYear;
  if (changes.unchanged) {
    return (
      <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-900">
        Data updated to {year}. Your top roles keep the same order.
      </div>
    );
  }

  const entries = [...changes.up, ...changes.down].slice(0, 3);
  return (
    <section role="status" className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
      <h2 className="m-0 text-base font-bold">New data changed your results</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
        {entries.map((move) => {
          const role = roles.find((item) => item.id === move.id);
          if (!role) return null;
          const demand = demandText(role.group, oldGroups, newGroups);
          return (
            <li key={move.id}>
              <strong>{role.title}</strong> <span className="tabular-nums">#{move.from} → #{move.to}</span>
              {demand && <div className="text-teal-800">{demand}</div>}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-sm">Your ticked steps are kept.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSeeRoles}
          className="fr-btn min-h-11 cursor-pointer rounded-[10px] border-0 bg-[#0F766E] px-4 font-semibold text-white hover:bg-[#115E59]"
        >
          See updated roles
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-[#0F766E] bg-white px-4 font-semibold text-[#0F766E]"
        >
          Dismiss
        </button>
      </div>
      <SourceNote>
        Source: OpenDOSM, data to {year}, fetched {formatDate(trendsSource?.fetchedAt)}. Estimates only.
      </SourceNote>
    </section>
  );
}
