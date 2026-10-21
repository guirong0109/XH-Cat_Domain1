import { useMemo } from 'react';
import RadarChart from '../components/RadarChart.jsx';
import SourceNote from '../components/SourceNote.jsx';
import Stage2Section from '../components/Stage2Section.jsx';
import { roleRadarValues } from '../lib/radar.js';
import { rankRoles } from '../lib/scoring.js';
import { formatMonth } from '../lib/roleView.js';

const EXAMPLE_SAMPLE_ID = 'aina';

function youthFact(trends) {
  const youth = trends && trends.youth;
  if (!youth || typeof youth.rate !== 'number') {
    return { value: '—', text: 'Trend data not loaded yet' };
  }
  return {
    value: `${youth.rate.toFixed(1)}%`,
    text: `youth unemployment, ages 15 to 24, ${formatMonth(youth.month)}`,
  };
}

function FactCard({ value, text, source }) {
  return (
    <div className="fr-card rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-[32px] leading-tight font-extrabold">{value}</div>
      <div className="mt-1 text-sm text-slate-700">{text}</div>
      <SourceNote className="mt-2">{source}</SourceNote>
    </div>
  );
}

export default function Home({ data, ctx, onTrySample, onStartFresh, onNavigate }) {
  const example = useMemo(() => {
    const sample = data.samples.find((item) => item.id === EXAMPLE_SAMPLE_ID) || data.samples[0];
    if (!sample || !data.roles.length) return null;
    const top = rankRoles(data.roles, sample, ctx, 'moderate')[0].role;
    const firstName = sample.label.split(' ')[0];
    return { sample, firstName, role: top, values: roleRadarValues(top, sample, ctx.similar, 'moderate') };
  }, [data, ctx]);

  const youth = youthFact(data.trends);

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-10 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-[72px]">
      <div className="flex flex-wrap items-center gap-10">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <span className="self-start rounded-full bg-teal-100 px-3 py-1.5 text-[13px] font-bold text-[#0F766E]">
            For diploma and foundation students in Malaysia
          </span>
          <h1 className="m-0 text-[34px] leading-[1.1] font-bold tracking-[-0.02em] sm:text-5xl">
            See where you fit in Malaysia’s <span className="whitespace-nowrap">AI-era</span> job market
          </h1>
          <p className="m-0 max-w-[560px] text-lg text-slate-700">
            Tell us your skills. We show which jobs are rising, how much AI will change them, your best-fit roles and a
            step-by-step plan to get there. Built on official MASCO and OpenDOSM data.
          </p>
          <div className="flex flex-wrap gap-3">
            {example && (
              <button
                type="button"
                onClick={() => onTrySample(example.sample.id)}
                className="fr-btn min-h-[52px] cursor-pointer rounded-xl bg-[#0F766E] px-6 text-base font-bold text-white hover:bg-[#115E59]"
              >
                Try as {example.firstName} (sample student)
              </button>
            )}
            <button
              type="button"
              onClick={onStartFresh}
              className="fr-btn min-h-[52px] cursor-pointer rounded-xl border border-slate-300 bg-white px-6 text-base font-semibold text-[#0F172A]"
            >
              Start my own profile
            </button>
          </div>
          <div className="text-[13px] text-slate-600">About 2 minutes. Nothing is saved.</div>
        </div>
        {example && (
          <div className="flex flex-[1_1_300px] flex-col items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-5">
            <RadarChart
              labels={example.values.labels}
              you={example.values.you}
              need={example.values.need}
              size={300}
              showLabels={false}
              ariaLabel={`Example radar: ${example.firstName}'s skills compared with a ${example.role.title} role`}
            />
            <div className="text-center text-[13px] text-slate-600">
              {example.firstName}’s skills (teal) vs what {example.role.title} needs in future (orange)
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <FactCard
          value="56% vs 26%"
          text="of Malaysian professionals use AI at work, vs those with formal AI training"
          source="Hays Asia Salary Guide 2025"
        />
        <FactCard
          value="600,000+"
          text="workers need reskilling within 3 to 5 years"
          source="MOSTI (as cited in the Aiversecity brief, 2026)"
        />
        <FactCard value={youth.value} text={youth.text} source="OpenDOSM, lfs_month_youth" />
      </div>
      <Stage2Section onNavigate={onNavigate} />
    </main>
  );
}
