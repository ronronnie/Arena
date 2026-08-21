'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the user has asked for reduced motion.
 *
 * Every signature animation in Arena reads this and renders a NON-ANIMATED EQUIVALENT
 * that carries the same information — not a degraded version, and never one that omits
 * something. Motion is a reward; it is never the channel a fact arrives on.
 *
 * The CSS in `globals.css` already neutralises transitions globally under
 * `prefers-reduced-motion`. This hook exists for the cases CSS cannot reach: a card flip
 * would end mid-rotation, and a staged reveal would still fire its timers. Those need to
 * render differently, not faster.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: a media query is exactly
 * the external store this API is for, and it avoids the render-then-correct flash that
 * the effect version has on first paint.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getSnapshot = (): boolean => window.matchMedia(QUERY).matches;

/** The server has no media queries, so it renders the animated variant and hydrates. */
const getServerSnapshot = (): boolean => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
