const CARDS = [
  {
    screen: 'preview-cv',
    title: 'Start from your CV',
    text: 'Upload a CV. AI suggests skills from our list. You confirm each one.',
  },
  {
    screen: 'preview-lang',
    title: 'Bahasa Malaysia · 中文',
    text: 'Use the app in your language. Role text from official eMASCO Malay pages.',
  },
  {
    screen: 'preview-users',
    title: 'More users',
    text: 'Career switchers, counsellors and an HR team skills view.',
  },
];

export default function Stage2Section({ onNavigate }) {
  return (
    <section aria-labelledby="stage2-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="stage2-heading" className="m-0 text-2xl font-bold">
          Coming in Stage 2
        </h2>
        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-900">
          PREVIEW · NOT WORKING YET
        </span>
      </div>
      <p className="m-0 max-w-[640px] text-slate-700">
        Ideas we plan to build next. These screens are previews only. They do not work yet.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <button
            key={card.screen}
            type="button"
            onClick={() => onNavigate(card.screen)}
            className="flex min-h-11 cursor-pointer flex-col items-start gap-2 rounded-2xl border border-dashed border-orange-700 bg-white p-5 text-left hover:bg-orange-50"
          >
            <span className="text-base font-bold text-[#0F172A]">{card.title}</span>
            <span className="text-sm text-slate-700">{card.text}</span>
            <span className="text-sm font-bold text-[#C2410C]">See preview →</span>
          </button>
        ))}
      </div>
      <p className="m-0 text-[13px] text-slate-600">
        Not planned yet: job-posting counts. There is no free, allowed source of Malaysian job-ad data, and we do not
        show numbers we cannot source.
      </p>
    </section>
  );
}
