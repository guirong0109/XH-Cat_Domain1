import { useEffect, useRef, useState } from 'react';
import Chip from '../components/Chip.jsx';
import ExploreCard from '../components/ExploreCard.jsx';
import SourceNote from '../components/SourceNote.jsx';
import { matchRoles, searchSkills } from '../lib/exploreApi.js';
import {
  MIN_PICKS,
  errorText,
  levelNote,
  pickSkill,
  pickedStatus,
  resultNote,
  sourceLine,
  unpickSkill,
} from '../lib/exploreView.js';
import { CV_MESSAGES, checkCvFile } from '../lib/cvSkills.js';
import { pdfErrorCode, readPdfText } from '../lib/pdfText.js';

const SEARCH_DELAY_MS = 250;

function Card({ children, ...rest }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-[22px]" {...rest}>
      {children}
    </section>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`fr-btn min-h-11 cursor-pointer rounded-xl border px-4 text-sm font-bold ${
        active ? 'border-[#0F766E] bg-[#0F766E] text-white' : 'border-[#0F766E] bg-white text-[#0F766E]'
      }`}
    >
      {children}
    </button>
  );
}

// Roles from every field in eMASCO, found from picked skills (no AI model needed) or from a CV (needs the model).
export default function Explore({ onBack }) {
  const [mode, setMode] = useState('skills');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState([]);
  const [includeHigher, setIncludeHigher] = useState(false);
  const [cvName, setCvName] = useState(null);
  const [cvText, setCvText] = useState(null); // kept in memory only, never saved
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Skill search while typing.
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchSkills(query);
      if (cancelled) return;
      if (found.ok) {
        setSuggestions(found.skills.filter((skill) => !picked.some((item) => item.id === skill.id)));
        setError(null);
      } else {
        setSuggestions([]);
        setError(found.error);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, picked]);

  // Roles for the current input. The newest request wins.
  const pickedKey = picked.map((item) => item.id).join(',');
  useEffect(() => {
    const body =
      mode === 'skills'
        ? picked.length >= MIN_PICKS
          ? { skillIds: picked.map((item) => item.id), includeHigher }
          : null
        : cvText
          ? { text: cvText, includeHigher }
          : null;
    if (!body) {
      requestId.current += 1;
      setResult(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    matchRoles(body).then((outcome) => {
      if (!mounted.current || id !== requestId.current) return;
      setLoading(false);
      if (outcome.ok) {
        setResult(outcome.result);
        setError(null);
      } else {
        setResult(null);
        setError(outcome.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pickedKey, includeHigher, cvText]);

  const readCv = async (file) => {
    if (!file) return;
    setError(null);
    const bad = checkCvFile(file);
    if (bad) {
      setError(bad);
      return;
    }
    setReading(true);
    try {
      const text = await readPdfText(file);
      if (!mounted.current) return;
      setCvName(file.name);
      setCvText(text);
    } catch (readError) {
      if (mounted.current) setError(pdfErrorCode(readError));
    } finally {
      if (mounted.current) setReading(false);
    }
  };

  const clearCv = () => {
    setCvName(null);
    setCvText(null);
    setResult(null);
  };

  const status = pickedStatus(picked.length);
  const note = resultNote(result, mode);
  const message = error ? CV_MESSAGES[error] ?? errorText(error) : null;

  return (
    <main className="fr-screen mx-auto flex max-w-[1180px] flex-col gap-[18px] px-4 pt-6 pb-16 sm:px-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 min-h-11 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-[#0F766E] underline"
        >
          Back to Matches
        </button>
        <h1 className="m-0 mb-1.5 text-[26px] font-bold sm:text-[30px]">Explore all roles</h1>
        <p className="m-0 text-slate-600">
          Find roles from every field in eMASCO, the official Malaysian occupation list. These roles are not scored for AI risk and have no SDG tags yet.
        </p>
      </div>

      <Card aria-label="What you know">
        <div className="flex flex-wrap gap-2">
          <ModeButton active={mode === 'skills'} onClick={() => setMode('skills')}>
            Search skills
          </ModeButton>
          <ModeButton active={mode === 'cv'} onClick={() => setMode('cv')}>
            Use my CV
          </ModeButton>
        </div>

        {mode === 'skills' ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Search eMASCO skills
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="bank reconciliation"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-base font-normal"
              />
            </label>
            {suggestions.length > 0 && (
              <ul className="m-0 flex flex-col gap-1.5 p-0" aria-label="Matching skills">
                {suggestions.map((skill) => (
                  <li key={skill.id} className="list-none">
                    <button
                      type="button"
                      onClick={() => {
                        setPicked((current) => pickSkill(current, skill));
                        setQuery('');
                      }}
                      className="fr-btn min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-[#0F766E]"
                    >
                      {skill.text}
                      <span className="text-xs text-slate-600"> · used by {skill.roles} role{skill.roles === 1 ? '' : 's'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {picked.map((skill) => (
                  <Chip key={skill.id} pressed small onClick={() => setPicked((current) => unpickSkill(current, skill.id))}>
                    <span className="text-left">{skill.text}</span>
                    <span aria-label="Remove">✕</span>
                  </Chip>
                ))}
              </div>
            )}
            <div aria-live="polite" className={`text-sm ${status.ready ? 'text-slate-700' : 'text-slate-600'}`}>
              {status.text}
            </div>
          </>
        ) : cvText ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Using <strong>{cvName}</strong>
            </span>
            <button
              type="button"
              onClick={clearCv}
              className="fr-btn min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold"
            >
              Change CV
            </button>
          </div>
        ) : (
          <label className="flex min-h-[52px] cursor-pointer flex-col items-start justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-[#0F766E]">
            <span className="text-base font-bold text-[#0F766E]">{reading ? 'Reading your CV…' : 'Upload my CV (PDF)'}</span>
            <span className="text-xs text-slate-600">
              Up to 5 MB. Use a made-up CV for the demo. The text is compared on our server and not saved.
            </span>
            <input
              type="file"
              accept="application/pdf"
              disabled={reading}
              onChange={(event) => readCv(event.target.files?.[0])}
              className="sr-only"
            />
          </label>
        )}
        {message && (
          <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            {message}
          </div>
        )}
      </Card>

      <Card aria-label="Qualification level">
        <div role="group" aria-label="Qualification level" className="flex flex-wrap gap-2">
          <ModeButton active={!includeHigher} onClick={() => setIncludeHigher(false)}>
            Up to diploma (recommended)
          </ModeButton>
          <ModeButton active={includeHigher} onClick={() => setIncludeHigher(true)}>
            Include degree roles
          </ModeButton>
        </div>
        <div aria-live="polite" className="text-sm text-slate-700">
          {result ? levelNote(result, includeHigher) : 'Roles that need a degree or more are hidden unless you include them.'}
        </div>
      </Card>

      <div aria-live="polite" className="flex flex-col gap-3">
        {loading && <div className="text-sm text-slate-600">Finding roles…</div>}
        {note && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              note.kind === 'warn' ? 'border-orange-200 bg-orange-50 text-orange-900' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {note.text}
          </div>
        )}
        {result?.roles?.length > 0 && (
          <ul className="m-0 flex flex-col gap-3 p-0" aria-label="Roles found">
            {result.roles.map((card) => (
              <ExploreCard key={card.code} card={card} observedSource={result.observedSource} />
            ))}
          </ul>
        )}
      </div>

      <SourceNote>
        {result?.source
          ? sourceLine(result.source)
          : 'Source: eMASCO, Ministry of Human Resources (MASCO 2020). Similarity is an AI estimate (BAAI/bge-m3). This supports your decision. It does not make it.'}
      </SourceNote>
    </main>
  );
}
