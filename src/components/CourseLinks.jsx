import { courseOptions } from '../lib/pathwayView.js';
import { linkStatus } from '../lib/referenceView.js';
import { formatDate } from '../lib/roleView.js';

// The exact course pages for one skill (title, price, duration copied from the portal).
// With none listed, the portal's own link is shown and the text says so.
export default function CourseLinks({ skillInfo, who, references }) {
  const { courses, checkedAt, fallback } = courseOptions(skillInfo, who);

  if (courses.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {courses.map((course) => (
          <a
            key={course.url}
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="fr-btn flex min-h-11 flex-col justify-center rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 no-underline"
          >
            <span className="text-sm font-semibold text-[#0F766E]">{course.title}</span>
            <span className="text-xs text-slate-600">{[course.portalName, course.meta].filter(Boolean).join(' · ')}</span>
          </a>
        ))}
        <span className="text-xs text-slate-600">
          Course pages found on the portals{checkedAt ? ` on ${formatDate(checkedAt)}` : ''}. Title, price and length are copied from the course page.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-slate-600">No matching course is listed for this skill yet. You can search the portal:</span>
      {fallback.map((link) => {
        const status = linkStatus(references, link.url);
        return (
          <div key={link.url} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="fr-btn inline-flex min-h-11 items-center rounded-[10px] border border-slate-300 bg-white px-3.5 text-sm font-semibold no-underline"
            >
              {link.label}
            </a>
            <span className={`text-xs ${status.ok === false ? 'text-[#C2410C]' : 'text-slate-600'}`}>{status.text}</span>
          </div>
        );
      })}
    </div>
  );
}
