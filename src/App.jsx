import { useCallback, useEffect, useMemo, useState } from 'react';
import StepNav from './components/StepNav.jsx';
import TipBanner from './components/TipBanner.jsx';
import Home from './screens/Home.jsx';
import Profile, { MIN_SKILLS } from './screens/Profile.jsx';
import { rankRoles } from './lib/scoring.js';

const SCREENS = ['home', 'profile', 'radar', 'roles', 'pathway'];
const SCREENS_NEEDING_SKILLS = ['radar', 'roles', 'pathway'];
const INITIAL_SAMPLE_ID = 'aina';
const EMPTY_PROFILE = { skills: [], interests: [], sdgs: [], sampleId: null };

// A URL hash such as #profile opens that screen directly (handy for demos).
function screenFromHash() {
  const name = window.location.hash.replace('#', '');
  return SCREENS.includes(name) ? name : 'home';
}

function profileFromSample(sample) {
  return { skills: [...sample.skills], interests: [...sample.interests], sdgs: [...sample.sdgs], sampleId: sample.id };
}

function Header({ screen, onNavigate, lockedScreens }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="FutureReady MY home"
          className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
        >
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#0F766E] font-extrabold text-white">
            FR
          </span>
          <span>
            <span className="block text-lg font-bold">FutureReady MY</span>
            <span className="block text-xs text-slate-600">AI supports your career decision. You decide.</span>
          </span>
        </button>
        {screen !== 'home' && <StepNav screen={screen} onNavigate={onNavigate} lockedScreens={lockedScreens} />}
      </div>
    </header>
  );
}

function ComingNext({ onBack }) {
  return (
    <main className="fr-screen mx-auto max-w-[1180px] px-4 pt-6 pb-16 sm:px-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="m-0 text-2xl font-bold">Coming next</h1>
        <p className="m-0 text-slate-600">This step is still being built.</p>
        <button
          type="button"
          onClick={onBack}
          className="fr-btn min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-5 font-semibold"
        >
          Back to profile
        </button>
      </div>
    </main>
  );
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
    setScreen(next);
    const hash = next === 'home' ? '' : `#${next}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash || window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  }, []);

  const resetRoleViews = () => {
    setFocusRoleId(null);
    setExpandedRoleId(null);
    setDoneSkills([]);
  };

  const loadSample = (sampleId, nextScreen) => {
    const sample = data.samples.find((item) => item.id === sampleId);
    if (!sample) return;
    setProfile(profileFromSample(sample));
    resetRoleViews();
    if (nextScreen) navigate(nextScreen);
  };

  const startFresh = () => {
    setProfile(EMPTY_PROFILE);
    resetRoleViews();
    navigate('profile');
  };

  const toggleProfileItem = (field, value) => {
    setProfile((current) => {
      const list = current[field];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [field]: next, sampleId: null };
    });
  };

  const dismissTip = (tipScreen) => setSeenTips((current) => [...current, tipScreen]);

  if (loadFailed) return <StatusMessage role="alert">Could not load data. Please refresh the page.</StatusMessage>;
  if (!data) return <StatusMessage>Loading data…</StatusMessage>;

  const lockedScreens = profile.skills.length < MIN_SKILLS ? SCREENS_NEEDING_SKILLS : [];

  let content;
  if (screen === 'home') {
    content = (
      <Home data={data} ctx={ctx} onTrySample={(sampleId) => loadSample(sampleId, 'profile')} onStartFresh={startFresh} />
    );
  } else if (screen === 'profile') {
    content = (
      <Profile
        data={data}
        ctx={ctx}
        profile={profile}
        scenario={scenario}
        ranked={ranked}
        onLoadSample={(sampleId) => loadSample(sampleId)}
        onToggle={toggleProfileItem}
        onNext={() => navigate('radar')}
      />
    );
  } else {
    content = <ComingNext onBack={() => navigate('profile')} />;
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0F172A]">
      <Header screen={screen} onNavigate={navigate} lockedScreens={lockedScreens} />
      <TipBanner
        screen={screen}
        seenTips={seenTips}
        tipsOff={tipsOff}
        onDismiss={dismissTip}
        onHideAll={() => setTipsOff(true)}
      />
      {content}
    </div>
  );
}
