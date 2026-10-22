import { useEffect, useMemo, useRef, useState } from 'react';
import Chip from '../components/Chip.jsx';
import LevelSwitch from '../components/LevelSwitch.jsx';
import {
  CV_AI_TEXT,
  CV_MESSAGES,
  aiOnly,
  checkCvFile,
  cvReviewLine,
  extractSkills,
  fetchCvSkills,
  mergeMatches,
  sourceBadge,
} from '../lib/cvSkills.js';
import { pdfErrorCode, readPdfText } from '../lib/pdfText.js';
import { focusAfterRemove } from '../lib/skillFocus.js';
import { cvFoundSkills, suggestField } from '../lib/fieldCheck.js';
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

export default function Skills({ data, profile, cv, onToggleSkill, onSetLevel, onCvFound, onCvSuggest, onAcceptSuggestion, onDismissSuggestion, onCvClear, onChooseField }) {
  const pickerRef = useRef(null);
  const headingRef = useRef(null);
  const removeRefs = useRef(new Map());
  const [focusNext, setFocusNext] = useState(undefined);
  useEffect(() => {
    if (focusNext === undefined) return;
    const target = focusNext === null ? headingRef.current : removeRefs.current.get(focusNext);
    (target || headingRef.current)?.focus();
    setFocusNext(undefined);
  }, [focusNext]);
  const removeSkill = (label) => {
    const next = focusAfterRemove(profile.skills, label);
    onToggleSkill(label);
    setFocusNext(next);
  };
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [cvError, setCvError] = useState(null);
  const [dragging, setDragging] = useState(false);
  // null | 'checking' | 'done' | 'fallback'
  const [aiStatus, setAiStatus] = useState(null);
  // Counts uploads and "Change": an older AI reply is ignored.
  const requestId = useRef(0);
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
  // Field-mismatch notice: only for CV skills, re-checked whenever the skills change.
  const [keptFor, setKeptFor] = useState(null);
  const pickedMajor = data.fields?.majors.find((major) => major.id === profile.field);
  const fieldSuggestion = useMemo(
    () => (cv && data.fields ? suggestField(cvFoundSkills(cv, profile.skills), profile.field, data.roles, data.fields) : null),
    [cv, data.fields, data.roles, profile.skills, profile.field],
  );
  const showFieldNotice = fieldSuggestion && keptFor !== `${cv.fileName}|${profile.field}`;

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
    const id = ++requestId.current;
    setAiStatus(null);
    try {
      const text = await readPdfText(file);
      if (!mounted.current || id !== requestId.current) return;
      const keywordFound = extractSkills(text, data.skills.labels).map((item) => ({ ...item, source: 'keyword' }));
      if (keywordFound.length > 0) {
        onCvFound(keywordFound, file.name);
        setReading(false);
      }
      setAiStatus('checking');
      const ai = await fetchCvSkills(text);
      if (!mounted.current || id !== requestId.current) return;
      if (!ai.ok) {
        if (keywordFound.length === 0) {
          setCvError('none-found');
          setAiStatus(null);
        } else {
          setAiStatus('fallback');
        }
        return;
      }
      const suggestions = aiOnly(mergeMatches(keywordFound, ai.skills));
      if (keywordFound.length === 0 && suggestions.length === 0) {
        setCvError('none-found');
        setAiStatus(null);
        return;
      }
      // AI matches wait for the student's yes; keyword matches were added above.
      if (keywordFound.length === 0) onCvFound([], file.name);
      onCvSuggest(suggestions, file.name);
      setAiStatus('done');
    } catch (error) {
      if (mounted.current && id === requestId.current) {
        setCvError(pdfErrorCode(error));
        setAiStatus(null);
      }
    } finally {
      if (mounted.current && id === requestId.current) setReading(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    readCv(event.dataTransfer.files?.[0]);
  };

  const changeCv = () => {
    requestId.current += 1;
    setAiStatus(null);
    setReading(false);
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
              {cvReviewLine(cv.mode, cv.added.length, cv.suggestions.length)} Please check each level.
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
        <div aria-live="polite">
        {showFieldNotice && (
          <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            <p className="m-0">
              Your CV looks closer to <strong>{fieldSuggestion.label}</strong>.
              {pickedMajor ? ` You picked ${pickedMajor.label}.` : ''} Based on {fieldSuggestion.skills.length} skills in
              your CV: {fieldSuggestion.skills.join(', ')}. This is a hint only. You decide.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onChooseField(fieldSuggestion.majorId)}
                className="fr-btn min-h-11 cursor-pointer rounded-xl border border-[#C2410C] bg-white px-4 text-sm font-bold text-[#C2410C]"
              >
                Switch to {fieldSuggestion.label}
              </button>
              <button
                type="button"
                onClick={() => setKeptFor(`${cv.fileName}|${profile.field}`)}
                className="fr-btn min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
              >
                Keep {pickedMajor ? pickedMajor.label : 'my pick'}
              </button>
            </div>
          </div>
        )}
        </div>
        <div aria-live="polite" className="flex flex-col gap-1">
          {reading && aiStatus !== 'checking' && <p className="m-0 text-sm text-slate-700">Reading your CV…</p>}
          {aiStatus === 'checking' && (
            <p className="m-0 flex items-center gap-2 text-sm text-slate-700">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-[#0F766E] border-t-transparent motion-safe:animate-spin"
              />
              {CV_AI_TEXT.checking}
            </p>
          )}
          {aiStatus === 'fallback' && <p className="m-0 text-sm text-[#C2410C]">{CV_AI_TEXT.fallback}</p>}
          {aiStatus === 'done' && <p className="m-0 text-[13px] text-slate-600">{CV_AI_TEXT.privacy}</p>}
        </div>
        {cvError && (
          <p role="alert" className="m-0 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            {CV_MESSAGES[cvError]}
          </p>
        )}
        {aiStatus !== 'done' && (
          <p className="m-0 text-[13px] text-slate-600">
            Your CV is read on this device. Its text is then sent to our server to look for more skills with AI. It is not saved. For the demo, please use a sample CV, not your real one.
          </p>
        )}
      </Card>

      {cv && cv.suggestions.length > 0 && (
        <Card aria-labelledby="ai-check-heading" style={{ borderColor: '#C2410C' }}>
          <h2 id="ai-check-heading" className="m-0 text-lg font-bold text-[#C2410C]">
            Check these, found by AI · estimate
          </h2>
          <p className="m-0 text-sm text-slate-600">The AI matched these lines. A skill is added only when you say yes.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {cv.suggestions.map((item) => (
              <li key={item.label} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 px-3 py-2">
                <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                  <span className="text-[15px] font-semibold">{item.label}</span>
                  <span className="text-xs break-words text-slate-600">Found in your CV: “{item.evidence}”</span>
                </span>
                <button
                  type="button"
                  onClick={() => onAcceptSuggestion(item.label)}
                  aria-label={`Add ${item.label}`}
                  className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-[#0F766E] bg-white px-3 text-[13px] font-bold text-[#0F766E]"
                >
                  Add skill
                </button>
                <button
                  type="button"
                  onClick={() => onDismissSuggestion(item.label)}
                  aria-label={`${item.label} is not mine`}
                  className="fr-btn min-h-11 cursor-pointer rounded-[10px] border border-slate-300 bg-white px-3 text-[13px] text-slate-700"
                >
                  Not mine
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
                    <>
                      {cv.sources?.[label] && (
                        <span className={`text-xs font-semibold ${cv.sources[label] === 'ai' ? 'text-[#C2410C]' : 'text-[#0F766E]'}`}>
                          {sourceBadge(cv.sources[label])}
                        </span>
                      )}
                      <span className="text-xs break-words text-slate-600">
                        Found in your CV: “{cv.evidence[label]}” · level is our guess, please check
                      </span>
                    </>
                  )}
                </span>
                <LevelSwitch
                  skill={label}
                  value={skillLevel(label, profile)}
                  onChange={(level) => onSetLevel(label, level)}
                />
                <button
                  type="button"
                  onClick={() => removeSkill(label)}
                  ref={(node) => {
                    if (node) removeRefs.current.set(label, node);
                    else removeRefs.current.delete(label);
                  }}
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
          <h2 id="skill-picker-heading" ref={headingRef} tabIndex={-1} className="m-0 text-lg font-bold outline-none">
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
