import React, {useState, useEffect, useCallback, useRef} from 'react';
import axios from 'axios';
import {useLocation, useNavigate} from 'react-router-dom';
import {Button, ConfigProvider, theme, Typography} from 'antd';
import {
    getSessionClusters,
    setPhaseComplete,
    setVideoSeen,
    findValidSession
} from "../api/probes.js";
import {PauseCircleOutlined, PlayCircleOutlined, FileTextOutlined} from '@ant-design/icons';
import {API_SERVER} from "../utils/API_SERVER.js";
import {
    APP_ROUTE,
    getTrialCompletionTransition,
    parsePhase,
    phaseHasInstructions,
    phaseUsesMoodInstructions,
} from "../utils/phaseFlow.js";

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


const ComparisonImageContainer = ({src}) => (
    <div className="w-96 h-96 flex-shrink-0 flex justify-center items-center">
        {src && <img src={src} alt="stimulus"
                     className="w-full h-full object-cover rounded-xl shadow-2xl border-4 border-slate-700"/>}
    </div>
);


const TargetBall = () => (
    <div
        className="w-24 h-24 rounded-full shadow-[0_0_40px_rgba(251,191,36,0.8)]"
        style={{

            background: 'radial-gradient(circle at 30% 30%, #fffbeb, #fbbf24, #d97706)'
        }}
    ></div>
);


const FixationCross = () => (
    <div className="relative w-32 h-32 flex justify-center items-center">

        <div className="absolute w-full h-4 bg-white rounded-full shadow-[0_0_25px_rgba(255,255,255,0.9)]"></div>

        <div className="absolute h-full w-4 bg-white rounded-full shadow-[0_0_25px_rgba(255,255,255,0.9)]"></div>
    </div>
);

