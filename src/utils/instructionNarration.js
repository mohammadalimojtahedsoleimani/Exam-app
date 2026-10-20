export const INITIAL_NARRATION_STATE = Object.freeze({
    status: 'LOADING',
    hasStarted: false,
    hasFinished: false,
    visibleElements: 0,
});

// Keep media events, pending play promises, and bounded startup recovery in one
// lifecycle. Disposed players must never update a newly mounted instruction page.
export const createInstructionNarration = ({audio, revealThresholds, onChange}) => {
    let state = {...INITIAL_NARRATION_STATE};
    let disposed = false;
    let wantsPlayback = true;
    let pendingPlay = false;
    let requestId = 0;
    let startupRetries = 0;
    let startTimer;
    let retryTimer;

    const update = (changes) => {
        if (disposed) return;
        state = {...state, ...changes};
        onChange(state);
    };

    const playing = () => {
        if (!wantsPlayback || disposed) return;
        update({status: 'PLAYING', hasStarted: true, visibleElements: Math.max(1, state.visibleElements)});
    };

    const handleFailure = (error) => {
        if (disposed || retryTimer !== undefined) return;
        pendingPlay = false;
        requestId += 1;

        if (error?.name === 'NotAllowedError') {
            wantsPlayback = false;
            update({status: 'BLOCKED'});
            return;
        }

        // A cold request or a cancelled media load can fail during navigation.
        // Retry once; never interpret a failed load as completed narration.
        if (!state.hasStarted && wantsPlayback && startupRetries < 1) {
            startupRetries += 1;
            requestId += 1;
            update({status: 'LOADING'});
            retryTimer = setTimeout(() => {
                retryTimer = undefined;
                if (disposed || !wantsPlayback) return;
                audio.load();
                play();
            }, 250);
            return;
        }

        wantsPlayback = false;
        audio.pause();
        update({status: 'ERROR', hasFinished: false});
    };

    const play = () => {
        if (disposed || pendingPlay) return;
        clearTimeout(startTimer);
        clearTimeout(retryTimer);
        retryTimer = undefined;
        wantsPlayback = true;

        if (state.hasFinished) {
            audio.currentTime = 0;
            update({...INITIAL_NARRATION_STATE});
        }
        if (audio.error || state.status === 'ERROR') {
            update({...INITIAL_NARRATION_STATE});
            audio.load();
        }

        update({status: 'LOADING'});
        const activeRequestId = ++requestId;
        pendingPlay = true;

        try {
            // Call synchronously from a manual play gesture. Waiting for metadata
            // here would lose the user activation required by some browsers.
            Promise.resolve(audio.play()).then(() => {
                if (disposed || activeRequestId !== requestId) return;
                pendingPlay = false;
                if (!audio.paused) playing();
            }).catch((error) => {
                if (!disposed && activeRequestId === requestId) handleFailure(error);
            });
        } catch (error) {
            if (activeRequestId === requestId) handleFailure(error);
        }
    };

    const pause = () => {
        wantsPlayback = false;
        pendingPlay = false;
        requestId += 1;
        clearTimeout(startTimer);
        clearTimeout(retryTimer);
        retryTimer = undefined;
        audio.pause();
        if (!disposed && !state.hasFinished) update({status: 'PAUSED'});
    };

    const listeners = {
        canplay: () => {
            if (wantsPlayback && !pendingPlay && retryTimer === undefined && audio.paused) play();
        },
        playing,
        pause: () => {
            if (audio.paused && state.status === 'PLAYING' && !audio.ended) {
                wantsPlayback = false;
                update({status: 'PAUSED'});
            }
        },
        timeupdate: () => {
            if (!state.hasStarted || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
            const progress = audio.currentTime / audio.duration;
            const count = revealThresholds.filter(threshold => progress >= threshold).length;
            update({visibleElements: Math.max(state.visibleElements, count)});
        },
        ended: () => {
            if (!state.hasStarted || !audio.ended) return;
            if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.currentTime < audio.duration - 0.1) {
                handleFailure(new Error('Narration ended before its duration was reached.'));
                return;
            }
            wantsPlayback = false;
            update({status: 'FINISHED', hasFinished: true, visibleElements: revealThresholds.length});
        },
        error: () => handleFailure(audio.error),
    };

    Object.entries(listeners).forEach(([event, listener]) => audio.addEventListener(event, listener));
    update(INITIAL_NARRATION_STATE);

    return {
        start: () => {
            // StrictMode mounts, cleans up, and mounts effects again. Defer only
            // automatic startup so the discarded lifecycle cannot start audio.
            startTimer = setTimeout(() => {
                if (disposed || !wantsPlayback || retryTimer !== undefined) return;
                // Preloading starts before React effects attach listeners. A
                // cached error may therefore have no new error event to observe.
                if (audio.error) handleFailure(audio.error);
                else if (audio.readyState >= 3) play();
            }, 0);
        },
        toggle: () => {
            if (!audio.paused || pendingPlay) pause();
            else play();
        },
        destroy: () => {
            disposed = true;
            Object.entries(listeners).forEach(([event, listener]) => audio.removeEventListener(event, listener));
            pause();
        },
    };
};
