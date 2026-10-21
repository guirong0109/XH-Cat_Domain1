const LEVELS = [
  { id: 'basic', label: 'Basic' },
  { id: 'good', label: 'Good' },
  { id: 'strong', label: 'Strong' },
];

// A 3-way switch for one skill's level. Arrow keys move between the levels.
export default function LevelSwitch({ skill, value, onChange }) {
  const onKeyDown = (event) => {
    const index = LEVELS.findIndex((level) => level.id === value);
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = LEVELS[(index + 1) % LEVELS.length];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = LEVELS[(index + LEVELS.length - 1) % LEVELS.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    event.currentTarget.querySelector(`[data-level="${next.id}"]`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={`Your level in ${skill}`}
      onKeyDown={onKeyDown}
      className="inline-flex overflow-hidden rounded-[10px] border border-slate-300 bg-white"
    >
      {LEVELS.map((level) => {
        const checked = value === level.id;
        return (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-level={level.id}
            onClick={() => onChange(level.id)}
            className={`min-h-11 min-w-[64px] cursor-pointer border-0 px-3 text-[13px] ${
              checked ? 'bg-[#0F766E] font-bold text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