const Trial = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [exams, setExams] = useState(null);
    const [globalStatus, setGlobalStatus] = useState('LOADING');
    const [flowError, setFlowError] = useState('');
    const [pendingSubmission, setPendingSubmission] = useState(null);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isSavingVideo, setIsSavingVideo] = useState(false);

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

  

    useEffect(() => {
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

                const data = await getSessionClusters(token, sessionID);

                if (requestId !== loadRequestIdRef.current) return;

                if (!data.data?.clusters?.length) {
                    throw new Error('No trials were returned for this phase.');
                }

                setExams(data);

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

                    setGlobalStatus(videoWasAlreadySeen ? 'TEST' : 'READING_TEXT');
                } else {
                    setGlobalStatus('TEST');
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

    // --- Logic: Trial Phase Transitions ---
    useEffect(() => {
        if (globalStatus !== 'TEST' || !currentTrial) return;

        let timer;

        if (trialPhase === 'INITIAL') {
  
            timer = setTimeout(() => {
                setTrialPhase('COMPARISON');
            }, currentTrial.initial_duration);
        } else if (trialPhase === 'COMPARISON') {
            timer = setTimeout(() => {
                setTrialPhase('TARGET');
            }, currentTrial.comparison_duration);
        } else if (trialPhase === 'TARGET') {
            targetStartTimeRef.current = performance.now();
        }

        return () => clearTimeout(timer);
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
    const handleSubmitAnswer = useCallback(async (participantAnswer, savedResponseTime = null) => {
        if (!currentTrial || submissionInFlightRef.current) return;

        const targetStartTime = targetStartTimeRef.current;
        if (targetStartTime === null && savedResponseTime === null) return;

        const responseTime = savedResponseTime ?? Math.round(performance.now() - targetStartTime);

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
                handleSubmitAnswer('LEFT');
            } else if (key === 'K' || key === 'ARROWRIGHT') {
                event.preventDefault();
                handleSubmitAnswer('RIGHT');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [globalStatus, trialPhase, handleSubmitAnswer]);

    const handleToggleVideoPlayback = async () => {
        const video = videoRef.current;
        if (!video || isSavingVideo || videoSeenInFlightRef.current) return;

        try {
            if (video.paused) {
                await video.play();
            } else {
                video.pause();
            }
        } catch (error) {
            console.error('Video playback failed', error);
            setFlowError('پخش ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
        }
    };

    const handleVideoEnded = async () => {
        if (videoSeenInFlightRef.current) return;
        videoSeenInFlightRef.current = true;
        setIsVideoPlaying(false);
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
            setGlobalStatus('TEST');
        } catch (error) {
            console.error('Failed to save video completion', error);
            setFlowError('ثبت مشاهده ویدیو انجام نشد. لطفاً دوباره تلاش کنید.');
            setGlobalStatus('VIDEO_ERROR');
        } finally {
            videoSeenInFlightRef.current = false;
            setIsSavingVideo(false);
        }
    };

    const handleVideoError = () => {
        if (videoRef.current?.ended) return;

        setIsVideoPlaying(false);
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


    // --- Styles ---
    const styles = {
        backgroundWrapper: {
            minHeight: '100vh',
            width: '100vw',
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


    const renderComparisonPhase = () => {
        const images = currentTrial?.images || [];
        const type = currentTrial?.type;
        let specialImg = null;
        let normalImg = null;
        const comparisionImage = images.filter(img => img.type === 'COMPARISON');

        if (type === 'FILLER') {
            if (comparisionImage.length >= 2) {
                [specialImg, normalImg] = comparisionImage;
            }
        } else {
            specialImg = comparisionImage.find(img => img.is_special);
            normalImg = comparisionImage.find(img => !img.is_special);
        }


        let leftImageSrc = null;
        let rightImageSrc = null;

        if (currentTrial.special_position === 'LEFT') {
            leftImageSrc = specialImg?.file;
            rightImageSrc = normalImg?.file;
        } else {
            leftImageSrc = normalImg?.file;
            rightImageSrc = specialImg?.file;
        }

        return (
            <div className="w-full h-full flex justify-center items-center gap-48">
                <ComparisonImageContainer src={leftImageSrc}/>
                <ComparisonImageContainer src={rightImageSrc}/>
            </div>
        );
    };

    const renderTargetPhase = () => {
        const position = currentTrial.target_position;

        return (
            <div className="w-full h-full flex justify-center items-center gap-48">
                {/* Left Slot */}
                <div className="w-96 h-96 flex justify-center items-center">
                    {position === 'LEFT' && <TargetBall/>}
                </div>

                {/* Right Slot */}
                <div className="w-96 h-96 flex justify-center items-center">
                    {position === 'RIGHT' && <TargetBall/>}
                </div>
            </div>
        );
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
                                autoPlay
                                playsInline
                                onPlay={() => setIsVideoPlaying(true)}
                                onPause={() => setIsVideoPlaying(false)}
                                onEnded={handleVideoEnded}
                                onError={handleVideoError}
                            >
                                مرورگر شما امکان پخش این ویدیو را ندارد.
                            </video>
                        </div>
                        <Button
                            type="primary"
                            size="large"
                            icon={isVideoPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                            onClick={handleToggleVideoPlayback}
                            loading={isSavingVideo}
                            style={{...styles.primaryButton, minWidth: '180px'}}
                        >
                            {isVideoPlaying ? 'توقف ویدیو' : 'پخش ویدیو'}
                        </Button>
                        <Paragraph style={{marginTop: '20px', color: '#94a3b8'}}>
                            لطفاً ویدیو را تا انتها تماشا کنید. آزمون پس از پایان ویدیو به صورت خودکار شروع می‌شود.
                        </Paragraph>
                        {flowError && (
                            <Paragraph style={{color: '#fca5a5'}}>{flowError}</Paragraph>
                        )}
                    </div>
                )}


                {globalStatus === 'TEST' && (
                    <div className="w-full h-screen flex justify-center items-center">

                        {trialPhase === 'INITIAL' && <FixationCross/>}

                        {trialPhase === 'COMPARISON' && renderComparisonPhase()}

                        {trialPhase === 'TARGET' && renderTargetPhase()}
                    </div>
                )}

            </div>
        </ConfigProvider>
    );
};

export default Trial;
