import { useEffect, useMemo, useRef, useState } from 'react';
import Chip from './Chip.jsx';
import LevelSwitch from './LevelSwitch.jsx';
import {
  CV_AI_TEXT,
  CV_MESSAGES,
  aiOnly,
  checkCvFile,
  cvReviewLine,
  extractSkills,
  fetchCvSkills,
  LEVEL_REASONS,
  linesNotMatched,
  mergeMatches,
  sourceBadge,
  unmatchedLines,
} from '../lib/cvSkills.js';
import { pdfErrorCode, readPdfText } from '../lib/pdfText.js';
import { focusAfterRemove } from '../lib/skillFocus.js';
import { cvFoundSkills, suggestField, weakFit } from '../lib/fieldCheck.js';
import { MIN_SKILLS } from '../lib/navigation.js';
import { LEVEL_CREDIT, skillLevel } from '../lib/scoring.js';
import { commonSkills, commonSkillsLine } from '../lib/fieldSkills.js';

const LEVEL_LINE = `Your level counts in the fit score: Strong ${LEVEL_CREDIT.strong}, Good ${LEVEL_CREDIT.good}, Basic ${LEVEL_CREDIT.basic}.`;

function Card({ children, ...rest }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]" {...rest}>
      {children}
    </section>
  );
}

