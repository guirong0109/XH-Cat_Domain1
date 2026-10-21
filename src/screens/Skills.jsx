import { useEffect, useRef, useState } from 'react';
import Chip from '../components/Chip.jsx';
import LevelSwitch from '../components/LevelSwitch.jsx';
import { CV_MESSAGES, checkCvFile, cvBannerText, extractSkills } from '../lib/cvSkills.js';
import { pdfErrorCode, readPdfText } from '../lib/pdfText.js';
import { MIN_SKILLS } from '../lib/navigation.js';
import { LEVEL_CREDIT, skillLevel } from '../lib/scoring.js';

const LEVEL_LINE = `Your level counts in the fit score: Strong ${LEVEL_CREDIT.strong}, Good ${LEVEL_CREDIT.good}, Basic ${LEVEL_CREDIT.basic}.`;

function Card({ children, ...rest }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]" {...rest}>
      {children}
    </section>
  );
}

export default function Skills({ data, profile, cv, onToggleSkill, onSetLevel, onCvFound, onCvClear }) {
  const pickerRef = useRef(null);
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [cvError, setCvError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A PDF dropped outside the zone must not make the browser open it.
  useEffect(() => {
    const stop = (event) => event.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);
  const count = profile.skills.length;

  const goToPicker = () => {
    pickerRef.current?.scrollIntoView({ block: 'start' });
    pickerRef.current?.focus();
  };

  const readCv = async (file) => {
    // Reset so the same file can be chosen again.
    if (fileRef.current) fileRef.current.value = '';
    if (!file || reading) return;
    setCvError(null);
    const bad = checkCvFile(file);
    if (bad) {
      setCvError(bad);
      return;
    }
    setReading(true);
    try {
      const text = await readPdfText(file);
      if (!mounted.current) return;
      const found = extractSkills(text, data.skills.labels);
      if (found.length === 0) setCvError('none-found');
      else onCvFound(found, file.name);
    } catch (error) {
      if (mounted.current) setCvError(pdfErrorCode(error));
    } finally {
      if (mounted.current) setReading(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    readCv(event.dataTransfer.files?.[0]);
  };

  const changeCv = () => {
    onCvClear();
    setCvError(null);
  };

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Your skills</h1>
        <p className="m-0 text-slate-600">Pick at least {MIN_SKILLS} skills you have now, then check each level.</p>
      </div>

      <Card aria-label="Start from your CV">
        {cv ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 min-w-0 flex-[1_1_200px] text-[15px]">
              Read <strong className="break-all">{cv.fileName}</strong>.{' '}
              {cvBannerText(cv.mode, cv.count)}
            </p>
            <button
              type="button"
              onClick={changeCv}
              className="fr-btn min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex min-h-[52px] flex-[1_1_220px] cursor-pointer flex-col items-start justify-center rounded-xl border-2 border-dashed px-5 py-2 text-left focus-within:outline focus-within:outline-2 focus-within:outline-[#0F766E] ${
                dragging ? 'border-[#0F766E] bg-teal-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <span className="text-base font-bold text-[#0F766E]">{reading ? 'Reading your CV…' : 'Upload my CV (PDF)'}</span>
              <span className="text-xs text-slate-600">Choose a file or drop it here. Up to 5 MB.</span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                disabled={reading}
                onChange={(event) => readCv(event.target.files?.[0])}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={goToPicker}
              className="fr-btn min-h-[52px] cursor-pointer rounded-xl border border-[#0F766E] bg-white px-5 text-base font-bold text-[#0F766E]"
            >
              I don't have a CV
            </button>
          </div>
        )}
        {reading && (
          <p role="status" className="m-0 text-sm text-slate-700">
            Reading your CV…
          </p>
        )}
        {cvError && (
          <p role="alert" className="m-0 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            {CV_MESSAGES[cvError]}
          </p>
        )}
        <p className="m-0 text-[13px] text-slate-600">Your CV is read on this device only. It is never sent or saved.</p>
      </Card>

      <Card aria-labelledby="your-skills-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="your-skills-heading" className="m-0 text-lg font-bold">
            Your skills and levels
          </h2>
          <span aria-live="polite" className="text-[13px] text-slate-600">
            {count} picked{count < MIN_SKILLS ? ` · pick ${MIN_SKILLS - count} more to continue` : ''}
          </span>
        </div>
        <p className="m-0 text-sm text-slate-600">{LEVEL_LINE}</p>
        {count === 0 ? (
          <p className="m-0 text-sm text-slate-600">No skills yet. Pick them from the list below.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {profile.skills.map((label) => (
              <li
                key={label}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 px-3 py-2"
              >
                <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                  <span className="text-[15px] font-semibold">{label}</span>
                  {cv?.evidence[label] && (
                    <span className="text-xs break-words text-slate-600">
                      Found in your CV: “{cv.evidence[label]}” · level is our guess, please check
                    </span>
                  )}
                </span>
                <LevelSwitch
                  skill={label}
                  value={skillLevel(label, profile)}
                  onChange={(level) => onSetLevel(label, level)}
                />
                <button
                  type="button"
                  onClick={() => onToggleSkill(label)}
                  aria-label={`Remove ${label}`}
                  className="min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-3 text-[13px] text-slate-700 hover:border-[#C2410C] hover:text-[#C2410C]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section
        ref={pickerRef}
        tabIndex={-1}
        aria-labelledby="skill-picker-heading"
        className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 outline-none sm:p-[22px]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="skill-picker-heading" className="m-0 text-lg font-bold">
            Pick your skills
          </h2>
          <span className="text-[13px] text-slate-600">From eMASCO skill statements</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.skills.labels.map(({ label }) => (
            <Chip key={label} pressed={profile.skills.includes(label)} onClick={() => onToggleSkill(label)}>
              {label}
            </Chip>
          ))}
        </div>
      </section>
    </main>
  );
}
