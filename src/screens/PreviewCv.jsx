import PreviewBanner from '../components/PreviewBanner.jsx';

// Example CV lines are made up for this preview. They only show for labels that exist in our skill list.
const EXAMPLES = [
  { label: 'Spreadsheets (Excel)', line: 'prepared monthly sales reports in Excel', keep: true },
  { label: 'Customer service', line: 'handled walk-in customers at a retail counter', keep: true },
  { label: 'Graphic design', line: 'designed posters for the college club', keep: false },
];

const STEPS = [
  'An AI model on RunPod reads the text.',
  'It may only pick skills from our fixed eMASCO-based list. It cannot invent new ones.',
  'You confirm or remove every skill.',
  'The CV is deleted right after. Nothing is stored.',
];

export default function PreviewCv({ data }) {
  const known = new Set(data.skills.labels.map((item) => item.label));
  const rows = EXAMPLES.filter((row) => known.has(row.label));

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-8 sm:px-6">
      <PreviewBanner>Nothing you upload here is read or saved.</PreviewBanner>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[13px] font-bold text-[#0F766E]">STEP 1</div>
          <h1 className="m-0 text-xl font-extrabold">Add your CV</h1>
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed border-slate-400 px-5 py-9 text-center">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            <div className="text-[15px] font-bold">Drop a PDF here, or paste your CV text</div>
            <button type="button" disabled className="min-h-11 rounded-[10px] border border-slate-300 bg-slate-100 px-4 text-sm text-slate-600">
              Choose file (disabled in preview)
            </button>
          </div>
          <div className="text-[13px] text-slate-700">
            <strong>How it would work</strong>
            <ol className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
              {STEPS.map((text, index) => (
                <li key={text}>
                  {index + 1}. {text}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[13px] font-bold text-[#0F766E]">STEP 2</div>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Example</span>
          </div>
          <h2 className="m-0 text-xl font-extrabold">Check the skills we found</h2>
          <div className="text-[13px] text-slate-600">Example for a sample diploma CV. Tap to keep or remove.</div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-2.5 rounded-[10px] border border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{row.label}</div>
                  <div className="text-xs text-slate-600">Found: “{row.line}”</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-[13px] ${
                    row.keep ? 'bg-[#0F766E] text-white' : 'border border-slate-300 text-slate-700'
                  }`}
                >
                  {row.keep ? 'Keep' : 'Not sure'}
                </span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-slate-600">
            Each suggestion shows the CV line it came from, so you can check it. AI suggestions can be wrong.
          </div>
          <button type="button" disabled className="min-h-11 rounded-[10px] border-0 bg-slate-500 text-sm font-bold text-white">
            Use these skills (disabled in preview)
          </button>
        </section>
      </div>
    </main>
  );
}