// The skills part of About you. path 'cv': upload and check what the CV gave;
// path 'pick': pick skills, with the field's common skills listed first.
export default function SkillsStep({ data, profile, cv, path, field, onNoCv, onToggleSkill, onSetLevel, onCvFound, onCvSuggest, onAcceptSuggestion, onDismissSuggestion, onCvClear, onChooseField }) {
  const common = useMemo(() => (path === 'pick' ? commonSkills(field, data.roles) : []), [path, field, data.roles]);
  // CV sentences that matched no skill: memory only, never saved or sent.
  const [notMatched, setNotMatched] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(path === 'pick');
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
  // CV lines shown when no skill matched: memory only, never saved or sent.
  const [unread, setUnread] = useState(null);
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
  const weak = useMemo(
    () => (cv && data.fields && !fieldSuggestion ? weakFit(cvFoundSkills(cv, profile.skills), profile.field, data.roles, data.fields) : null),
    [cv, data.fields, data.roles, profile.skills, profile.field, fieldSuggestion],
  );
  const showWeak = weak && keptFor !== `${cv.fileName}|${profile.field}`;
  const showFieldNotice = fieldSuggestion && keptFor !== `${cv.fileName}|${profile.field}`;

  const goToPicker = () => {
    setPickerOpen(true);
    // Wait one frame so a folded picker is shown before it is scrolled to.
    requestAnimationFrame(() => {
      pickerRef.current?.scrollIntoView({ block: 'start' });
      pickerRef.current?.focus();
    });
  };

  const readCv = async (file) => {
    // Reset so the same file can be chosen again.
    if (fileRef.current) fileRef.current.value = '';
    if (!file || reading) return;
    setCvError(null);
    setUnread(null);
    setNotMatched(null);
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
      const evidenceOf = (items) => items.map((item) => item.evidence);
      if (keywordFound.length > 0) {
        onCvFound(keywordFound, file.name);
        setNotMatched(linesNotMatched(text, evidenceOf(keywordFound)));
        setReading(false);
      }
      setAiStatus('checking');
      const ai = await fetchCvSkills(text);
      if (!mounted.current || id !== requestId.current) return;
      if (!ai.ok) {
        if (keywordFound.length === 0) {
          setCvError('none-found');
          setUnread(unmatchedLines(text));
          setAiStatus(null);
        } else {
          setAiStatus('fallback');
        }
        return;
      }
      const suggestions = aiOnly(mergeMatches(keywordFound, ai.skills));
      if (keywordFound.length === 0 && suggestions.length === 0) {
        setCvError('none-found');
          setUnread(unmatchedLines(text));
        setAiStatus(null);
        return;
      }
      // AI matches wait for the student's yes; keyword matches were added above.
      if (keywordFound.length === 0) onCvFound([], file.name);
      onCvSuggest(suggestions, file.name);
      setNotMatched(linesNotMatched(text, evidenceOf([...keywordFound, ...suggestions])));
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
    setUnread(null);
    setNotMatched(null);
  };

  const levelsCard = (
      <Card aria-labelledby="your-skills-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="your-skills-heading" className="m-0 text-lg font-bold">
            {path === 'cv' ? 'Check what we found in your CV' : 'Set your skill levels'}
          </h2>
          <span aria-live="polite" className="text-[13px] text-slate-600">
            {count} picked{count < MIN_SKILLS ? ` · pick ${MIN_SKILLS - count} more to continue` : ''}
          </span>
        </div>
        <p className="m-0 text-sm text-slate-600">{LEVEL_LINE}</p>
        {count === 0 ? (
          <p className="m-0 text-sm text-slate-600">No skills yet. Pick them in the list above.</p>
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
                      <span className="text-xs break-words text-slate-600">Found in your CV: “{cv.evidence[label]}”</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {LEVEL_REASONS[cv.reasons?.[label]] ?? 'Level is our guess'} · please check
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
        {path === 'cv' && notMatched && notMatched.total > 0 && (
          <details className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-700">
              Lines we read but did not match to a skill ({notMatched.total})
            </summary>
            <ul className="m-0 list-disc pl-5 text-[13px] break-words text-slate-700">
              {notMatched.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="m-0 mt-1 text-xs text-slate-600">
              Showing {notMatched.lines.length} of {notMatched.total}. If one of these is a skill, add it with “Add more skills”.
              Your CV text stays on this screen and is not saved.
            </p>
          </details>
        )}
        {path === 'cv' && cv && (
          <button
            type="button"
            aria-expanded={pickerOpen}
            onClick={() => (pickerOpen ? setPickerOpen(false) : goToPicker())}
            className="fr-btn min-h-11 self-start cursor-pointer rounded-xl border border-[#0F766E] bg-white px-4 text-sm font-bold text-[#0F766E]"
          >
            {pickerOpen ? 'Hide the skill list' : '+ Add more skills'}
          </button>
        )}
      </Card>
  );

  const picker = (
      <section
        ref={pickerRef}
        tabIndex={-1}
        hidden={path === 'cv' && !pickerOpen}
        aria-labelledby="skill-picker-heading"
        className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 outline-none sm:p-[22px]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="skill-picker-heading" ref={headingRef} tabIndex={-1} className="m-0 text-lg font-bold outline-none">
            Pick your skills
          </h2>
          <span className="text-[13px] text-slate-600">From eMASCO skill statements</span>
        </div>
        {path === 'pick' && (
          common.length > 0 ? (
            <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
              <p className="m-0">{commonSkillsLine(field.label, common[0].total)}</p>
              <p className="m-0 mt-1 text-[13px]">
                {common.map((item) => `${item.label} (${item.count} of ${item.total})`).join(' · ')}
              </p>
            </div>
          ) : (
            <p className="m-0 text-sm text-slate-600">
              We have no common skills for {field ? field.label : 'your field'} yet. Please pick your skills from this list.
            </p>
          )
        )}
        <div className="flex flex-wrap gap-2">
          {data.skills.labels.map(({ label }) => (
            <Chip key={label} pressed={profile.skills.includes(label)} onClick={() => onToggleSkill(label)}>
              {label}
            </Chip>
          ))}
        </div>
      </section>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {path === 'cv' && (
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
              onClick={onNoCv}
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
        <div aria-live="polite">
          {showWeak && (
            <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <p className="m-0">
                Only {weak.fit} of the {weak.found} skills in your CV are used by {weak.label} roles. This app covers 20 roles in
                tech, data, business, engineering, design, education and health, so your CV may be outside what we cover. Please
                check your skills. This is a hint only. You decide.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setKeptFor(`${cv.fileName}|${profile.field}`)}
                  className="fr-btn min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
                >
                  Keep my picks
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeptFor(`${cv.fileName}|${profile.field}`);
                    goToPicker();
                  }}
                  className="fr-btn min-h-11 cursor-pointer rounded-xl border border-[#C2410C] bg-white px-4 text-sm font-bold text-[#C2410C]"
                >
                  Choose skills myself
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
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            <p className="m-0">{CV_MESSAGES[cvError]}</p>
            {cvError === 'none-found' && unread && unread.lines.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="m-0 text-[13px] font-bold">What we read in your CV, not matched to any skill we know</p>
                <ul className="m-0 list-disc pl-5 text-[13px] break-words">
                  {unread.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="m-0 text-xs">
                  Showing {unread.lines.length} of {unread.total} lines. Your CV text stays on this screen and is not saved.
                </p>
              </div>
            )}
            {cvError === 'none-found' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="fr-btn min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
                >
                  Upload another CV
                </button>
                <button
                  type="button"
                  onClick={onNoCv}
                  className="fr-btn min-h-11 cursor-pointer rounded-xl border border-[#0F766E] bg-white px-4 text-sm font-bold text-[#0F766E]"
                >
                  Pick my skills
                </button>
              </div>
            )}
          </div>
        )}
        {aiStatus !== 'done' && (
          <p className="m-0 text-[13px] text-slate-600">
            Your CV is read on this device. Its text is then sent to our server to look for more skills with AI. It is not saved. For the demo, please use a sample CV, not your real one.
          </p>
        )}
      </Card>
      )}

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
                  {LEVEL_REASONS[item.reason] && (
                    <span className="text-xs text-slate-600">If you add it, first guess: {LEVEL_REASONS[item.reason]}</span>
                  )}
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

      {/* No CV: pick first, then levels. CV: levels only after a CV is read; the picker is folded. */}
      {path === 'pick' ? (
        <>
          {picker}
          {levelsCard}
        </>
      ) : (
        <>
          {cv && levelsCard}
          {picker}
        </>
      )}
    </div>
  );
}
