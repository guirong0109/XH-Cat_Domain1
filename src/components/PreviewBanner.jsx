// Shown at the top of every Stage 2 preview screen so it never looks like a working feature.
export default function PreviewBanner({ children }) {
  return (
    <div role="note" className="rounded-xl bg-orange-100 px-4 py-3 text-sm font-semibold text-orange-900">
      Stage 2 preview, not working yet.{children ? ` ${children}` : ''}
    </div>
  );
}
