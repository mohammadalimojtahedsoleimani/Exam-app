import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {Button, ConfigProvider, theme, Typography} from 'antd';
import {
    getSessionClusters,
    setPhaseComplete,
    setVideoSeen,
    findValidSession,
    submitTrialAnswer,
} from "../api/probes.js";
import {PlayCircleOutlined, FileTextOutlined, LoadingOutlined} from '@ant-design/icons';
import {useFullscreenPromptPause} from "../context/fullscreenContext.js";
import {useLockedViewport} from "../hooks/useLockedViewport.js";
import {getTrialErrorMessage, isAlreadyCompletedError} from "../utils/trialErrors.js";
import {createTrialSubmission} from "../utils/trialSubmission.js";
import {
    readTrialProgress,
    writeTrialProgress,
    restoreTrialProgress,
    stageTrialSubmission,
    confirmTrialSubmission,
    isTrialProgressComplete,
} from "../utils/trialProgress.js";
import {
    APP_ROUTE,
    getTrialCompletionTransition,
    parsePhase,
    phaseHasInstructions,
    phaseUsesMoodInstructions,
} from "../utils/phaseFlow.js";
import './Trial.css';

const {Title, Paragraph} = Typography;

const MOOD_TYPE = Object.freeze({
    POSITIVE: 'POSITIVE',
    NEGATIVE: 'NEGATIVE',
});

const getMoodTypeFromPhaseName = (phaseName) => {
    if (phaseName === 'خلق مثبت') return MOOD_TYPE.POSITIVE;
    if (phaseName === 'خلق منفی') return MOOD_TYPE.NEGATIVE;
    return null;
};

const getMoodTypeFromInstruction = (instructionName) => {
    if (instructionName === 'دستور العمل خلق مثبت') return MOOD_TYPE.POSITIVE;
    if (instructionName === 'دستور العمل خلق منفی') return MOOD_TYPE.NEGATIVE;
    return null;
};

const getMoodTypeFromApi = (phaseName, instructionName) => {
    const phaseMoodType = getMoodTypeFromPhaseName(phaseName);
    const instructionMoodType = getMoodTypeFromInstruction(instructionName);

    if (phaseMoodType && instructionMoodType && phaseMoodType !== instructionMoodType) {
        return null;
    }

    return phaseMoodType ?? instructionMoodType;
};


const IMAGE_PRELOAD_TIMEOUT = 15000;

const collectClusterImageSources = (clusters = []) => {
    const sources = new Set();

    clusters.forEach((cluster) => {
        (cluster?.images ?? []).forEach((image) => {
            if (image?.file) sources.add(image.file);
        });
    });

    return [...sources];
};

/**
 * Downloads *and decodes* one stimulus before the trial starts, so presenting it
 * later is a paint of an already-decoded bitmap instead of a network + decode
 * round trip. Resolves (never rejects) so a single broken asset cannot stall the
 * whole session.
 */
const preloadStimulusImage = (src) => new Promise((resolve) => {
    const image = new Image();
    let isSettled = false;
    let timer = 0;

    const settle = () => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        resolve(image);
    };

    // A stalled asset must not hold the exam hostage.
    timer = setTimeout(settle, IMAGE_PRELOAD_TIMEOUT);

    image.decoding = 'sync';
    if ('fetchPriority' in image) image.fetchPriority = 'high';

    image.onload = () => {
        if (typeof image.decode === 'function') {
            image.decode().then(settle, settle);
            return;
        }
        settle();
    };
    image.onerror = settle;
    image.src = src;
});

/**
 * Frame-locked timer. A bare `setTimeout` can fire between two frames — or late
 * when the tab is throttled — which stretches a stimulus by at least one frame.
 * Firing from `requestAnimationFrame` keeps every duration aligned to real
 * presented frames.
 */
