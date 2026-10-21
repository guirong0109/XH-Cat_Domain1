import { useState } from 'react';
import PreviewBanner from '../components/PreviewBanner.jsx';
import { EXAMPLE_TEAM, teamGrid } from '../lib/previewView.js';

const ROLE_CODE = '2524-02';

const USER_TYPES = [
  { id: 'student', label: 'Student', hint: 'Available today' },
  { id: 'switcher', label: 'Career switcher', hint: 'Starts from current job' },
  { id: 'counsellor', label: 'Counsellor', hint: 'Guide several students' },
  { id: 'hr', label: 'HR team', hint: 'Team skills view' },
];

const CELL_LOOK = {
  have: 'bg-[#0F766E] text-white',
  similar: 'border-2 border-[#0F766E] bg-white text-[#0F766E]',
  gap: 'border-2 border-dashed border-[#C2410C] bg-white text-[#9A3412]',
};
const CELL_TEXT = { have: 'Has', similar: 'Similar', gap: 'Gap' };

function TeamGrid({ data }) {
  const role = data.roles.find((item) => item.code === ROLE_CODE) || null;
  const grid = teamGrid(role, EXAMPLE_TEAM, data.skills.similar);
  if (!grid) {
    return <p className="m-0 text-sm text-slate-700">The example role is not available in this data.</p>;
  }
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-extrabold">
            Team skills vs target role: {role.title} (MASCO {ROLE_CODE})
          </h2>
          <div className="text-[13px] text-slate-600">Which skills each person has, and where the team has gaps.</div>
        </div>
        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Example team</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1.5 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="p-1.5 text-left font-bold">Person</th>
              {grid.skills.map((label) => (
                <th key={label} scope="col" className="min-w-24 p-1.5 font-bold">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.name}>
                <th scope="row" className="p-1.5 text-left font-semibold whitespace-nowrap">{row.name}</th>
                {row.cells.map((status, i) => (
                  <td key={grid.skills[i]} className={`rounded-lg p-2.5 text-center ${CELL_LOOK[status]}`}>
                    {CELL_TEXT[status]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[13px] text-slate-700">
        {grid.biggestGap ? (
          <>Biggest team gap: <strong>{grid.biggestGap}</strong></>
        ) : (
          'No team gap: every skill is covered by at least one person.'
        )}
      </div>
      <div className="text-xs text-slate-600">
        Skills from eMASCO role {ROLE_CODE}. Same scoring rules as the student view. Real use would need consent and no names stored.
      </div>
    </div>
  );
}

export default function PreviewUsers({ data }) {
  const [type, setType] = useState('hr');

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-8 sm:px-6">
      <PreviewBanner>The team below is made-up example data.</PreviewBanner>
      <section className="flex flex-col gap-2.5">
        <h1 className="m-0 text-xl font-extrabold">Who are you?</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {USER_TYPES.map((item) => {
            const on = type === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => setType(item.id)}
                className={`min-h-11 cursor-pointer rounded-xl p-3 text-left ${
                  on ? 'border-2 border-[#0F766E] bg-teal-50' : 'border border-slate-300 bg-white'
                }`}
              >
                <strong className="block text-[15px]">{item.label}</strong>
                <span className={`text-xs ${on ? 'text-teal-800' : 'text-slate-600'}`}>{item.hint}</span>
              </button>
            );
          })}
        </div>
      </section>
      {type === 'hr' ? (
        <TeamGrid data={data} />
      ) : (
        <p className="m-0 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
          Preview only. This view is planned for Stage 2.
        </p>
      )}
    </main>
  );
}
