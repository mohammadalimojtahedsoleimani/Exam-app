import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FULLSCREEN_CHANGE_EVENTS,
    exitAppFullscreen,
    isFullscreenActive,
    isFullscreenSupported,
    requestAppFullscreen,
} from '../utils/fullscreen.js';
import { FullscreenContext } from './fullscreenContext.js';

const INTENT_STORAGE_KEY = 'appFullscreenIntent';

const readIntent = () => {
    try {
        return localStorage.getItem(INTENT_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const writeIntent = (value) => {
    try {
        if (value) {
            localStorage.setItem(INTENT_STORAGE_KEY, 'true');
        } else {
            localStorage.removeItem(INTENT_STORAGE_KEY);
        }
    } catch {
        /* Private browsing modes can reject storage writes; the session still works. */
    }
};

export const FullscreenProvider = ({ children }) => {
    const [isSupported] = useState(isFullscreenSupported);
    const [isFullscreen, setIsFullscreen] = useState(isFullscreenActive);
    const [wantsFullscreen, setWantsFullscreen] = useState(readIntent);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState('');
    const [promptPauseCount, setPromptPauseCount] = useState(0);
    const requestInFlightRef = useRef(false);

    useEffect(() => {
        const syncState = () => setIsFullscreen(isFullscreenActive());

        FULLSCREEN_CHANGE_EVENTS.forEach((event) => {
            document.addEventListener(event, syncState);
        });
        // Some browsers only report a rejected request through `fullscreenerror`.
        document.addEventListener('fullscreenerror', syncState);

        syncState();

        return () => {
            FULLSCREEN_CHANGE_EVENTS.forEach((event) => {
                document.removeEventListener(event, syncState);
            });
            document.removeEventListener('fullscreenerror', syncState);
        };
    }, []);

    const enterFullscreen = useCallback(async () => {
        if (requestInFlightRef.current) return false;

        requestInFlightRef.current = true;
        setIsBusy(true);
        setError('');

        try {
            await requestAppFullscreen();
            writeIntent(true);
            setWantsFullscreen(true);
            return true;
        } catch (requestError) {
            console.error('Fullscreen request failed', requestError);
            setError('فعال‌سازی حالت تمام‌صفحه انجام نشد. می‌توانید با کلید F11 آن را فعال کنید.');
            return false;
        } finally {
            requestInFlightRef.current = false;
            setIsBusy(false);
            setIsFullscreen(isFullscreenActive());
        }
    }, []);

    const exitFullscreen = useCallback(async () => {
        setIsBusy(true);
        setError('');
        writeIntent(false);
        setWantsFullscreen(false);

        try {
            await exitAppFullscreen();
            return true;
        } catch (exitError) {
            console.error('Exiting fullscreen failed', exitError);
            setError('خروج از حالت تمام‌صفحه انجام نشد. می‌توانید کلید Esc را فشار دهید.');
            return false;
        } finally {
            setIsBusy(false);
            setIsFullscreen(isFullscreenActive());
        }
    }, []);

    const toggleFullscreen = useCallback(
        () => (isFullscreenActive() ? exitFullscreen() : enterFullscreen()),
        [enterFullscreen, exitFullscreen],
    );

    // Ends the session's fullscreen expectation without forcing the window out of
    // fullscreen, so the restore chip stops following the participant home.
    const releaseFullscreenIntent = useCallback(() => {
        writeIntent(false);
        setWantsFullscreen(false);
        setError('');
    }, []);

    const pauseRestorePrompt = useCallback(() => {
        setPromptPauseCount((count) => count + 1);

        return () => setPromptPauseCount((count) => Math.max(0, count - 1));
    }, []);

    const value = useMemo(() => ({
        isSupported,
        isFullscreen,
        wantsFullscreen,
        isBusy,
        error,
        shouldOfferRestore: isSupported && wantsFullscreen && !isFullscreen && promptPauseCount === 0,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        releaseFullscreenIntent,
        pauseRestorePrompt,
    }), [
        isSupported,
        isFullscreen,
        wantsFullscreen,
        isBusy,
        error,
        promptPauseCount,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        releaseFullscreenIntent,
        pauseRestorePrompt,
    ]);

    return (
        <FullscreenContext.Provider value={value}>
            {children}
        </FullscreenContext.Provider>
    );
};

export default FullscreenProvider;
