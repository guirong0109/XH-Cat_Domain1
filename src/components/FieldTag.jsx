import { fieldLine } from '../lib/careerSections.js';

// The role's generated field (an AI estimate from the occupation intelligence store) and the student's skills that carry
// over to it. An unclear field names both candidates. Renders nothing when neither is known.
export default function FieldTag({ field, transferable }) {
  const line = fieldLine(field);
  if (!line && !transferable?.length) return null;
  return (
    <div className="flex flex-col gap-1">
      {line && (
        <p className="m-0 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-bold ${
              field.confidence === 'unclear' ? 'bg-amber-100 text-amber-900' : 'bg-teal-50 text-teal-900'
            }`}
          >
            {line}
          </span>
          <span className="text-xs text-slate-600">AI estimate</span>
        </p>
      )}
      {transferable?.length > 0 && (
        <p className="m-0 text-[13px] text-slate-700">Your skills that closely match this role&rsquo;s skills (AI estimate): {transferable.join(', ')}</p>
      )}
    </div>
  );
}
