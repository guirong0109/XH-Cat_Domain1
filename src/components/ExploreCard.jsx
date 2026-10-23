import { barWidth, gradesText, levelLabel, missingSkills, similarityText, whyLines } from '../lib/exploreView.js';

const MISSING_SHOWN = 12;

// One eMASCO role from "Explore all roles". Similarity is an AI estimate; AI risk is not scored for these roles.
export default function ExploreCard({ card }) {
  const why = whyLines(card);
  const missing = missingSkills(card);
  const grades = gradesText(card);
  return (
    <li className="flex list-none flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="m-0 min-w-0 text-base font-bold">{card.baseTitle || card.title}</h3>
        <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {levelLabel(card.qualificationLevel)}
        </span>
      </div>
      <div className="text-xs text-slate-600">
        MASCO {card.code}
        {card.tags?.length ? ` · ${card.tags.join(', ')}` : ''}
      </div>
      {grades && (
        <div className="text-xs text-slate-700">
          {grades}:{' '}
          {card.grades.map((item, position) => (
            <span key={item.code}>
              {position > 0 && ', '}
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[#0F766E] underline">
                {item.grade || item.code}
              </a>
            </span>
          ))}
        </div>
      )}
      <div>
        <div
          role="img"
          aria-label={`Similarity ${card.similarity.toFixed(2)}`}
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full bg-[#0F766E]" style={{ width: `${barWidth(card.similarity)}%` }} />
        </div>
        <div className="mt-1 text-xs text-slate-600">{similarityText(card.similarity)}</div>
      </div>

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-[#0F766E]">Why this role</summary>
        <ul className="m-0 flex flex-col gap-1.5 pl-[18px]">
          {why.map((item) => (
            <li key={item.text}>
              {item.matched ? 'Matches: ' : 'Closest: '}
              {item.text}
              <span className="text-slate-600">
                {' '}
                ({item.score.toFixed(2)}
                {item.evidence ? `, from "${item.evidence}"` : ''})
              </span>
            </li>
          ))}
        </ul>
        {card.bestLines?.length > 0 && (
          <p className="mb-0 mt-2 text-xs text-slate-600">
            Closest lines you gave: {card.bestLines.map((item) => `"${item.line}"`).join(', ')}
          </p>
        )}
      </details>

      {missing.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-[#0F766E]">
            Skills I may be missing ({missing.length})
          </summary>
          <ul className="m-0 flex flex-col gap-1 pl-[18px]">
            {missing.slice(0, MISSING_SHOWN).map((item) => (
              <li key={item.text}>{item.text}</li>
            ))}
          </ul>
          {missing.length > MISSING_SHOWN && (
            <p className="mb-0 mt-1 text-xs text-slate-600">
              And {missing.length - MISSING_SHOWN} more on the eMASCO page.
            </p>
          )}
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">AI risk: not scored</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">SDG: not tagged yet</span>
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0F766E] underline"
        >
          View on eMASCO
        </a>
      </div>
    </li>
  );
}
