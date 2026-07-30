import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

let mediaQuery = null;

const getMediaQuery = () => {
    if (!mediaQuery && typeof window !== 'undefined' && window.matchMedia) {
        mediaQuery = window.matchMedia(QUERY);
    }

    return mediaQuery;
};

const subscribe = (onChange) => {
    const query = getMediaQuery();

    if (!query) return () => {};

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};

const getSnapshot = () => getMediaQuery()?.matches ?? false;

const getServerSnapshot = () => false;

/**
 * Drop-in replacement for framer-motion's `useReducedMotion` for screens that
 * only need the preference flag — keeps the animation library out of the
 * landing chunk.
 */
export const usePrefersReducedMotion = () =>
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default usePrefersReducedMotion;
