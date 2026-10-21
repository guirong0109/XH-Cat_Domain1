export default function SourceNote({ children, className = '' }) {
  return <div className={`text-xs text-slate-600 ${className}`}>{children}</div>;
}
