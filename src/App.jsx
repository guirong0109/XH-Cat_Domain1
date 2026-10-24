import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MobileBar from './components/MobileBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import StepBar from './components/StepBar.jsx';
import TipBanner from './components/TipBanner.jsx';
import Home from './screens/Home.jsx';
import About from './screens/About.jsx';
import Skills from './screens/Skills.jsx';
import Goal from './screens/Goal.jsx';
import Matches from './screens/Matches.jsx';
import Overview from './screens/Overview.jsx';
import { MAX_TRACKED, toggleTracked } from './lib/overviewView.js';
import Study from './screens/Study.jsx';
import Explore from './screens/Explore.jsx';
import { rankBySkillMatch } from './lib/skillRanking.js';
import { MIN_SKILLS_FOR_TOP, fetchTopMatches, generalSkills, rankingSkills } from './lib/topMatches.js';
import { rankChanges, shouldReplan } from './lib/replan.js';
import { mergeCvSkills, removeCvSkills } from './lib/cvSkills.js';
import { toggleLearn } from './lib/potential.js';
import { OLD_ROUTES, SCREENS, resolveScreen } from './lib/navigation.js';

const INITIAL_SAMPLE_ID = 'aina';
const EMPTY_PROFILE = {
  who: null,
  field: null,
  skills: [],
  levels: {},
  goal: null,
  targetSectors: [],
  sdgs: [],
  learn: [],
  tracked: [],
  sampleId: null,
};

// A URL hash such as #skills opens that screen directly (handy for demos).
// Old hashes (#profile, #roles, …) are kept so resolveScreen can redirect them.
function screenFromHash() {
  const name = window.location.hash.replace('#', '');
  return SCREENS.includes(name) || Object.hasOwn(OLD_ROUTES, name) ? name : 'home';
}

function urlForScreen(screen) {
  return screen === 'home' ? window.location.pathname + window.location.search : `#${screen}`;
}

function profileFromSample(sample) {
  return {
    who: sample.who ?? null,
    field: sample.field ?? null,
    skills: [...sample.skills],
    levels: { ...(sample.levels ?? {}) },
    goal: sample.goal ?? null,
    targetSectors: [...(sample.targetSectors ?? [])],
    sdgs: [...sample.sdgs],
    learn: [...(sample.learn ?? [])],
    tracked: [],
    sampleId: sample.id,
  };
}

