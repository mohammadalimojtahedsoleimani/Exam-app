import { useEffect } from 'react';

const LOCK_CLASS = 'app-viewport-locked';

let activeLocks = 0;

// Prevents the document from scrolling while a fixed-height screen is mounted.
// Reference counted so overlapping screens (or React StrictMode double mounts)
// cannot leave the document permanently locked.
export const useLockedViewport = (active = true) => {
    useEffect(() => {
        if (!active) return undefined;

        activeLocks += 1;
        document.documentElement.classList.add(LOCK_CLASS);

        return () => {
            activeLocks = Math.max(0, activeLocks - 1);

            if (activeLocks === 0) {
                document.documentElement.classList.remove(LOCK_CLASS);
            }
        };
    }, [active]);
};

export default useLockedViewport;
