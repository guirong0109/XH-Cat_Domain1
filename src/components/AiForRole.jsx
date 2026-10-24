import { aiForRole } from '../lib/aiForRole.js';
import { formatDate } from '../lib/roleView.js';
import SourceNote from './SourceNote.jsx';

function CourseCard({ course }) {
  return (
    <a
      href={course.url}
      target="_blank"
      rel="noopener noreferrer"
      className="fr-btn flex min-h-11 flex-col justify-center rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 no-underline"
    >
      <span className="text-sm font-semibold text-[#0F766E]">{course.title}</span>
      <span className="text-xs text-slate-600">{[course.portalName, course.meta].filter(Boolean).join(' · ')}</span>
      {course.helpsWith && <span className="text-xs text-slate-600">Helps with: {course.helpsWith.join(', ')}</span>}
      {course.changed && <span className="text-xs text-[#C2410C]">The course page changed since we saved it. Check the details there.</span>}
    </a>
  );
}

// Information only: it never changes a score.
export default function AiForRole({ role, aiCourses, checks }) {
  const view = aiForRole(role, aiCourses, checks);
  if (!view || (view.general.length === 0 && view.specific.length === 0)) return null;

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-lg font-bold">Use AI in your job: {role.title}</h2>
          <p className="m-0 mt-1 text-sm text-slate-600">AI skills to learn for the role you chose. Not part of the score.</p>
        </div>
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Team draft</span>
      </div>

      {view.ilo && (
        <p className="m-0 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {view.ilo.text}{' '}
          <a href={view.ilo.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0F766E]">
            See the ILO table row
          </a>
        </p>
      )}

      {view.general.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold text-slate-700">Start here (useful in any job)</h3>
          {view.general.map((course) => (
            <CourseCard key={course.url} course={course} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold text-slate-700">For {role.title} work</h3>
        {view.specific.length > 0 ? (
          view.specific.map((course) => <CourseCard key={course.url} course={course} />)
        ) : (
          <p className="m-0 text-sm text-slate-600">No AI course on the portals matches this role's skills yet.</p>
        )}
      </div>

      <SourceNote>
        Source: ILO Working Paper 140 (2025), Table A1 (the MASCO-to-ISCO link is our team's draft mapping). Courses are real pages
        on HRD Corp e-Latih; title, price and length are copied from the course page
        {view.checkedAt ? `, last checked ${formatDate(view.checkedAt)}` : ''}. Which course helps which skill is our team's draft
        matching. Estimates, not predictions for one person.
      </SourceNote>
    </section>
  );
}
