import { journeySteps, nextHint } from '../lib/journey.js';
import { formatDate } from '../lib/roleView.js';

const PREVIEW_LINKS = [
  { screen: 'preview-cv', label: 'Start from your CV' },
  {
    screen: 'preview-lang',
    label: (
      <>
        BM · <span lang="zh">中文</span>
      </>
    ),
  },
  { screen: 'preview-users', label: 'More users' },
];

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const MARK_LOOK = {
  done: 'bg-[#0F766E] text-white',
  current: 'border-2 border-[#0F766E] text-[#0F766E]',
  todo: 'border-2 border-slate-400 text-slate-600',
  locked: 'bg-slate-100 text-slate-500',
};

function StepMark({ step }) {
  let inner = step.number ?? '•';
  if (step.state === 'done') inner = <Tick />;
  if (step.state === 'locked') inner = <Lock />;
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 flex-none items-center justify-center rounded-full text-xs font-bold ${MARK_LOOK[step.state]}`}
    >
      {inner}
    </span>
  );
}

function profileSummary(data, profile) {
  const sample = data.samples.find((item) => item.id === profile.sampleId);
  const name = sample ? sample.label : 'Your profile';
  const skills = `${profile.skills.length} ${profile.skills.length === 1 ? 'skill' : 'skills'}`;
  const interests = `${profile.interests.length} ${profile.interests.length === 1 ? 'interest' : 'interests'}`;
  const sdgs = profile.sdgs.length ? `SDG ${[...profile.sdgs].sort((a, b) => a - b).join(', ')}` : 'no SDGs yet';
  return { name, detail: `${skills} · ${interests} · ${sdgs}` };
}

function dataLine(data) {
  const emasco = data.roles[0]?.source?.fetchedAt;
  const year = data.trends?.source?.latestYear;
  const parts = [];
  if (emasco) parts.push(`eMASCO ${formatDate(emasco)}`);
  if (year) parts.push(`OpenDOSM to ${year}`);
  parts.push('ILO WP140 (2025)');
  return `Data: ${parts.join(' · ')}. All results are estimates. You decide.`;
}

// The left panel's content. Used as a fixed panel on wide screens and inside
// the phone menu. onNavigate is called with a screen name.
export default function Sidebar({ data, profile, screen, onNavigate, onClose }) {
  const steps = journeySteps(screen, profile.skills.length);
  const summary = profileSummary(data, profile);

  return (
    <div className="flex min-h-full flex-col gap-5 px-4 py-5">
      <div className="flex items-center gap-2.5 px-1.5">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="FutureReady MY home"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
        >
          <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-[#0F766E] font-extrabold text-white">
            FR
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-bold">FutureReady MY</span>
            <span className="block text-xs text-slate-600">AI supports. You decide.</span>
          </span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-[10px] border border-slate-300 bg-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <section aria-label="Your profile" className="flex flex-col gap-1 rounded-xl border border-teal-200 bg-[#F0FDFA] p-3">
        <span className="text-xs font-bold text-[#115E59]">YOUR PROFILE</span>
        <span className="text-[15px] font-bold">{summary.name}</span>
        <span className="text-[13px] text-slate-700">{summary.detail}</span>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[13px] font-bold text-[#0F766E] underline-offset-2 hover:underline"
        >
          Edit profile
        </button>
      </section>

      <nav aria-label="Your journey" className="flex flex-col gap-1">
        <span className="px-2 pb-1 text-xs font-bold text-slate-600">YOUR JOURNEY</span>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {steps.map((step) => {
            const current = step.state === 'current';
            const locked = step.state === 'locked';
            return (
              <li key={step.screen}>
                <button
                  type="button"
                  disabled={locked}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => onNavigate(step.screen)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-[10px] border-0 px-2.5 text-left text-[15px] ${
                    current
                      ? 'bg-[#CCFBF1] font-bold text-[#0F766E]'
                      : locked
                        ? 'cursor-not-allowed bg-transparent text-slate-500'
                        : 'cursor-pointer bg-transparent text-[#0F172A] hover:bg-slate-100'
                  }`}
                >
                  <StepMark step={step} />
                  <span className="flex min-w-0 flex-col">
                    <span>
                      {step.number ? `${step.number} · ${step.label}` : step.label}
                      {step.state === 'done' && <span className="sr-only"> (done)</span>}
                    </span>
                    {locked && <span className="text-xs font-normal">{step.lockReason}</span>}
                  </span>
                  {current && <span className="ml-auto text-[11px]">You are here</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-label="Next step" className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3">
        <span className="text-xs font-bold text-slate-600">NEXT STEP</span>
        <span className="text-[13px] text-slate-700">{nextHint(screen, profile.skills.length)}</span>
      </section>

      <nav aria-label="Coming in Stage 2" className="flex flex-col gap-1">
        <span className="px-2 pb-1 text-xs font-bold text-slate-600">COMING IN STAGE 2</span>
        {PREVIEW_LINKS.map((link) => {
          const current = screen === link.screen;
          return (
            <button
              key={link.screen}
              type="button"
              aria-current={current ? 'page' : undefined}
              onClick={() => onNavigate(link.screen)}
              className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[10px] border-0 px-2.5 text-left text-sm ${
                current ? 'bg-orange-50 font-bold text-[#9A3412]' : 'bg-transparent text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>{link.label}</span>
              <span className="ml-auto rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-[#9A3412]">PREVIEW</span>
            </button>
          );
        })}
      </nav>

      <p className="m-0 mt-auto px-2 text-[11px] leading-relaxed text-slate-600">{dataLine(data)}</p>
    </div>
  );
}
