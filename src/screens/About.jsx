import Chip from '../components/Chip.jsx';
import { fieldOptions } from '../lib/goalView.js';

const WHO_CHOICES = [
  { id: 'student', title: 'Student or fresh graduate', text: 'Diploma, foundation or just finished studying.' },
  { id: 'working', title: 'Working', text: 'You have a job now and want to grow or change.' },
];

const FIELD_QUESTION = {
  student: 'What is your current major?',
  working: 'Which sector do you work in now?',
};

export default function About({ data, profile, onChooseWho, onChooseField, onLoadSample }) {
  const options = data.fields ? fieldOptions(profile.who, data.fields) : [];

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">About you</h1>
        <p className="m-0 text-slate-600">Two quick questions. Nothing is saved.</p>
      </div>

      <div role="group" aria-label="Who are you?" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {WHO_CHOICES.map((choice) => {
          const picked = profile.who === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={picked}
              onClick={() => onChooseWho(choice.id)}
              className={`fr-card flex min-h-[150px] cursor-pointer flex-col justify-center gap-2 rounded-2xl border-2 p-5 text-left ${
                picked ? 'border-[#0F766E] bg-[#F0FDFA]' : 'border-slate-200 bg-white hover:border-[#0F766E]'
              }`}
            >
              <span className="text-xl font-bold">{choice.title}</span>
              <span className="text-sm text-slate-600">{choice.text}</span>
              {picked && <span className="text-[13px] font-bold text-[#0F766E]">Picked</span>}
            </button>
          );
        })}
      </div>

      {profile.who && (
        <section
          aria-labelledby="field-heading"
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]"
        >
          <h2 id="field-heading" className="m-0 text-lg font-bold">
            {FIELD_QUESTION[profile.who]}
          </h2>
          {options.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <Chip key={option.id} pressed={profile.field === option.id} onClick={() => onChooseField(option.id)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
              <p className="m-0 text-[13px] text-slate-600">
                We use this to order your matches. It does not change any score. Major and sector links are a team draft.
              </p>
            </>
          ) : (
            <p role="status" className="m-0 text-sm text-amber-900">
              The list of majors and sectors is not loaded. Please refresh the page or try a sample below.
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">Demo:</span>
        {data.samples.map((sample) => (
          <button
            key={sample.id}
            type="button"
            aria-pressed={profile.sampleId === sample.id}
            onClick={() => onLoadSample(sample.id)}
            className={`fr-btn min-h-11 cursor-pointer rounded-[10px] border px-3.5 text-sm ${
              profile.sampleId === sample.id
                ? 'border-[#0F766E] bg-teal-100 font-bold text-teal-900'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {sample.label}
          </button>
        ))}
        <span className="text-[13px] text-slate-600">Sample students, no real data. Opens their matches.</span>
      </div>
    </main>
  );
}
