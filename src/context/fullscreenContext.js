import { createContext, useContext, useEffect } from 'react';

export const FullscreenContext = createContext(null);

export const useFullscreen = () => {
    const value = useContext(FullscreenContext);

    if (!value) {
        throw new Error('useFullscreen must be used inside <FullscreenProvider>.');
    }

    return value;
};

// Screens that must never be interrupted (an active trial) or that already own a
// fullscreen control (sign-up, final screen) silence the floating restore chip.
export const useFullscreenPromptPause = (active = true) => {
    const { pauseRestorePrompt } = useFullscreen();

    useEffect(() => {
        if (!active) return undefined;

        return pauseRestorePrompt();
    }, [active, pauseRestorePrompt]);
};
