import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MobileBar from './components/MobileBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import StepBar from './components/StepBar.jsx';
import TipBanner from './components/TipBanner.jsx';
import Home from './screens/Home.jsx';
import Profile from './screens/Profile.jsx';
import Radar from './screens/Radar.jsx';
import Roles from './screens/Roles.jsx';
import Pathway from './screens/Pathway.jsx';
import { rankRoles } from './lib/scoring.js';
import { rankChanges, shouldReplan } from './lib/replan.js';
import { toggleLearn } from './lib/potential.js';
import PreviewCv from './screens/PreviewCv.jsx';
import PreviewLang from './screens/PreviewLang.jsx';
import PreviewUsers from './screens/PreviewUsers.jsx';
import { SCREENS, resolveScreen } from './lib/navigation.js';

const INITIAL_SAMPLE_ID = 'aina';
const EMPTY_PROFILE = { skills: [], interests: [], sdgs: [], experience: null, learn: [], sampleId: null };

// A URL hash such as #profile opens that screen directly (handy for demos).
function screenFromHash() {
  const name = window.location.hash.replace('#', '');
  return SCREENS.includes(name) ? name : 'home';
}

function urlForScreen(screen) {
  return screen === 'home' ? window.location.pathname + window.location.search : `#${screen}`;
}

function profileFromSample(sample) {
  return {
    skills: [...sample.skills],
    interests: [...sample.interests],
    sdgs: [...sample.sdgs],
    experience: sample.experience ?? null,
    learn: [...(sample.learn ?? [])],
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
    () => (data ? { similar: data.skills.similar, trendGroups: data.trends?.groups } : null),
    [data],
  );
  const ranked = useMemo(
    () => (data ? rankRoles(data.roles, profile, ctx, scenario) : []),
    [data, profile, ctx, scenario],
  );

  const navigate = useCallback((next) => {
    setMenuOpen(false);
    setScreen(next);
    const hash = next === 'home' ? '' : `#${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', urlForScreen(next));
    window.scrollTo(0, 0);
  }, []);

  // Single guard for every route in (initial hash, hashchange, back, nav):
  // a locked or unknown screen is replaced, and the URL is kept in sync.
  const shownScreen = resolveScreen(screen, profile.skills.length);
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
    resetRoleViews();
    if (nextScreen) navigate(nextScreen);
  };

  const startFresh = () => {
    setProfile(EMPTY_PROFILE);
    setReplan(null);
    resetRoleViews();
    navigate('profile');
  };

  const toggleProfileItem = (field, value) => {
    setReplan(null);
    setProfile((current) => {
      const list = current[field];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      // A skill the student now has is no longer a skill to learn.
      const learn = field === 'skills' ? current.learn.filter((item) => !next.includes(item)) : current.learn;
      return { ...current, [field]: next, learn, sampleId: null };
    });
  };

  const toggleLearnSkill = (label) => setProfile((current) => ({ ...toggleLearn(current, label), sampleId: null }));

  const chooseExperience = (experience) =>
    setProfile((current) => ({ ...current, experience: current.experience === experience ? null : experience, sampleId: null }));

  const changeScenario = (next) => {
    setReplan(null);
    setScenario(next);
  };

  // Latest inputs, so a slow refresh can tell if the student changed them meanwhile.
  const latestInputs = useRef({ profile, scenario });
  latestInputs.current = { profile, scenario };

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
            rankRoles(data.roles, profile, { ...ctx, trendGroups }, scenario).map((entry) => entry.role.id);
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

  const openPathway = (roleId) => {
    if (roleId !== focusRoleId) setDoneSkills([]);
    setFocusRoleId(roleId);
    navigate('pathway');
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
        onTrySample={(sampleId) => loadSample(sampleId, 'profile')}
        onStartFresh={startFresh}
        onNavigate={navigate}
      />
    );
  } else if (shownScreen === 'preview-cv') {
    content = <PreviewCv data={data} />;
  } else if (shownScreen === 'preview-lang') {
    content = <PreviewLang />;
  } else if (shownScreen === 'preview-users') {
    content = <PreviewUsers data={data} />;
  } else if (shownScreen === 'profile') {
    content = (
      <Profile
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        onLoadSample={(sampleId) => loadSample(sampleId)}
        onToggle={toggleProfileItem}
        onToggleLearn={toggleLearnSkill}
        onChooseExperience={chooseExperience}
        onNext={() => navigate('radar')}
      />
    );
  } else if (shownScreen === 'radar') {
    content = (
      <Radar
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        focusRoleId={focusRoleId}
        refresh={refresh}
        researchRefresh={researchRefresh}
        replan={replan}
        onDismissReplan={() => setReplan(null)}
        onScenarioChange={changeScenario}
        onFocus={setFocusRoleId}
        onRefresh={refreshTrends}
        onSeeRoles={() => navigate('roles')}
      />
    );
  } else if (shownScreen === 'roles') {
    content = (
      <Roles
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        expandedRoleId={expandedRoleId}
        onScenarioChange={changeScenario}
        onToggleSdg={(goal) => toggleProfileItem('sdgs', goal)}
        onToggleExpanded={toggleExpanded}
        onPathway={openPathway}
      />
    );
  } else {
    content = (
      <Pathway
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        focusRoleId={focusRoleId}
        doneSkills={doneSkills}
        onToggleDone={toggleDone}
        onBack={() => navigate('roles')}
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
        <StepBar screen={shownScreen} skillCount={profile.skills.length} onNavigate={navigate} />
      </div>
    </div>
  );
}