function StatusMessage({ children, role = 'status' }) {
  return (
    <main className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
      <p role={role} className="m-0 text-center text-lg text-slate-700">
        {children}
      </p>
    </main>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [screen, setScreen] = useState(screenFromHash);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [scenario, setScenario] = useState('moderate');
  const [focusRoleId, setFocusRoleId] = useState(null);
  const [expandedRoleId, setExpandedRoleId] = useState(null);
  const [doneSkills, setDoneSkills] = useState([]);
  const [seenTips, setSeenTips] = useState([]);
  const [tipsOff, setTipsOff] = useState(false);
  const [refresh, setRefresh] = useState({ pending: false, status: null, message: '' });
  const [researchRefresh, setResearchRefresh] = useState({ status: null, message: '' });
  const [replan, setReplan] = useState(null);
  const [referencesRefresh, setReferencesRefresh] = useState({ pending: false, status: null, message: '' });
  // CV file name and evidence lines: memory only, never saved or sent.
  const [cv, setCv] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/data')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((loaded) => {
        if (cancelled) return;
        const sample = loaded.samples.find((item) => item.id === INITIAL_SAMPLE_ID) || loaded.samples[0];
        if (sample) setProfile(profileFromSample(sample));
        setData(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const ctx = useMemo(
    () =>
      data
        ? { similar: data.skills.similar, trendGroups: data.trends?.groups, observed: data.observed, skillSimilarity: data.skillSimilarity }
        : null,
    [data],
  );
  const ranked = useMemo(
    () => (data ? rankBySkillMatch(data.roles, profile, ctx, scenario) : []),
    [data, profile, ctx, scenario],
  );

  // Top 20 roles from all of eMASCO for the picked skills. Only runs on the Matches screen; skill names and the
  // major/sector id only are sent. With a major, the server also splits a larger pool into "your field" and "other fields".
  const [top, setTop] = useState({ status: 'idle', key: '', result: null });
  const topKey = `${profile.field ?? ''}#${profile.skills.join('|')}`;
  useEffect(() => {
    if (!data || screen !== 'matches') return undefined;
    if (profile.skills.length < MIN_SKILLS_FOR_TOP) {
      setTop({ status: 'idle', key: '', result: null });
      return undefined;
    }
    let cancelled = false;
    setTop((old) => (old.key === topKey && old.status === 'ok' ? old : { status: 'loading', key: topKey, result: null }));
    const timer = setTimeout(async () => {
      const { used, left } = rankingSkills(profile.skills, data.roles, data.fields);
      const generalLabels = generalSkills(profile.skills, data.roles, data.fields);
      const out = await fetchTopMatches(used, fetch, { field: profile.field, generalLabels });
      if (cancelled) return;
      setTop(out.ok ? { status: 'ok', key: topKey, result: out.result, left } : { status: 'failed', key: topKey, result: null });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // profile.skills and profile.field are covered by topKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, screen, topKey]);

  const navigate = useCallback((next) => {
    setMenuOpen(false);
    setScreen(next);
    const hash = next === 'home' ? '' : `#${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', urlForScreen(next));
    window.scrollTo(0, 0);
  }, []);

  // Single guard for every route in (initial hash, hashchange, back, nav):
  // a locked or unknown screen is replaced, and the URL is kept in sync.
  const fields = data?.fields ?? null;
  const shownScreen = resolveScreen(screen, profile, fields);
  useEffect(() => {
    if (!data || shownScreen === screen) return;
    setScreen(shownScreen);
    window.history.replaceState(null, '', urlForScreen(shownScreen));
  }, [data, screen, shownScreen]);

  const resetRoleViews = () => {
    setFocusRoleId(null);
    setExpandedRoleId(null);
    setDoneSkills([]);
  };

  const loadSample = (sampleId, nextScreen) => {
    const sample = data.samples.find((item) => item.id === sampleId);
    if (!sample) return;
    setProfile(profileFromSample(sample));
    setReplan(null);
    setCv(null);
    resetRoleViews();
    if (nextScreen) navigate(nextScreen);
  };

  const startFresh = () => {
    setProfile(EMPTY_PROFILE);
    setReplan(null);
    setCv(null);
    resetRoleViews();
    navigate('about');
  };

  // Every profile change clears the sample name and the re-plan notice.
  const changeProfile = (update) => {
    setReplan(null);
    setProfile((current) => ({ ...update(current), sampleId: null }));
  };

  const toggleIn = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const chooseWho = (who) =>
    changeProfile((current) => ({ ...current, who, field: current.who === who ? current.field : null }));

  const chooseField = (id) => changeProfile((current) => ({ ...current, field: id }));

  // After a manual change the CV line no longer explains that skill's level.
  const dropCvEvidence = (label) =>
    setCv((current) => {
      if (!current?.evidence[label]) return current;
      const evidence = { ...current.evidence };
      delete evidence[label];
      return { ...current, evidence };
    });

  const toggleSkill = (label) => {
    dropCvEvidence(label);
    // A skill the student picks or removes by hand is no longer the CV's.
    setCv((current) => (current?.added.includes(label) ? { ...current, added: current.added.filter((item) => item !== label) } : current));
    changeProfile((current) => {
      const skills = toggleIn(current.skills, label);
      const levels = { ...current.levels };
      if (skills.includes(label)) levels[label] = 'good';
      else delete levels[label];
      // A skill the student now has is no longer a skill to learn.
      const learn = current.learn.filter((item) => !skills.includes(item));
      return { ...current, skills, levels, learn };
    });
  };

  // A sample or empty profile is replaced; otherwise the student's picks are kept.
  // `added` lists the skills this CV put in the profile, so a new CV can take them out again.
  const applyCvSkills = (found, fileName) => {
    const { mode } = mergeCvSkills(profile, found);
    const fresh = found.filter((item) => !profile.skills.includes(item.label));
    changeProfile((current) => {
      const { skills, levels } = mergeCvSkills(current, found);
      const learn = current.learn.filter((item) => !skills.includes(item));
      return { ...current, skills, levels, learn };
    });
    setCv({
      fileName,
      mode,
      count: mode === 'merged' ? fresh.length : found.length,
      added: (mode === 'merged' ? fresh : found).map((item) => item.label),
      suggestions: [],
      evidence: Object.fromEntries(found.map((item) => [item.label, item.evidence])),
      sources: Object.fromEntries(found.map((item) => [item.label, item.source])),
    });
  };

  // AI matches wait for the student's yes; they are not in the profile yet.
  const suggestCv = (items, fileName) =>
    setCv((current) =>
      current && current.fileName === fileName
        ? { ...current, suggestions: items.filter((item) => !profile.skills.includes(item.label)) }
        : current,
    );

  const acceptSuggestion = (label) => {
    const item = cv?.suggestions.find((entry) => entry.label === label);
    if (!item) return;
    changeProfile((current) => {
      if (current.skills.includes(label)) return current;
      const skills = [...current.skills, label];
      const learn = current.learn.filter((entry) => !skills.includes(entry));
      return { ...current, skills, levels: { ...current.levels, [label]: item.level }, learn };
    });
    setCv((current) =>
      current
        ? {
            ...current,
            count: current.count + 1,
            added: [...current.added, label],
            suggestions: current.suggestions.filter((entry) => entry.label !== label),
            evidence: { ...current.evidence, [label]: item.evidence },
            sources: { ...current.sources, [label]: item.source },
          }
        : current,
    );
  };

  const dismissSuggestion = (label) =>
    setCv((current) =>
      current ? { ...current, suggestions: current.suggestions.filter((entry) => entry.label !== label) } : current,
    );

  // A new CV starts clean: skills the old CV added leave the profile and the checks.
  const clearCv = () => {
    const labels = cv?.added ?? [];
    if (labels.length > 0) {
      changeProfile((current) => ({ ...current, ...removeCvSkills(current, labels) }));
    }
    setCv(null);
  };

  const setLevel = (label, level) => {
    dropCvEvidence(label);
    changeProfile((current) => ({ ...current, levels: { ...current.levels, [label]: level } }));
  };

  // The target-sector picker was removed on 25 Oct 2026 (the career lists use generated fields instead);
  // targetSectors stays in the profile so saved samples still load.
  const chooseGoal = (goal) => changeProfile((current) => ({ ...current, goal }));

  const toggleSdg = (goal) => changeProfile((current) => ({ ...current, sdgs: toggleIn(current.sdgs, goal) }));

  // Tracking a role keeps the sample label (it is not a change to the audit), so it does not use changeProfile.
  const [trackNote, setTrackNote] = useState('');
  const trackRole = (roleId) => {
    const { list, full } = toggleTracked(profile.tracked, roleId);
    setTrackNote(full ? `You can track up to ${MAX_TRACKED} roles. Untrack one first.` : '');
    if (!full) setProfile((current) => ({ ...current, tracked: list }));
  };

  const toggleLearnSkill =(label) => changeProfile((current) => toggleLearn(current, label));

  const changeScenario = (next) => {
    setReplan(null);
    setScenario(next);
  };

  // Latest inputs, so a slow refresh can tell if the student changed them meanwhile.
  const latestInputs = useRef({ profile, scenario });
  latestInputs.current = { profile, scenario };

  // Re-reads the eMASCO role pages and checks the links (about 1 minute). Roles are never edited.
  const refreshReferences = async () => {
    if (referencesRefresh.pending) return;
    setReferencesRefresh({ pending: true, status: null, message: '' });
    try {
      const response = await fetch('/api/refresh-references', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.references) setData((current) => (current ? { ...current, references: result.references } : current));
      setReferencesRefresh({ pending: false, status: result.status, message: result.message });
    } catch {
      setReferencesRefresh({ pending: false, status: 'failed', message: 'The check failed. Please try again later.' });
    }
  };

  const refreshTrends = async () => {
    const startedWith = { profile, scenario };
    setReplan(null);
    setRefresh({ pending: true, status: null, message: '' });
    setResearchRefresh({ status: null, message: '' });
    const post = async (url) => {
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };
    // Two independent refreshes: one failing never blocks the other.
    const [trendsOutcome, researchOutcome] = await Promise.allSettled([
      post('/api/refresh-trends'),
      post('/api/refresh-research'),
    ]);

    try {
      if (researchOutcome.status === 'fulfilled') {
        const researchResult = researchOutcome.value;
        if ((researchResult.status === 'updated' || researchResult.status === 'failed') && researchResult.research) {
          setData((current) => ({ ...current, research: researchResult.research }));
        }
        setResearchRefresh({ status: researchResult.status, message: researchResult.message });
      } else {
        setResearchRefresh({ status: 'failed', message: 'Live refresh failed. Please try again later.' });
      }

      if (trendsOutcome.status === 'rejected') {
        setRefresh({ pending: false, status: 'failed', message: 'Live refresh failed. Please try again later.' });
        return;
      }
      const result = trendsOutcome.value;
      if ((result.status === 'updated' || result.status === 'unchanged') && result.trends) {
        const inputsUnchanged =
          latestInputs.current.profile === startedWith.profile && latestInputs.current.scenario === startedWith.scenario;
        if (inputsUnchanged && shouldReplan(result.status, profile.skills.length)) {
          const oldGroups = data.trends?.groups;
          const idsFor = (trendGroups) =>
            rankBySkillMatch(data.roles, profile, { ...ctx, trendGroups }, scenario).map((entry) => entry.role.id);
          setReplan({
            changes: rankChanges(idsFor(oldGroups), idsFor(result.trends.groups)),
            oldGroups,
            newGroups: result.trends.groups,
            year: result.trends.source?.latestYear,
          });
        }
        setData((current) => ({ ...current, trends: result.trends }));
      }
      setRefresh({ pending: false, status: result.status, message: result.message });
    } catch {
      setResearchRefresh((current) =>
        current.status ? current : { status: 'failed', message: 'Live refresh failed. Please try again later.' },
      );
      setRefresh({ pending: false, status: 'failed', message: 'Live refresh failed. Please try again later.' });
    }
  };

  const openStudy = (roleId) => {
    if (roleId !== focusRoleId) setDoneSkills([]);
    setFocusRoleId(roleId);
    navigate('study');
  };

  const toggleDone = (label) =>
    setDoneSkills((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));

  const toggleExpanded = (roleId) => setExpandedRoleId((current) => (current === roleId ? null : roleId));

  const dismissTip = (tipScreen) => setSeenTips((current) => [...current, tipScreen]);

  if (loadFailed) return <StatusMessage role="alert">Could not load data. Please refresh the page.</StatusMessage>;
  if (!data) return <StatusMessage>Loading data…</StatusMessage>;

  let content;
  if (shownScreen === 'home') {
    content = (
      <Home
        data={data}
        ctx={ctx}
        onTrySample={(sampleId) => loadSample(sampleId, 'matches')}
        onStartFresh={startFresh}
        onNavigate={navigate}
      />
    );
  } else if (shownScreen === 'explore') {
    content = <Explore onBack={() => navigate('matches')} />;
  } else if (shownScreen === 'about') {
    content = (
      <About
        data={data}
        profile={profile}
        onChooseWho={chooseWho}
        onChooseField={chooseField}
        onLoadSample={(sampleId) => loadSample(sampleId, 'matches')}
      />
    );
  } else if (shownScreen === 'skills') {
    content = (
      <Skills
        data={data}
        profile={profile}
        cv={cv}
        onToggleSkill={toggleSkill}
        onSetLevel={setLevel}
        onCvFound={applyCvSkills}
        onCvSuggest={suggestCv}
        onAcceptSuggestion={acceptSuggestion}
        onDismissSuggestion={dismissSuggestion}
        onCvClear={clearCv}
        onChooseField={chooseField}
      />
    );
  } else if (shownScreen === 'goal') {
    content = (
      <Goal
        data={data}
        profile={profile}
        onChooseGoal={chooseGoal}
        onToggleSdg={toggleSdg}
        onToggleLearn={toggleLearnSkill}
      />
    );
  } else if (shownScreen === 'overview') {
    content = (
      <Overview
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        onOpenRole={(roleId) => {
          setFocusRoleId(roleId);
          setExpandedRoleId(roleId);
          navigate('matches');
        }}
        onUntrack={trackRole}
        onAdd={() => navigate('matches')}
      />
    );
  } else if (shownScreen === 'matches') {
    content = (
      <Matches
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        top={top}
        expandedRoleId={expandedRoleId}
        focusRoleId={focusRoleId}
        refresh={refresh}
        researchRefresh={researchRefresh}
        replan={replan}
        onDismissReplan={() => setReplan(null)}
        onScenarioChange={changeScenario}
        onToggleExpanded={toggleExpanded}
        onFocus={setFocusRoleId}
        onRefresh={refreshTrends}
        referencesRefresh={referencesRefresh}
        onRefreshReferences={refreshReferences}
        onStudy={openStudy}
        onTrack={trackRole}
        trackNote={trackNote}
        onExplore={() => navigate('explore')}
      />
    );
  } else {
    content = (
      <Study
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        focusRoleId={focusRoleId}
        doneSkills={doneSkills}
        onToggleDone={toggleDone}
        onBack={() => navigate('matches')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0F172A] lg:flex">
      <aside className="fr-noprint hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[264px] lg:flex-none lg:overflow-y-auto">
        <Sidebar data={data} profile={profile} screen={shownScreen} onNavigate={navigate} />
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileBar
          data={data}
          profile={profile}
          screen={shownScreen}
          menuOpen={menuOpen}
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={closeMenu}
          onNavigate={navigate}
        />
        <TipBanner
          screen={shownScreen}
          seenTips={seenTips}
          tipsOff={tipsOff}
          onDismiss={dismissTip}
          onHideAll={() => setTipsOff(true)}
        />
        <div className="flex-1">{content}</div>
        <StepBar
          screen={shownScreen}
          profile={profile}
          fields={fields}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}
