export const STEPS = [
  { screen: 'profile', label: '1 Profile' },
  { screen: 'radar', label: '2 Radar' },
  { screen: 'roles', label: '3 Roles' },
  { screen: 'pathway', label: '4 Pathway' },
];

// lockedScreens: steps that cannot be opened yet (e.g. fewer than 3 skills).
export default function StepNav({ screen, onNavigate, lockedScreens = [] }) {
  return (
    <nav aria-label="Steps" className="flex flex-wrap gap-1 text-[13px] sm:gap-1.5 sm:text-sm">
      {STEPS.map((step) => {
        const current = screen === step.screen;
        const locked = lockedScreens.includes(step.screen);
        const look = current
          ? 'bg-[#0F766E] text-white font-bold'
          : locked
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-slate-100 text-slate-700 cursor-pointer';
        return (
          <button
            key={step.screen}
            type="button"
            disabled={locked}
            aria-current={current ? 'step' : undefined}
            onClick={() => onNavigate(step.screen)}
            className={`fr-btn min-h-11 rounded-full px-3 sm:px-3.5 ${look}`}
          >
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
