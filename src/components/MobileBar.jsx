import { useEffect, useRef } from 'react';
import Sidebar from './Sidebar.jsx';
import { JOURNEY, stepPosition } from '../lib/journey.js';
import { isPreview } from '../lib/navigation.js';

function screenTitle(screen) {
  if (isPreview(screen)) return 'Stage 2 preview';
  return JOURNEY.find((step) => step.screen === screen)?.label || 'Home';
}

// Top bar for narrow screens (below lg): menu button, where you are, progress.
// The menu opens the same panel as the desktop sidebar, from the left.
export default function MobileBar({ data, profile, screen, menuOpen, onMenuOpen, onMenuClose, onNavigate }) {
  const menuButtonRef = useRef(null);
  const panelRef = useRef(null);
  const wasOpen = useRef(false);
  const position = stepPosition(screen);

  useEffect(() => {
    if (menuOpen) {
      panelRef.current?.querySelector('button')?.focus();
      const onKey = (event) => {
        if (event.key === 'Escape') onMenuClose();
      };
      window.addEventListener('keydown', onKey);
      wasOpen.current = true;
      return () => window.removeEventListener('keydown', onKey);
    }
    if (wasOpen.current) {
      menuButtonRef.current?.focus();
      wasOpen.current = false;
    }
    return undefined;
  }, [menuOpen, onMenuClose]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={onMenuOpen}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="fr-menu"
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-[10px] border border-slate-300 bg-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            {position && (
              <div className="text-xs text-slate-600">
                Step {position.number} of {position.total}
              </div>
            )}
            <div className="truncate text-base font-bold">{screenTitle(screen)}</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="FutureReady MY home"
            className="flex size-11 flex-none cursor-pointer items-center justify-center border-0 bg-transparent p-0"
          >
            <span className="flex size-8 items-center justify-center rounded-[9px] bg-[#0F766E] text-[13px] font-extrabold text-white">
              FR
            </span>
          </button>
        </div>
        {position && (
          <div
            role="progressbar"
            aria-label="Journey progress"
            aria-valuemin={0}
            aria-valuemax={position.total}
            aria-valuenow={position.number}
            className="h-1 bg-slate-200"
          >
            <div className="h-1 bg-[#0F766E]" style={{ width: `${(position.number / position.total) * 100}%` }} />
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="fr-backdrop absolute inset-0 bg-slate-900/45" onClick={onMenuClose} aria-hidden="true" />
          <div
            id="fr-menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fr-drawer absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-white shadow-xl"
          >
            <Sidebar data={data} profile={profile} screen={screen} onNavigate={onNavigate} onClose={onMenuClose} />
          </div>
        </div>
      )}
    </>
  );
}
