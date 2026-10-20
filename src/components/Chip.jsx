const SIZE = {
  regular: 'min-h-11 px-4 text-sm',
  small: 'min-h-11 px-3 text-[13px]',
};

const STATE = {
  on: 'bg-[#0F766E] text-white border-[#0F766E] font-semibold',
  off: 'bg-white text-slate-700 border-slate-300 hover:border-[#0F766E]',
};

export default function Chip({ pressed, onClick, small = false, children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`fr-chip inline-flex cursor-pointer items-center gap-2 rounded-full border ${SIZE[small ? 'small' : 'regular']} ${STATE[pressed ? 'on' : 'off']}`}
    >
      {children}
    </button>
  );
}
