import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import axios from 'axios';
import {useLocation, useNavigate} from 'react-router-dom';
import {Button, ConfigProvider, theme, Typography} from 'antd';
import {
    getSessionClusters,
    setPhaseComplete,
    setVideoSeen,
    findValidSession
} from "../api/probes.js";
import {PlayCircleOutlined, FileTextOutlined, LoadingOutlined} from '@ant-design/icons';
import {API_SERVER} from "../utils/API_SERVER.js";
import {useFullscreenPromptPause} from "../context/fullscreenContext.js";
import {useLockedViewport} from "../hooks/useLockedViewport.js";
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
    const targetStartTimeRef = useRef(null);
    const submissionInFlightRef = useRef(false);
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
        || globalStatus === 'FINISHED';

    // No document scrolling and no fullscreen nudges while stimuli are on screen.
    useLockedViewport(isStimulusScreen);
    useFullscreenPromptPause(isStimulusScreen);

    useEffect(() => {
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

            try {
                const sessionID = localStorage.getItem('currentSessionID');
                const token = localStorage.getItem('authToken');

                if (!currentPhase || !token) {
                    throw new Error('The current phase session is incomplete.');
                }

                if (
                    phaseHasInstructions(currentPhase) &&
                    localStorage.getItem('currentState') !== 'Exam'
                ) {
                    navigate(APP_ROUTE.INSTRUCTIONS, {replace: true});
                    return;
                }

                if (!sessionID) {
                    throw new Error('The current phase session is incomplete.');
                }

                if (loadedSessionIdRef.current === sessionID) return;
                loadedSessionIdRef.current = sessionID;
                requestId = ++loadRequestIdRef.current;
                phaseCompletionSavedRef.current = false;
                setGlobalStatus('LOADING');
                setFlowError('');
                setExams(null);
                setCurrentTrialIndex(0);
                setTrialPhase('INITIAL');
                setIsVideoComplete(false);
                setAreStimuliReady(false);
                decodedStimuliRef.current = [];

                const data = await getSessionClusters(token, sessionID);

                if (requestId !== loadRequestIdRef.current) return;

                if (!data.data?.clusters?.length) {
                    throw new Error('No trials were returned for this phase.');
                }

                setExams(data);
                warmUpStimuli(data.data.clusters, requestId);

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
                if (requestId !== null && requestId !== loadRequestIdRef.current) return;

                console.error("Failed to fetch exam data", error);
                loadedSessionIdRef.current = null;
                setFlowError('بارگذاری آزمون انجام نشد. لطفاً دوباره تلاش کنید.');
                setGlobalStatus('LOAD_ERROR');
            }
        };

        fetchData();
    }, [currentPhase, location.key, navigate]);

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

    const finishCurrentPhase = useCallback(async () => {
        if (phaseTransitionInFlightRef.current) return;
        phaseTransitionInFlightRef.current = true;
        setGlobalStatus('FINISHED');
        setFlowError('');

        try {
            const transition = getTrialCompletionTransition(currentPhase);
            const sessionID = localStorage.getItem('currentSessionID');
            const token = localStorage.getItem('authToken');

            if (!token || !sessionID) {
                throw new Error('The current phase session is incomplete.');
            }

            if (transition.completeSession && !phaseCompletionSavedRef.current) {
                await setPhaseComplete(token, sessionID);
                phaseCompletionSavedRef.current = true;
            }

            if (transition.prepareNextSession) {
                await findValidSession(token);
            }

            if (transition.nextPhase !== null) {
                localStorage.setItem('currentPhase', String(transition.nextPhase));
            }

            localStorage.setItem('currentState', transition.state);
            navigate(transition.route, { replace: true });
        } catch (error) {
            console.error('Failed to complete the phase', error);
            setFlowError('ثبت پایان مرحله انجام نشد. لطفاً دوباره تلاش کنید.');
            setGlobalStatus('FLOW_ERROR');
        } finally {
            phaseTransitionInFlightRef.current = false;
        }
    }, [currentPhase, navigate]);

    // --- Logic: Advance to Next Trial ---
    const advanceToNextTrial = useCallback(async () => {
        const trialCount = exams?.data?.clusters?.length ?? 0;
        if (currentTrialIndex < trialCount - 1) {
            targetStartTimeRef.current = null;
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
        savedResponseTime = null,
        responseTimestamp = null,
    ) => {
        if (!currentTrial || submissionInFlightRef.current) return;

        const targetStartTime = targetStartTimeRef.current;
        if (targetStartTime === null && savedResponseTime === null) return;

        // `event.timeStamp` is the moment the key event was generated, on the same
        // clock as `performance.now()`; reading the clock inside the handler would
        // instead include everything JS did before this line.
        const responseAt = Number.isFinite(responseTimestamp) && responseTimestamp > 0
            ? responseTimestamp
            : performance.now();
        const responseTime = savedResponseTime
            ?? Math.max(0, Math.round(responseAt - targetStartTime));

        const submissionData = {
            cluster_id: currentTrial.id,
            answer: participantAnswer,
            response_time: responseTime,
        };

        submissionInFlightRef.current = true;
        setPendingSubmission({answer: participantAnswer, responseTime});
        setFlowError('');
        setGlobalStatus('SAVING_ANSWER');

        try {
            const userToken = localStorage.getItem('authToken');
            const API_ENDPOINT = `${API_SERVER()}probe/results/create/`;
            await axios.post(API_ENDPOINT, submissionData, {
                headers: {'Authorization': `token ${userToken}`, 'Content-Type': 'application/json'},
            });

            targetStartTimeRef.current = null;
            setPendingSubmission(null);
            await advanceToNextTrial();
        } catch (error) {
            console.error('Error submitting answer:', error);
            setFlowError('ثبت پاسخ انجام نشد. برای ارسال دوباره تلاش کنید.');
            setGlobalStatus('ANSWER_ERROR');
        } finally {
            submissionInFlightRef.current = false;
        }
    }, [advanceToNextTrial, currentTrial]);
    // --- Logic: Keyboard Listener ---
    useEffect(() => {
        if (globalStatus !== 'TEST' || trialPhase !== 'TARGET') return;

        const handleKeyDown = (event) => {
            if (event.repeat || submissionInFlightRef.current) return;

            const key = event.key.toUpperCase();
            if (key === 'D' || key === 'ARROWLEFT') {
                event.preventDefault();
                handleSubmitAnswer('LEFT', null, event.timeStamp);
            } else if (key === 'K' || key === 'ARROWRIGHT') {
                event.preventDefault();
                handleSubmitAnswer('RIGHT', null, event.timeStamp);
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
            console.error('Video playback could not be resumed', error);
            setFlowError('پخش ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
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
            console.error('Failed to save video completion', error);
            setIsVideoComplete(false);
            setFlowError('ثبت مشاهده ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
            setGlobalStatus('VIDEO_ERROR');
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
        } else if (globalStatus === 'ANSWER_ERROR' && pendingSubmission) {
            handleSubmitAnswer(pendingSubmission.answer, pendingSubmission.responseTime);
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

                {globalStatus === 'LOADING' && (
                    <div className="text-[#2dd4bf] text-2xl font-bold animate-pulse">
                        در حال بارگذاری...
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
                        <Paragraph style={{color: '#fca5a5', fontSize: '16px'}}>
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
