import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, readReducedMotion, () => false);
}

// Close enough to stop: tight for 0–1 values, looser for 0–100 values.
function settleDistance(goal) {
  return 0.0005 * Math.max(4, Math.abs(goal));
}

// Eases each value toward its target on every animation frame. New keys start
// from 0 so shapes grow in. With reduced motion the targets come back as-is.
export function useTween(targets, rate = 0.16) {
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState({});
  const shownRef = useRef(shown);
  const targetsKey = JSON.stringify(targets);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const goals = JSON.parse(targetsKey);
    let frame = 0;
    const step = () => {
      const next = {};
      let moving = false;
      for (const [key, goal] of Object.entries(goals)) {
        const current = shownRef.current[key] ?? 0;
        if (Math.abs(goal - current) <= settleDistance(goal)) {
          next[key] = goal;
        } else {
          next[key] = current + (goal - current) * rate;
          moving = true;
        }
      }
      shownRef.current = next;
      setShown(next);
      if (moving) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targetsKey, rate, reducedMotion]);

  if (reducedMotion) return targets;
  const result = {};
  for (const key of Object.keys(targets)) result[key] = shown[key] ?? 0;
  return result;
}
