import SdgTag from './SdgTag.jsx';
import { roleReference } from '../lib/referenceView.js';
import { evidenceHeadline, evidenceSourceLine, otherOfficialSkills, skillSupportRows } from '../lib/skillEvidence.js';
import {
  ILO_NO_MATCH,
  RANGE_NOTE,
  exposureShares,
  fitSkillRows,
  groupLabel,
  iloView,
  labelOrigin,
  levelName,
  observedView,
  oecdView,
  roleSources,
  scoreBreakdown,
  skillChipText,
  whyReason,
} from '../lib/roleView.js';
import { useTween } from '../lib/useTween.js';
import { learnCount } from '../lib/potential.js';

const SKILL_LOOK = {
  have: 'border border-[#0F766E] bg-[#0F766E] text-white',
  similar: 'border-2 border-[#0F766E] bg-white text-[#0F766E]',
  gap: 'border-2 border-dashed border-[#C2410C] bg-white text-[#9A3412]',
};
const FIT_ROW_TEXT = { similar: 'Similar skill', gap: 'Gap to learn' };

function fitRowText(row) {
  if (row.status !== 'have') return FIT_ROW_TEXT[row.status];
  return row.level ? `You have it (${levelName(row.level)})` : 'You have it';
}

// One ranked role. Matches renders cards in DOM in the displayed (goal) order.
export default function RoleCard({
  role,
  observed,
  observedMeta,
  skillEvidence,
  skillEvidenceMeta,
  score,
  range,
  rank,
  total,
  expanded,
  onToggle,
  onStudy,
  reason = null,
  profile,
  similar,
  sdgInfo,
  scenario,
  trends,
  references,
}) {
  const shownMatch = useTween({ match: score.match }).match;
  const reasonText = whyReason(reason);
  const used = observedView(observed, observedMeta);
  const sources = roleSources({ ...role, observed: used ? { url: used.sourceUrl } : undefined }, trends);
  const reference = roleReference(references, role);
  const wanted = learnCount(role, profile.learn || []);
  const breakdown = expanded ? scoreBreakdown(role, score, scenario, trends) : null;
  const fitRows = expanded ? fitSkillRows(role, profile, similar) : [];
  const supportRows = expanded && skillEvidence ? skillSupportRows(skillEvidence, role.skills) : [];
  const supportByLabel = Object.fromEntries(supportRows.map((row) => [row.label, row]));
  const otherOfficial = expanded && skillEvidence ? otherOfficialSkills(skillEvidence, profile) : [];
  const ilo = iloView(role);
  const oecd = oecdView(role);
  const shares = exposureShares(role);
  const panelId = `why-${role.id}`;
  const first = rank === 1;

  return (
    <article
      id={`card-${role.id}`}
      tabIndex={-1}
      role="listitem"
      aria-posinset={rank}
      aria-setsize={total}
      aria-labelledby={`title-${role.id}`}
      className={`fr-card fr-role-card box-border rounded-2xl border bg-white p-4 sm:px-[22px] sm:py-5 ${
        first ? 'border-teal-300' : 'border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-[18px] gap-y-3">
        <div
          className={`flex size-10 flex-none items-center justify-center rounded-xl text-lg font-extrabold ${
            first ? 'bg-[#0F766E] text-white' : 'bg-slate-100 text-[#0F172A]'
          }`}
        >
          <span className="sr-only">Rank </span>
          {rank}
        </div>
        <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 id={`title-${role.id}`} className="m-0 text-[19px] font-bold">
              {role.title}
            </h2>
            <span className="text-[13px] text-slate-600">
              MASCO {role.code} · {groupLabel(role.group)}
            </span>
            {reasonText && (
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">{reasonText}</span>
            )}
            {wanted > 0 && (
              <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-[#9A3412]">
                ★ Builds {wanted} {wanted === 1 ? 'skill' : 'skills'} you want
              </span>
            )}
            {role.labelSource === 'manual' && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Sample labels</span>
            )}
            {ilo && (
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">{ilo.badge}</span>
            )}
            {used && used.state === 'ok' && (
              <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">{used.badge}</span>
            )}
            {oecd && (
              <span className="rounded-md bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-900">{oecd.badge}</span>
            )}
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Skills for this role">
            {role.skills.map((skill) => {
              const chip = skillChipText(skill.label, profile, similar);
              const statusText = chip.srText;
              return (
                <li key={skill.label} className={`rounded-full px-2.5 py-0.5 text-[13px] ${SKILL_LOOK[chip.status]}`}>
                  {(profile.learn || []).includes(skill.label) && <span aria-hidden="true">★ </span>}
                  {skill.label}
                  {chip.level && <span aria-hidden="true"> · {levelName(chip.level)}</span>}
                  <span className="sr-only">
                    {' '}
                    ({statusText}
                    {(profile.learn || []).includes(skill.label) ? ', you want to learn it' : ''})
                  </span>
                </li>
              );
            })}
          </ul>
          {role.sdgs?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.sdgs.map((goal) => (sdgInfo[goal] ? <SdgTag key={goal} info={sdgInfo[goal]} /> : null))}
            </div>
          )}
          {sources.length > 0 && (
            <p className="m-0 flex flex-wrap items-center gap-x-3 text-[13px] text-slate-600">
              <span>Sources:</span>
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-[#0F766E] underline"
                >
                  {source.label}
                </a>
              ))}
            </p>
          )}
          <p className={`m-0 text-xs ${reference.ok === false ? 'text-[#C2410C]' : 'text-slate-600'}`}>
            eMASCO page: {reference.text}
          </p>
          {reference.note && (
            <p className="m-0 rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-[13px] text-orange-900">{reference.note}</p>
          )}
        </div>
        <div className="flex min-w-[min(100%,250px)] flex-[1_1_250px] flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-slate-600" title="Lowest to highest match across the two AI scenarios">
              Match · range {range.low}–{range.high}
            </span>
            <span className="text-[30px] font-extrabold tabular-nums">
              <span aria-hidden="true">{Math.round(shownMatch)}</span>
              <span className="sr-only">Match {Math.round(score.match)} out of 100</span>
            </span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-[#0F766E]" style={{ width: `${Math.min(100, Math.max(0, shownMatch))}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={onToggle}
              className="fr-btn min-h-11 flex-1 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-2 text-sm whitespace-nowrap"
            >
              {expanded ? 'Hide details' : 'Why this score?'}
            </button>
            <button
              type="button"
              onClick={onStudy}
              aria-label={`Plan my study for ${role.title}`}
              className="fr-btn min-h-11 flex-[1_1_100%] cursor-pointer rounded-[10px] border-0 bg-[#0F766E] px-2 text-sm font-bold text-white hover:bg-[#115E59]"
            >
              Plan my study for this role
            </button>
          </div>
        </div>
      </div>
      {breakdown && (
        <div id={panelId} className="fr-tip mt-[18px] border-t border-slate-200 pt-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {breakdown.parts.map((part) => (
              <div key={part.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <strong>{part.label}</strong>
                  <span className="tabular-nums">{part.value}</span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-full" style={{ width: `${Math.min(100, part.width)}%`, background: part.color }} />
                </div>
                <div className="text-[13px] text-slate-700">{part.detail}</div>
                <div className="text-xs text-slate-600">Source: {part.source}</div>
              </div>
            ))}
          </div>
          <section className="mt-4 flex flex-col gap-1.5">
            <h3 className="m-0 text-sm font-bold">Skill fit, skill by skill</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-slate-700">
              {fitRows.map((row) => (
                <li key={row.label} className="flex flex-wrap justify-between gap-x-3 border-b border-slate-100 pb-1">
                  <span>
                    {row.label} <span className="text-slate-600">· {fitRowText(row)}</span>
                  </span>
                  <span className="tabular-nums">+{row.credit}</span>
                  {supportByLabel[row.label]?.text && (
                    <span className="basis-full text-xs text-slate-600">
                      eMASCO page: {supportByLabel[row.label].text}
                      {supportByLabel[row.label].evidence[0] && (
                        <> “{supportByLabel[row.label].evidence[0].quote}”</>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="m-0 text-xs text-slate-600">
              Skill list: eMASCO {role.code} (MOHR). Levels are what you chose; skills with no level count as Strong.
            </p>
            {skillEvidence && (
              <p className="m-0 text-xs text-slate-600">
                {evidenceHeadline(skillEvidence)} {evidenceSourceLine(skillEvidence, skillEvidenceMeta)} The evidence below is for explanation only; it does not change the score.
              </p>
            )}
          </section>
          {otherOfficial.length > 0 && (
            <section className="mt-3 flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3 text-[13px] text-slate-700">
              <h3 className="m-0 text-sm font-bold text-[#0F172A]">Other skills the eMASCO page lists for this role (not in the score)</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {otherOfficial.map((item) => (
                  <li key={item.skillId}>
                    {item.skillName}
                    {item.needsReview && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">needs review</span>}
                    {item.relatedYouHave.length > 0 && (
                      <span className="text-xs text-teal-800"> · related to your skill {item.relatedYouHave.join(', ')} (not counted)</span>
                    )}
                    <span className="block text-xs text-slate-600">“{item.quote}”</span>
                  </li>
                ))}
              </ul>
              {skillEvidence.otherOfficialCount > otherOfficial.length && (
                <p className="m-0 text-xs text-slate-600">{skillEvidence.otherOfficialCount - otherOfficial.length} more on the official page.</p>
              )}
              <a className="text-xs font-bold text-[#0F766E] underline" href={skillEvidence.source.url} target="_blank" rel="noopener noreferrer">
                Open the eMASCO page ({skillEvidence.source.retrievedAt})
              </a>
            </section>
          )}
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 tabular-nums">
            {breakdown.formula}
          </div>
          <p className="m-0 mt-2 text-[13px] text-slate-600">
            {RANGE_NOTE} This card: {range.low}–{range.high}.
          </p>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            <section className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-3 text-[13px] text-slate-700">
              <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-[#0F172A]">
                Our task labels (used for the part not measured)
                {role.labelSource === 'manual' && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Sample</span>
                )}
              </h3>
              <p className="m-0 tabular-nums">
                Automatable {shares.automatable}% · AI-assisted {shares.assisted}% · Human-led {shares.human}%
              </p>
              <p className="m-0 text-xs text-slate-600">Estimates from eMASCO tasks; {labelOrigin(role.labelSource)}.</p>
            </section>
            <section className="flex flex-col gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-[13px] text-slate-700">
              <h3 className="m-0 text-sm font-bold text-[#0F172A]">ILO second opinion (not in the score)</h3>
              {ilo ? (
                <>
                  <p className="m-0 tabular-nums">{ilo.scoreText}</p>
                  <p className="m-0">{ilo.iscoText}</p>
                  <p className="m-0 text-xs text-slate-600">{ilo.scaleText}</p>
                  <p className="m-0">{ilo.mappingNote}</p>
                  <p className="m-0 text-xs text-slate-600">{ilo.sourceText}</p>
                </>
              ) : (
                <p className="m-0">{ILO_NO_MATCH}</p>
              )}
            </section>
            {used && (
              <section className="flex flex-col gap-1.5 rounded-lg border border-orange-200 bg-orange-50/40 p-3 text-[13px] text-slate-700">
                <h3 className="m-0 text-sm font-bold text-[#0F172A]">Observed AI use for this role (not in the score)</h3>
                {used.state === 'ok' ? (
                  <>
                    <p className="m-0 tabular-nums">{used.scoreText}</p>
                    <p className="m-0">{used.shareText}</p>
                    <p className="m-0 text-xs text-slate-600">{used.coverageText}</p>
                    {used.zeroNote && <p className="m-0">{used.zeroNote}</p>}
                    {used.aiTasks.length > 0 && (
                      <div>
                        <p className="m-0 font-semibold">AI is already used for these tasks</p>
                        <ul className="m-0 list-disc pl-5">
                          {used.aiTasks.map((item) => (
                            <li key={item.task}>
                              {item.task} <span className="text-xs text-slate-600">(use {item.penetration.toFixed(2)})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {used.humanTasks.length > 0 && (
                      <div>
                        <p className="m-0 font-semibold">No observed AI use yet</p>
                        <ul className="m-0 list-disc pl-5">
                          {used.humanTasks.map((item) => (
                            <li key={item.task}>{item.task}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="m-0">{used.text}</p>
                )}
                <p className="m-0 text-xs text-slate-600">{used.sourceText}</p>
              </section>
            )}
            {oecd && (
              <section className="flex flex-col gap-1.5 rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-[13px] text-slate-700">
                <h3 className="m-0 text-sm font-bold text-[#0F172A]">OECD AI capability gap (not in the score)</h3>
                <p className="m-0 tabular-nums">{oecd.scoreText}</p>
                <p className="m-0">{oecd.groupText}</p>
                <p className="m-0 text-xs text-slate-600">{oecd.scaleText}</p>
                <ul className="m-0 grid list-none grid-cols-[minmax(0,7.5rem)_1fr_2rem] items-center gap-x-2 gap-y-1 p-0 text-xs" aria-label="Gap per capability">
                  {oecd.domains.map((domain) => (
                    <li key={domain.name} className="contents">
                      <span>{domain.name}</span>
                      {domain.aiMatches ? (
                        <span className="col-span-2 text-slate-600">AI already matches</span>
                      ) : (
                        <>
                          <span className="h-2 rounded bg-teal-100" aria-hidden="true">
                            <span className="block h-2 rounded bg-teal-700" style={{ width: `${(domain.gap / oecd.maxGap) * 100}%` }} />
                          </span>
                          <span className="tabular-nums">{domain.gap.toFixed(1)}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="m-0">{oecd.mappingNote}</p>
                <p className="m-0 text-xs text-slate-600">{oecd.sourceText}</p>
              </section>
            )}
          </div>
          <p className="m-0 mt-2 text-[13px] text-slate-600">The views can disagree. All are estimates. You decide.</p>
        </div>
      )}
    </article>
  );
}
