// The tick box at the left of a role card: tick it to track the role on Your roles.
export default function TrackBox({ title, rank, checked, onChange }) {
  return (
    <label
      className={`flex size-11 flex-none cursor-pointer items-center justify-center rounded-xl border-2 ${
        checked ? 'border-[#0F766E] bg-[#0F766E] text-white' : 'border-slate-300 bg-white text-transparent hover:border-[#0F766E]'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">
        {checked ? 'Tracking' : 'Track'} {title} (rank {rank})
      </span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </label>
  );
}
