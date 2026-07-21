export const PHASE = Object.freeze({
    PRACTICE: 1,
    BASELINE: 2,
    MOOD_FIRST: 3,
    MOOD_SECOND: 4,
});

export const APP_ROUTE = Object.freeze({
    SIGN_UP: '/',
    INSTRUCTIONS: '/instructions',
    TRIAL: '/Trial',
    REPORT: '/Report',
    FINAL: '/Final',
    RESULTS: '/results',
});

const TRIAL_COMPLETION_TRANSITIONS = Object.freeze({
    [PHASE.PRACTICE]: Object.freeze({
        completeSession: false,
        nextPhase: null,
        prepareNextSession: false,
        route: APP_ROUTE.REPORT,
        state: 'result',
    }),
    [PHASE.BASELINE]: Object.freeze({
        completeSession: true,
        nextPhase: PHASE.MOOD_FIRST,
        prepareNextSession: false,
        route: APP_ROUTE.INSTRUCTIONS,
        state: 'instructions',
    }),
    [PHASE.MOOD_FIRST]: Object.freeze({
        completeSession: true,
        nextPhase: PHASE.MOOD_SECOND,
        prepareNextSession: false,
        route: APP_ROUTE.INSTRUCTIONS,
        state: 'instructions',
    }),
    [PHASE.MOOD_SECOND]: Object.freeze({
        completeSession: true,
        nextPhase: null,
        prepareNextSession: false,
        route: APP_ROUTE.FINAL,
        state: 'result',
    }),
});

export const parsePhase = (value) => {
    const phase = Number.parseInt(String(value), 10);
    return TRIAL_COMPLETION_TRANSITIONS[phase] ? phase : null;
};

export const phaseHasInstructions = (phase) => (
    phase === PHASE.PRACTICE ||
    phase === PHASE.MOOD_FIRST ||
    phase === PHASE.MOOD_SECOND
);

export const phaseUsesMoodInstructions = (phase) => (
    phase === PHASE.MOOD_FIRST || phase === PHASE.MOOD_SECOND
);

export const getTrialCompletionTransition = (phase) => {
    const transition = TRIAL_COMPLETION_TRANSITIONS[phase];

    if (!transition) {
        throw new Error(`Unsupported probe phase: ${phase}`);
    }

    return transition;
};

export const PROBE_STORAGE_KEYS = Object.freeze([
    'authToken',
    'currentState',
    'currentPhase',
    'currentPhaseID',
    'currentSessionID',
    'currentClusterLength',
    'currentPhaseName',
    'currentPhaseHasVideo',
    'currentPhaseVideoSeen',
]);
