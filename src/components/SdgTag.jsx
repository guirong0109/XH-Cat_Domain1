export default function SdgTag({ info }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
      <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: info.color }} />
      {info.short}
    </span>
  );
}