const scheduleAtFrame = (delay, callback) => {
    const deadline = performance.now() + Math.max(0, Number(delay) || 0);
    let frame = requestAnimationFrame(function tick(timestamp) {
        if (timestamp >= deadline) {
            callback();
            return;
        }

        frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
};

/**
 * The stimulus stage keeps every layer mounted for the whole trial and only flips
 * `opacity`, so switching phases is a compositor-only change: no element
 * creation, no layout, no image decode on the critical frame.
 * Images carry no `alt` text on purpose — a visible alt string would flash as a
 * competing visual cue right where the participant is asked to look.
 */
const StimulusImage = ({src, isVisible}) => {
    if (!src) return null;

    return (
        <img
            className={`trial-layer trial-image${isVisible ? ' is-visible' : ''}`}
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="sync"
            fetchPriority="high"
            onContextMenu={(event) => event.preventDefault()}
        />
    );
};

const TrialStage = ({leftImage, rightImage, targetPosition, phase}) => {
    const showComparison = phase === 'COMPARISON';
    const showTarget = phase === 'TARGET';

    return (
        <div className="trial-stage">
            <div className="trial-stage__slots">
                <div className="trial-slot">
                    <StimulusImage src={leftImage} isVisible={showComparison}/>
                    <span
                        className={`trial-layer trial-target${showTarget && targetPosition === 'LEFT' ? ' is-visible' : ''}`}
                        aria-hidden="true"
                    />
                </div>

                <div className="trial-slot">
                    <StimulusImage src={rightImage} isVisible={showComparison}/>
                    <span
                        className={`trial-layer trial-target${showTarget && targetPosition === 'RIGHT' ? ' is-visible' : ''}`}
                        aria-hidden="true"
                    />
                </div>
            </div>

            <div
                className={`trial-layer trial-fixation${phase === 'INITIAL' ? ' is-visible' : ''}`}
                aria-hidden="true"
            >
                <span className="trial-fixation__bar trial-fixation__bar--horizontal"/>
                <span className="trial-fixation__bar trial-fixation__bar--vertical"/>
            </div>
        </div>
    );
};

const Trial = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [exams, setExams] = useState(null);
    const [globalStatus, setGlobalStatus] = useState('LOADING');
    const [flowError, setFlowError] = useState('');
    const [pendingSubmission, setPendingSubmission] = useState(null);
    const [isVideoComplete, setIsVideoComplete] = useState(false);
    const [isSavingVideo, setIsSavingVideo] = useState(false);
    const [areStimuliReady, setAreStimuliReady] = useState(false);

    const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
    const [trialPhase, setTrialPhase] = useState('INITIAL'); // INITIAL, COMPARISON, TARGET

    const currentTrial = exams?.data?.clusters?.[currentTrialIndex];
    const currentPhase = parsePhase(localStorage.getItem('currentPhase'));
    const activeApiPhaseName = localStorage.getItem('currentPhaseName');
    const activeMoodType = getMoodTypeFromApi(activeApiPhaseName, exams?.data?.instruction);

    const loadedSessionIdRef = useRef(null);
    const loadRequestIdRef = useRef(0);
    const progressScopeRef = useRef(null);
    const progressRef = useRef(null);
    const targetStartTimeRef = useRef(null);
    const submissionInFlightRef = useRef(false);
    const lastSubmittedTrialIndexRef = useRef(null);
    const phaseTransitionInFlightRef = useRef(false);
    const phaseCompletionSavedRef = useRef(false);
    const videoSeenInFlightRef = useRef(false);
    const videoRef = useRef(null);
    // Holds every decoded stimulus for the whole session so the browser cannot
    // evict a bitmap between trials.
    const decodedStimuliRef = useRef([]);

    // The stage stays mounted between trials so the stimulus elements — and their
    // rasterised layers — survive the answer round trip.
    const isStageMounted = globalStatus === 'TEST' || globalStatus === 'SAVING_ANSWER';
    const isStimulusScreen = isStageMounted
        || globalStatus === 'PREPARING'
        || globalStatus === 'RESTORING'
        || globalStatus === 'RESUMING_PHASE'
        || globalStatus === 'FINISHED';

    // No document scrolling and no fullscreen nudges while stimuli are on screen.
    useLockedViewport(isStimulusScreen);
    useFullscreenPromptPause(isStimulusScreen);

    const handleTrialError = useCallback((error, status, fallbackMessage) => {
        console.error(`Trial ${status}:`, error);
        setFlowError(getTrialErrorMessage(error, fallbackMessage));
        setGlobalStatus(status);
    }, []);

    const persistProgress = useCallback((scope, progress) => {
        const saved = writeTrialProgress(localStorage, scope, progress);
        progressRef.current = saved;
        return saved;
    }, []);

    const finishCurrentPhase = useCallback(async () => {
        if (phaseTransitionInFlightRef.current) return;
        const operation = {};
        phaseTransitionInFlightRef.current = operation;
        const scope = progressScopeRef.current;
        const requestId = loadRequestIdRef.current;
        const isCurrent = () => scope && progressScopeRef.current === scope && requestId === loadRequestIdRef.current;
        setGlobalStatus('FINISHED');
        setFlowError('');

        try {
            const transition = getTrialCompletionTransition(currentPhase);
            if (!isCurrent() || !isTrialProgressComplete(progressRef.current)) {
                throw new Error('This phase still has unconfirmed answers.');
            }

            if (transition.completeSession) {
                if (!phaseCompletionSavedRef.current) {
                    try {
                        await setPhaseComplete(scope.token, scope.sessionId);
                    } catch (error) {
                        if (!isAlreadyCompletedError(error)) throw error;
                    }
                    if (!isCurrent()) return;
                    phaseCompletionSavedRef.current = true;
                }
                if (!progressRef.current.phaseCompletionSaved) {
                    persistProgress(scope, {...progressRef.current, phaseCompletionSaved: true});
                }
            }

            if (transition.prepareNextSession) {
                await findValidSession(scope.token);
                if (!isCurrent()) return;
            }
            if (transition.nextPhase !== null) {
                localStorage.setItem('currentPhase', String(transition.nextPhase));
            }
            localStorage.setItem('currentState', transition.state);
            navigate(transition.route, {replace: true});
        } catch (error) {
            if (isCurrent()) {
                handleTrialError(error, 'FLOW_ERROR', 'ثبت پایان مرحله انجام نشد. لطفاً دوباره تلاش کنید.');
            }
        } finally {
            if (phaseTransitionInFlightRef.current === operation) phaseTransitionInFlightRef.current = false;
        }
    }, [currentPhase, navigate, handleTrialError, persistProgress]);

    useEffect(() => {
        let disposed = false;
        let activeRequestId = null;
        // Every stimulus of the session is fetched and decoded before the first
        // fixation cross, so no trial can ever wait on the network. For mood
        // phases this runs while the participant reads the text and watches the
        // video, so it costs no extra waiting time.
        const warmUpStimuli = async (clusters, requestId) => {
            const sources = collectClusterImageSources(clusters);

            if (!sources.length) {
                if (requestId === loadRequestIdRef.current) setAreStimuliReady(true);
                return;
            }

            const decoded = await Promise.all(sources.map(preloadStimulusImage));

            if (requestId !== loadRequestIdRef.current) return;

            decodedStimuliRef.current = decoded;
            setAreStimuliReady(true);
        };

        const fetchData = async () => {
            let requestId = null;
            let restoringAnswer = false;
            const isCurrent = () => !disposed && requestId === loadRequestIdRef.current;

            try {
                const sessionID = localStorage.getItem('currentSessionID');
                const token = localStorage.getItem('authToken');

                if (!currentPhase || !token) {
                    throw new Error('The current phase session is incomplete.');
                }

                const scope = {
                    token, sessionId: sessionID, phase: currentPhase,
                    phaseId: localStorage.getItem('currentPhaseID'),
                };
                let progress = readTrialProgress(localStorage, scope);

                if (
                    phaseHasInstructions(currentPhase) &&
                    localStorage.getItem('currentState') !== 'Exam' &&
                    !isTrialProgressComplete(progress)
                ) {
                    navigate(APP_ROUTE.INSTRUCTIONS, {replace: true});
                    return;
                }

                if (!sessionID) {
                    throw new Error('The current phase session is incomplete.');
                }

                const sessionKey = JSON.stringify(scope);
                if (loadedSessionIdRef.current === sessionKey) return;
                loadedSessionIdRef.current = sessionKey;
                requestId = ++loadRequestIdRef.current;
                activeRequestId = requestId;
                progressScopeRef.current = scope;
                progressRef.current = progress;
                phaseCompletionSavedRef.current = progress?.phaseCompletionSaved === true;
                submissionInFlightRef.current = false;
                phaseTransitionInFlightRef.current = false;
                setGlobalStatus(progress ? 'RESTORING' : 'LOADING');
                setFlowError('');
                setExams(null);
                setCurrentTrialIndex(0);
                setTrialPhase('INITIAL');
                targetStartTimeRef.current = null;
                lastSubmittedTrialIndexRef.current = null;
                setPendingSubmission(null);
                setIsVideoComplete(false);
                setAreStimuliReady(false);
                decodedStimuliRef.current = [];

                // Replay the durable payload before loading any stimuli. It may
                // have reached the server before the old page was unloaded.
                if (progress?.pendingSubmission) {
                    restoringAnswer = true;
                    setPendingSubmission(progress.pendingSubmission);
                    await submitTrialAnswer(token, progress.pendingSubmission);
                    if (!isCurrent()) return;
                    progress = persistProgress(scope, confirmTrialSubmission(progress));
                    setPendingSubmission(null);
                    restoringAnswer = false;
                }

                if (isTrialProgressComplete(progress)) {
                    setGlobalStatus('RESUMING_PHASE');
                    return;
                }

                const data = await getSessionClusters(token, sessionID);

                if (!isCurrent()) return;

                const restored = restoreTrialProgress(progress, data.data?.clusters);
                persistProgress(scope, restored.progress);
                setExams({...data, data: {...data.data, clusters: restored.clusters}});
                warmUpStimuli(restored.clusters, requestId);

                const apiExpectsVideo = localStorage.getItem('currentPhaseHasVideo') === 'true';
                const hasSessionVideo = Boolean(data.data?.video?.file);
                const videoWasAlreadySeen = localStorage.getItem('currentPhaseVideoSeen') === 'true';

                if (phaseUsesMoodInstructions(currentPhase)) {
                    if (!apiExpectsVideo || (!videoWasAlreadySeen && !hasSessionVideo)) {
                        throw new Error('The active mood phase requires a video, but its API metadata is incomplete.');
                    }

                    const moodType = getMoodTypeFromApi(
                        localStorage.getItem('currentPhaseName'),
                        data.data?.instruction,
                    );
                    if (!moodType) {
                        throw new Error('The API returned unsupported or contradictory mood phase metadata.');
                    }

                    setGlobalStatus(videoWasAlreadySeen ? 'PREPARING' : 'READING_TEXT');
                } else {
                    setGlobalStatus('PREPARING');
                }

            } catch (error) {
                if (disposed || (requestId !== null && !isCurrent())) return;

                loadedSessionIdRef.current = null;
                handleTrialError(error, 'LOAD_ERROR', restoringAnswer
                    ? 'بازیابی پاسخ ذخیره‌شده انجام نشد. لطفاً دوباره تلاش کنید.'
                    : 'بارگذاری آزمون انجام نشد. لطفاً دوباره تلاش کنید.');
            }
        };

        // A discarded StrictMode effect must not replay a pending POST twice.
        const startTimer = setTimeout(fetchData, 0);
        return () => {
            disposed = true;
            clearTimeout(startTimer);
            if (activeRequestId !== null && activeRequestId === loadRequestIdRef.current) {
                loadRequestIdRef.current += 1;
                loadedSessionIdRef.current = null;
                progressScopeRef.current = null;
            }
        };
    }, [currentPhase, location.key, navigate, handleTrialError, persistProgress]);

    useEffect(() => {
        if (globalStatus === 'RESUMING_PHASE') finishCurrentPhase();
    }, [globalStatus, finishCurrentPhase]);

    // --- Logic: Start the trials once every stimulus is decoded ---
    useEffect(() => {
        if (globalStatus !== 'PREPARING' || !areStimuliReady) return;

        setGlobalStatus('TEST');
    }, [globalStatus, areStimuliReady]);

    // --- Logic: Trial Phase Transitions ---
    useEffect(() => {
        if (globalStatus !== 'TEST' || !currentTrial) return undefined;

        if (trialPhase === 'TARGET') {
            // Stamp the onset on the frame that actually presents the target, so
            // the reaction time excludes React's commit and the browser's paint.
            const frame = requestAnimationFrame((timestamp) => {
                targetStartTimeRef.current = timestamp;
            });

            return () => cancelAnimationFrame(frame);
        }

        if (trialPhase === 'INITIAL') {
            return scheduleAtFrame(
                currentTrial.initial_duration,
                () => setTrialPhase('COMPARISON'),
            );
        }

        return scheduleAtFrame(
            currentTrial.comparison_duration,
            () => setTrialPhase('TARGET'),
        );
    }, [globalStatus, currentTrial, trialPhase]);

    // --- Logic: Advance to Next Trial ---
    const advanceToNextTrial = useCallback(async () => {
        targetStartTimeRef.current = null;
        setPendingSubmission(null);
        setFlowError('');

        const trialCount = exams?.data?.clusters?.length ?? 0;
        if (currentTrialIndex < trialCount - 1) {
            setCurrentTrialIndex(prev => prev + 1);
            setTrialPhase('INITIAL');
            setGlobalStatus('TEST');
        } else {
            await finishCurrentPhase();
        }
    }, [currentTrialIndex, exams, finishCurrentPhase]);

    // --- Logic: Submit Answer ---
    const handleSubmitAnswer = useCallback(async (
        participantAnswer,
        {responseTimestamp = null, retry = false} = {},
    ) => {
        if (submissionInFlightRef.current) return;
        if (currentTrial?.id == null || currentTrial.id === '') {
            handleTrialError(new Error('The current cluster ID is missing.'),
                'LOAD_ERROR', 'اطلاعات این بخش در دسترس نیست. لطفاً آزمون را دوباره بارگذاری کنید.');
            return;
        }
        // State changes may not have rendered the next cluster yet. Do not let
        // a second key event submit and advance the previous cluster again.
        if (lastSubmittedTrialIndexRef.current === currentTrialIndex) return;
        const scope = progressScopeRef.current;
        const requestId = loadRequestIdRef.current;
        const isCurrent = () => scope && progressScopeRef.current === scope && requestId === loadRequestIdRef.current;
        if (!scope || !progressRef.current) {
            handleTrialError(new Error('The trial checkpoint is not ready.'),
                'LOAD_ERROR', 'اطلاعات پیشرفت آزمون در دسترس نیست. لطفاً دوباره تلاش کنید.');
            return;
        }

        // `event.timeStamp` is the moment the key event was generated, on the same
        // clock as `performance.now()`. A retry uses its saved payload, without
        // counting time spent waiting for the network or the retry button.
        const {payload: submissionData, usedDefaultAnswer, usedDefaultResponseTime} = createTrialSubmission({
            clusterId: currentTrial.id,
            answer: participantAnswer,
            previousSubmission: retry ? (progressRef.current.pendingSubmission ?? pendingSubmission) : null,
            targetStartTime: retry ? null : targetStartTimeRef.current,
            responseTimestamp: retry ? null : responseTimestamp,
            currentTimestamp: retry ? null : performance.now(),
        });

        if (usedDefaultAnswer || usedDefaultResponseTime) {
            console.warn('Using fallback values for an incomplete trial response:', {
                clusterId: currentTrial.id, usedDefaultAnswer, usedDefaultResponseTime,
            });
        }

        const operation = {};
        submissionInFlightRef.current = operation;
        setPendingSubmission(submissionData);
        setFlowError('');
        setGlobalStatus('SAVING_ANSWER');

        try {
            // Persist before sending, then persist the acknowledgment before
            // showing the next fixation. Refresh cannot lose the original time.
            persistProgress(scope, stageTrialSubmission(progressRef.current, submissionData));
            await submitTrialAnswer(scope.token, submissionData);
            if (!isCurrent()) return;
            persistProgress(scope, confirmTrialSubmission(progressRef.current));

            lastSubmittedTrialIndexRef.current = currentTrialIndex;
            await advanceToNextTrial();
        } catch (error) {
            if (isCurrent()) handleTrialError(error, 'ANSWER_ERROR', 'ثبت پاسخ انجام نشد. برای ارسال دوباره تلاش کنید.');
        } finally {
            if (submissionInFlightRef.current === operation) submissionInFlightRef.current = false;
        }
    }, [advanceToNextTrial, currentTrial, currentTrialIndex, handleTrialError, pendingSubmission, persistProgress]);
    // --- Logic: Keyboard Listener ---
    useEffect(() => {
        if (globalStatus !== 'TEST' || trialPhase !== 'TARGET') return;

        const handleKeyDown = (event) => {
            if (event.repeat || submissionInFlightRef.current) return;

            const key = event.key.toUpperCase();
            if (key === 'D' || key === 'ARROWLEFT') {
                event.preventDefault();
                handleSubmitAnswer('LEFT', {responseTimestamp: event.timeStamp});
            } else if (key === 'K' || key === 'ARROWRIGHT') {
                event.preventDefault();
                handleSubmitAnswer('RIGHT', {responseTimestamp: event.timeStamp});
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [globalStatus, trialPhase, handleSubmitAnswer]);

    const handleVideoPause = async () => {
        const video = videoRef.current;
        const reachedNaturalEnd = video
            && Number.isFinite(video.duration)
            && video.currentTime >= video.duration;

        if (!video || video.ended || reachedNaturalEnd || videoSeenInFlightRef.current) return;

        try {
            await video.play();
        } catch (error) {
            handleTrialError(error, 'VIDEO_LOAD_ERROR', 'پخش ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
        }
    };

    const handleVideoEnded = async () => {
        if (videoSeenInFlightRef.current) return;
        videoSeenInFlightRef.current = true;
        setIsSavingVideo(true);
        setFlowError('');

        try {
            const token = localStorage.getItem('authToken');
            const sessionVideoId = exams?.data?.video?.session_video_id;

            if (!token || !sessionVideoId) {
                throw new Error('The video session is incomplete.');
            }

            await setVideoSeen(token, sessionVideoId);
            localStorage.setItem('currentPhaseVideoSeen', 'true');
            setIsVideoComplete(true);
            setGlobalStatus('VIDEO');
        } catch (error) {
            setIsVideoComplete(false);
            handleTrialError(error, 'VIDEO_ERROR', 'ثبت مشاهده ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
        } finally {
            videoSeenInFlightRef.current = false;
            setIsSavingVideo(false);
        }
    };

    const handleVideoError = () => {
        if (videoRef.current?.ended) return;

        setIsVideoComplete(false);
        setFlowError('بارگذاری ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
        setGlobalStatus('VIDEO_LOAD_ERROR');
    };

    const handleRetry = () => {
        if (globalStatus === 'LOAD_ERROR') {
            loadedSessionIdRef.current = null;
            navigate(location.pathname, {
                replace: true,
                state: { retryAt: Date.now() },
            });
        } else if (globalStatus === 'ANSWER_ERROR') {
            handleSubmitAnswer(null, {retry: true});
        } else if (globalStatus === 'VIDEO_ERROR') {
            handleVideoEnded();
        } else if (globalStatus === 'VIDEO_LOAD_ERROR') {
            loadedSessionIdRef.current = null;
            navigate(location.pathname, {
                replace: true,
                state: { retryAt: Date.now() },
            });
        } else if (globalStatus === 'FLOW_ERROR') {
            finishCurrentPhase();
        }
    };


    // Resolved once per trial — during the fixation cross — so the comparison
    // frame has nothing left to compute.
    const stimulus = useMemo(() => {
        if (!currentTrial) {
            return {leftImage: null, rightImage: null, targetPosition: null};
        }

        const comparisonImages = (currentTrial.images || []).filter(img => img.type === 'COMPARISON');
        let specialImg = null;
        let normalImg = null;

        if (currentTrial.type === 'FILLER') {
            if (comparisonImages.length >= 2) {
                [specialImg, normalImg] = comparisonImages;
            }
        } else {
            specialImg = comparisonImages.find(img => img.is_special);
            normalImg = comparisonImages.find(img => !img.is_special);
        }

        const isSpecialOnLeft = currentTrial.special_position === 'LEFT';

        return {
            leftImage: (isSpecialOnLeft ? specialImg : normalImg)?.file ?? null,
            rightImage: (isSpecialOnLeft ? normalImg : specialImg)?.file ?? null,
            targetPosition: currentTrial.target_position ?? null,
        };
    }, [currentTrial]);

    // --- Styles ---
    const styles = {
        backgroundWrapper: {
            minHeight: '100dvh',
            width: '100%',
            background: 'radial-gradient(circle at 50% 10%, #134e4a 0%, #0f172a 60%, #020617 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Vazirmatn', sans-serif",
        },
        glassCard: {
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(45, 212, 191, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            borderRadius: '24px',
            padding: '40px',
            maxWidth: '1000px',
            width: '90%',
            direction: 'rtl',
            textAlign: 'right'
        },
        primaryButton: {
            background: 'linear-gradient(135deg, #0f766e 0%, #2dd4bf 100%)',
            border: 'none',
            height: '50px',
            fontSize: '18px',
            fontWeight: 'bold',
            marginTop: '30px',
            boxShadow: '0 4px 15px rgba(13, 148, 136, 0.4)'
        }
    };


    // --- Main Render ---

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {colorPrimary: '#2dd4bf', fontFamily: "'Vazirmatn', sans-serif"},
            }}
        >
            <div style={styles.backgroundWrapper}>

                {['LOADING', 'RESTORING', 'RESUMING_PHASE'].includes(globalStatus) && (
                    <div role="status" className="text-[#2dd4bf] text-2xl font-bold animate-pulse" dir="rtl">
                        {globalStatus === 'LOADING' ? 'در حال بارگذاری...' : 'در حال بازیابی پیشرفت آزمون...'}
                    </div>
                )}

                {globalStatus === 'PREPARING' && (
                    <div className="flex flex-col items-center gap-4 text-center" dir="rtl">
                        <LoadingOutlined style={{fontSize: '34px', color: '#2dd4bf'}} spin/>
                        <span className="text-[#2dd4bf] text-xl font-bold">
                            در حال آماده‌سازی تصاویر آزمون...
                        </span>
                        <span className="text-slate-400 text-sm max-w-md">
                            تصاویر پیش از شروع کامل بارگذاری می‌شوند تا در طول آزمون هیچ تأخیری رخ ندهد.
                        </span>
                    </div>
                )}

                {(globalStatus === 'SAVING_ANSWER' || globalStatus === 'FINISHED') && (
                    <div className="text-[#2dd4bf] text-2xl font-bold animate-pulse" dir="rtl">
                        {/* در حال ثبت اطلاعات... */}
                    </div>
                )}

                {['LOAD_ERROR', 'ANSWER_ERROR', 'VIDEO_ERROR', 'VIDEO_LOAD_ERROR', 'FLOW_ERROR'].includes(globalStatus) && (
                    <div style={{...styles.glassCard, maxWidth: '560px', textAlign: 'center'}}>
                        <Title level={3} style={{color: '#f8fafc', marginTop: 0}}>
                            ادامه آزمون امکان‌پذیر نیست
                        </Title>
                        <Paragraph role="alert" style={{color: '#fca5a5', fontSize: '16px'}}>
                            {flowError}
                        </Paragraph>
                        <Button
                            type="primary"
                            block
                            style={styles.primaryButton}
                            onClick={handleRetry}
                            loading={globalStatus === 'VIDEO_ERROR' && isSavingVideo}
                        >
                            تلاش دوباره
                        </Button>
                    </div>
                )}


                {globalStatus === 'READING_TEXT' && (
                    <div style={styles.glassCard}>
                        <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-4">
                            <FileTextOutlined style={{fontSize: '32px', color: '#2dd4bf'}}/>
                            <Title level={2} style={{color: '#f8fafc', margin: 0}}>مطالعه متن</Title>
                        </div>

                        <div className="text-lg leading-10 text-slate-100 text-justify" dir="rtl">
                            {activeMoodType === MOOD_TYPE.POSITIVE ? (
                                <p>
                                    سیاره عطارد نزدیک‌ترین سیاره به خورشید است. قطر آن حدود ۴۸۷۹ کیلومتر است. دوره گردش
                                    آن حول خورشید ۸۸ روز زمینی طول می‌کشد. سطح آن پر از دهانه‌های برخوردی است. نداشتن جو
                                    ضخیم باعث تغییرات دمایی شدید می‌شود. سیاره زهره دومین سیاره از خورشید است. قطر آن
                                    ۱۲۱۰۴ کیلومتر است. دوره گردش آن ۲۲۵ روز زمینی است. جو آن عمدتاً از دی‌اکسید کربن
                                    تشکیل شده. دمای سطح آن بیش از ۴۶۰ درجه سلسیوس است. سیاره زمین سومین سیاره است. قطر
                                    آن ۱۲۷۴۲ کیلومتر است. دوره گردش آن ۳۶۵ روز زمینی است. جو آن شامل نیتروژن و اکسیژن
                                    است. ماه طبیعی آن قمر زمین است. سیاره مریخ چهارمین سیاره است. قطر آن ۶۷۹۲ کیلومتر
                                    است. دوره گردش آن ۶۸۷ روز زمینی است. رنگ قرمز آن از اکسید آهن ناشی می‌شود. دو قمر
                                    کوچک به نام فوبوس و دیموس دارد. سیاره مشتری پنجمین سیاره است. قطر آن ۱۳۹۸۲۰ کیلومتر
                                    است. دوره گردش آن ۱۲ سال زمینی است. بزرگ‌ترین سیاره منظومه شمسی است. بیش از ۹۰ قمر
                                    دارد.
                                </p>
                            ) : (
                                <p>
                                    کتابخانه عمومی شهر در ساختمانی قدیمی با قفسه‌های چوبی بلند قرار دارد. هر روز صبح،
                                    کارکنان درها را باز می‌کنند و چراغ‌ها را روشن می‌کنند. بازدیدکنندگان شامل دانشجویان،
                                    معلمان و افراد بازنشسته هستند که آرام وارد می‌شوند. داخل کتابخانه، بخش‌های مختلفی
                                    وجود دارد: قفسه‌های رمان‌های کلاسیک، کتاب‌های علمی و مجلات ماهانه. یک مرد میانسال
                                    کتابی درباره تاریخ معماری برمی‌دارد و در میز چوبی می‌نشیند. او صفحات را ورق می‌زند و
                                    یادداشت‌هایی می‌نویسد. در بخش کودکان، مادری با فرزندش می‌آید. کودک کتاب‌های مصور با
                                    تصاویر حیوانات را انتخاب می‌کند و روی زمین می‌نشیند. مادر به قفسه‌های بزرگسالان
                                    می‌رود و کتابی درباره باغبانی برمی‌دارد. هوا داخل کتابخانه خنک و ساکت است، با صدای
                                    صفحه‌های ورق‌خورده.
                                </p>
                            )}
                        </div>

                        <Button
                            type="primary"
                            block
                            style={styles.primaryButton}
                            onClick={() => {
                                setFlowError('');
                                setGlobalStatus('VIDEO');
                            }}
                        >
                            ادامه
                        </Button>
                    </div>
                )}


                {globalStatus === 'VIDEO' && (
                    <div style={{...styles.glassCard, maxWidth: '800px', textAlign: 'center'}}>
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <PlayCircleOutlined style={{fontSize: '32px', color: '#2dd4bf'}}/>
                            <Title level={3} style={{color: '#f8fafc', margin: 0}}>مشاهده ویدیو</Title>
                        </div>

                        <div className="rounded-xl overflow-hidden border-2 border-slate-600 shadow-2xl">
                            <video
                                ref={videoRef}
                                src={exams.data.video.file}
                                className="w-full h-auto"
                                controls={false}
                                controlsList="nodownload noplaybackrate noremoteplayback"
                                disablePictureInPicture
                                disableRemotePlayback
                                autoPlay
                                playsInline
                                onPause={handleVideoPause}
                                onEnded={handleVideoEnded}
                                onError={handleVideoError}
                                onContextMenu={(event) => event.preventDefault()}
                            >
                                مرورگر شما امکان پخش این ویدیو را ندارد.
                            </video>
                        </div>
                        {isVideoComplete && (
                            <Button
                                type="primary"
                                size="large"
                                onClick={() => {
                                    setFlowError('');
                                    setGlobalStatus(areStimuliReady ? 'TEST' : 'PREPARING');
                                }}
                                style={{...styles.primaryButton, minWidth: '180px'}}
                            >
                                ادامه آزمون
                            </Button>
                        )}
                        <Paragraph style={{marginTop: '20px', color: '#94a3b8'}}>
                            {isVideoComplete
                                ? 'مشاهده ویدیو کامل شد. برای شروع، دکمه ادامه آزمون را انتخاب کنید.'
                                : isSavingVideo
                                    ? 'در حال ثبت مشاهده کامل ویدیو...'
                                    : 'لطفاً ویدیو را تا انتها تماشا کنید. پس از پایان، دکمه ادامه آزمون نمایش داده می‌شود.'}
                        </Paragraph>
                        {flowError && (
                            <Paragraph style={{color: '#fca5a5'}}>{flowError}</Paragraph>
                        )}
                    </div>
                )}


                {isStageMounted && currentTrial && (
                    /* Deliberately not keyed per trial: reusing the same elements
                       lets the next pair of sources swap in during the fixation
                       cross instead of on the presentation frame. */
                    <TrialStage
                        leftImage={stimulus.leftImage}
                        rightImage={stimulus.rightImage}
                        targetPosition={stimulus.targetPosition}
                        phase={globalStatus === 'TEST' ? trialPhase : 'IDLE'}
                    />
                )}

            </div>
        </ConfigProvider>
    );
};

export default Trial;
