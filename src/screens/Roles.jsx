import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chip from '../components/Chip.jsx';
import RoleCard from '../components/RoleCard.jsx';
import ScenarioToggle from '../components/ScenarioToggle.jsx';
import SourceNote from '../components/SourceNote.jsx';
import { matchRange } from '../lib/scoring.js';
import { SCENARIO_NOTE, cardLayout } from '../lib/roleView.js';

const LEGEND = [
  { label: 'You have it', look: 'bg-[#0F766E]' },
  { label: 'Similar skill (half credit)', look: 'border-2 border-[#0F766E] bg-white' },
  { label: 'Gap to learn', look: 'border-2 border-dashed border-[#C2410C] bg-white' },
];

// Measures each card so a card whose content needs more than the default
// height still gets room (the default heights stay the minimum).
function useCardHeights() {
  const [heights, setHeights] = useState({});
  const observer = useRef(null);
  const nodes = useRef(new Map());

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    observer.current = new ResizeObserver((entries) => {
      setHeights((current) => {
        let next = current;
        for (const entry of entries) {
          const id = entry.target.dataset.roleId;
          const height = Math.ceil(entry.target.getBoundingClientRect().height);
          if (current[id] !== height) {
            if (next === current) next = { ...current };
            next[id] = height;
          }
        }
        return next;
      });
    });
    for (const node of nodes.current.values()) observer.current.observe(node);
    return () => observer.current.disconnect();
  }, []);

  const refFor = useCallback(
    (id) => (node) => {
      const previous = nodes.current.get(id);
      if (previous && observer.current) observer.current.unobserve(previous);
      if (node) {
        node.dataset.roleId = id;
        nodes.current.set(id, node);
        if (observer.current) observer.current.observe(node);
      } else {
        nodes.current.delete(id);
      }
    },
    [],
  );
  return { heights, refFor };
}

export default function Roles({
  data,
  ctx,
  profile,
  scenario,
  ranked,
  expandedRoleId,
  onScenarioChange,
  onToggleSdg,
  onToggleExpanded,
  onPathway,
}) {
  const { heights, refFor } = useCardHeights();
  const refs = useMemo(() => Object.fromEntries(data.roles.map((role) => [role.id, refFor(role.id)])), [data.roles, refFor]);
  const layout = cardLayout(
    ranked.map((entry) => entry.role.id),
    expandedRoleId,
    heights,
  );
  const scoreById = new Map(ranked.map((entry) => [entry.role.id, entry.score]));
  // Stable DOM order (by id) so cards slide to new positions instead of jumping.
  const stableRoles = useMemo(() => [...data.roles].sort((a, b) => a.id.localeCompare(b.id)), [data.roles]);

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your best-fit future roles</h1>
          <p className="m-0 text-slate-600">Change your skills, goals or the scenario. The ranking updates live.</p>
          <p className="m-0 mt-1 text-sm text-slate-600">Estimates. {SCENARIO_NOTE}</p>
        </div>
        <ScenarioToggle value={scenario} onChange={onScenarioChange} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">Your goals:</span>
        {Object.entries(data.sdg).map(([key, info]) => {
          const goal = Number(key);
          return (
            <Chip key={key} small pressed={profile.sdgs.includes(goal)} onClick={() => onToggleSdg(goal)}>
              <span aria-hidden="true" className="size-2.5 rounded-[3px] border border-white" style={{ background: info.color }} />
              <span title={info.label}>{info.short}</span>
            </Chip>
          );
        })}
      </div>

      <div
        role="list"
        aria-label="Matched roles, best fit first"
        style={{ '--stack-height': `${layout.total}px` }}
        className="flex flex-col gap-3.5 sm:relative sm:block sm:h-[var(--stack-height)]"
      >
        {stableRoles.map((role) => {
          const position = layout.positions[role.id];
          return (
            <RoleCard
              key={role.id}
              role={role}
              score={scoreById.get(role.id)}
              range={matchRange(role, profile, ctx)}
              rank={position.rank}
              total={ranked.length}
              expanded={expandedRoleId === role.id}
              onToggle={() => onToggleExpanded(role.id)}
              onPathway={() => onPathway(role.id)}
              profile={profile}
              similar={ctx.similar}
              sdgInfo={data.sdg}
              scenario={scenario}
              trends={data.trends}
              top={position.top}
              minHeight={position.minHeight}
              cardRef={refs[role.id]}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-[13px] text-slate-700">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`box-border size-3 rounded-full ${item.look}`} />
            {item.label}
          </span>
        ))}
      </div>
      <SourceNote>
        These are suggestions to discuss with your career counsellor, not decisions. Scores are estimates; open “Why
        this score?” for the sources and dates.
      </SourceNote>
    </main>
  );
}
