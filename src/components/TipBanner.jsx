const TIPS = {
  profile: 'Pick the skills you have. The live radar on the right shows how you compare with your best-fit role.',
  radar: 'Switch between Moderate and Fast AI to see how future needs change. Every number shows its source.',
  roles: 'Roles re-rank live. Open “Why this score?” to see the exact maths and sources.',
  pathway: 'Steps are ordered by future importance. Tick them off as you go.',
};
const TIP_ORDER = ['profile', 'radar', 'roles', 'pathway'];

export default function TipBanner({ screen, seenTips, tipsOff, onDismiss, onHideAll }) {
  if (tipsOff || !TIPS[screen] || seenTips.includes(screen)) return null;
  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-4 sm:px-6">
      <div
        role="note"
        className="fr-tip flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[#0F172A] px-4 py-3.5 text-slate-50"
      >
        <div className="flex min-w-0 flex-[1_1_360px] items-center gap-3">
          <span className="flex-none rounded-md bg-teal-500 px-2 py-1 text-xs font-bold text-[#042F2E]">
            TIP {TIP_ORDER.indexOf(screen) + 1} OF {TIP_ORDER.length}
          </span>
          <span className="text-sm">{TIPS[screen]}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDismiss(screen)}
            className="min-h-11 cursor-pointer rounded-lg bg-slate-50 px-3.5 text-sm font-bold text-[#0F172A]"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="min-h-11 cursor-pointer rounded-lg border border-slate-600 bg-transparent px-3.5 text-sm text-slate-200"
          >
            Hide all tips
          </button>
        </div>
      </div>
    </div>
  );
}
