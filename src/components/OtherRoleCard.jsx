import { observedView, formatDate } from '../lib/roleView.js';
import { SDG_NOT_TAGGED, barWidth, gradesText, levelLabel, missingSkills, similarityText, whyLines } from '../lib/exploreView.js';

const CHIPS_SHOWN = 6;
const CHIP_CHARS = 60;
const clip = (text) => (text.length > CHIP_CHARS ? `${text.slice(0, CHIP_CHARS - 1).trimEnd()}…` : text);

// One eMASCO role that is not one of our 20 scored roles. Same layout as RoleCard; it shows a skill fit estimate
// instead of the full score, and only the links and panels that have data.
export default function OtherRoleCard({ card, rank, total, observedSource, crawledOn }) {
  const used = observedView(card.observed, observedSource);
  const why = whyLines(card, CHIPS_SHOWN);
  const missing = missingSkills(card);
  const grades = gradesText(card);
  const first = rank === 1;
  const titleId = `title-${card.code}`;
  return (
    <article
      id={`card-${card.code}`}
      tabIndex={-1}
      role="listitem"
      aria-posinset={rank}
      aria-setsize={total}
      aria-labelledby={titleId}
      className={`fr-card fr-role-card box-border rounded-2xl border bg-white p-4 sm:px-[22px] sm:py-5 ${first ? 'border-teal-300' : 'border-slate-200'}`}
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
            <h2 id={titleId} className="m-0 text-[19px] font-bold">
              {card.baseTitle || card.title}
            </h2>
            <span className="text-[13px] text-slate-600">
              MASCO {card.code}
              {card.tags?.length ? ` · ${card.tags.join(', ')}` : ''} · {levelLabel(card.qualificationLevel)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-[#C2410C]">Full score not available</span>
            {used?.state === 'ok' && (
              <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">{used.badge}</span>
            )}
          </div>
          {why.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Skills for this role">
              {why.map((item) => (
                <li
                  key={item.text}
                  title={item.text}
                  className={`rounded-full px-2.5 py-0.5 text-[13px] ${
                    item.matched ? 'border border-[#0F766E] bg-[#0F766E] text-white' : 'border-2 border-dashed border-[#C2410C] bg-white text-[#9A3412]'
                  }`}
                >
                  {clip(item.text)}
                  <span className="sr-only"> ({item.matched ? 'close to a skill you picked' : 'gap to learn'})</span>
                </li>
              ))}
            </ul>
          )}
          <div className="text-xs text-slate-600">{SDG_NOT_TAGGED}</div>
          <p className="m-0 flex flex-wrap items-center gap-x-3 text-[13px] text-slate-600">
            <span>Sources:</span>
            <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[#0F766E] underline">
              eMASCO role page {card.code}
              {crawledOn ? ` (snapshot ${formatDate(crawledOn)})` : ''}
            </a>
            {used?.sourceUrl && (
              <a href={used.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[#0F766E] underline">
                Anthropic Economic Index (observed AI use)
              </a>
            )}
          </p>
          <p className="m-0 text-xs text-slate-600">
            eMASCO page: not checked by our link check (only our 20 scored roles are). Read from the eMASCO snapshot
            {crawledOn ? ` of ${formatDate(crawledOn)}` : ''}. ILO second opinion and OECD gap: not mapped for this role.
          </p>
          {grades && <p className="m-0 text-xs text-slate-700">{grades}</p>}
        </div>
        <div className="flex min-w-[min(100%,250px)] flex-[1_1_250px] flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-slate-600">Skill fit · AI estimate</span>
            <span className="text-base font-bold tabular-nums">{card.similarity.toFixed(2)}</span>
          </div>
          <div role="img" aria-label={`Similarity ${card.similarity.toFixed(2)}`} className="h-2 overflow-hidden rounded bg-slate-100">
            <div className="h-full bg-[#0F766E]" style={{ width: `${barWidth(card.similarity)}%` }} />
          </div>
          <p className="m-0 text-xs text-slate-600">{similarityText(card.similarity)}. Job market outlook: not available for this role.</p>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-2 py-2.5 text-center">Why this match?</summary>
            <ul className="m-0 mt-2 flex flex-col gap-1.5 pl-[18px]">
              {why.map((item) => (
                <li key={item.text}>
                  {item.matched ? 'Close to: ' : 'Closest: '}
                  {item.text}
                  <span className="text-slate-600"> ({item.score.toFixed(2)})</span>
                </li>
              ))}
            </ul>
            {missing.length > 0 && <p className="mb-0 mt-2 text-xs text-slate-600">Skills you may be missing: {missing.slice(0, 6).map((item) => item.text).join('; ')}</p>}
            {used?.state === 'ok' && <p className="mb-0 mt-2 text-xs text-slate-600">{used.shareText}. {used.sourceText} Does not change any score.</p>}
          </details>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="A study plan needs the skill, SDG and course labels that only our 20 roles have so far."
            className="min-h-11 flex-[1_1_100%] cursor-not-allowed rounded-[10px] border border-slate-200 bg-slate-100 px-2 text-sm font-bold text-slate-500"
          >
            Study plan not available yet
          </button>
        </div>
      </div>
    </article>
  );
}
