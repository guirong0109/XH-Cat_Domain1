const SIZE = {
  regular: 'min-h-11 px-4 text-sm',
  small: 'min-h-11 px-3 text-[13px]',
};

const STATE = {
  on: 'bg-[#0F766E] text-white border-[#0F766E] font-semibold',
  learn: 'bg-[#C2410C] text-white border-[#C2410C] font-semibold',
  off: 'bg-white text-slate-700 border-slate-300 hover:border-[#0F766E]',
  disabled: 'cursor-not-allowed border-dashed bg-white text-slate-500 border-slate-300',
};

// tone "learn" shows a picked chip in orange (skills the student wants to learn).
export default function Chip({ pressed, onClick, small = false, disabled = false, tone = 'on', children }) {
  let state = pressed ? tone : 'off';
  if (disabled) state = 'disabled';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`fr-chip inline-flex items-center gap-2 rounded-full border ${disabled ? '' : 'cursor-pointer'} ${SIZE[small ? 'small' : 'regular']} ${STATE[state]}`}
    >
      {children}
    </button>
  );
}
