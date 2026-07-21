import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, ConfigProvider, theme, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast, Slide } from 'react-toastify';
import {
  InfoCircleOutlined,
  ArrowLeftOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  BankOutlined,
  ExperimentOutlined,
  AimOutlined,
  CoffeeOutlined,
  ReadOutlined,
  VideoCameraOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SoundOutlined
} from '@ant-design/icons';
import { findValidSession } from "../api/probes.js";
import {
  APP_ROUTE,
  parsePhase,
  phaseHasInstructions,
  phaseUsesMoodInstructions,
} from "../utils/phaseFlow.js";
import 'react-toastify/dist/ReactToastify.css';

// -----------------------------------------------------------
// REPLACE WITH YOUR REAL IMPORTS
// -----------------------------------------------------------
import standardAudioFile from '../assets/sounds/first_ins.mp3';
import interventionAudioFile from '../assets/sounds/second_ins.mp3';


const { Title } = Typography;
const standardInstructions = [
  "در شروع هر آزمون، یک علامت \"+\" در وسط صفحه ظاهر خواهد شد؛ مستقیماً به آن خیره شوید تا تمرکزتان حفظ شود.",
  "بلافاصله پس از ناپدید شدن آن، دو تصویر همزمان روی صفحه ظاهر خواهند شد: یکی در سمت چپ و دیگری در سمت راست.",
  "پس از ناپدید شدن تصاویر، یک توپ در محل یکی از آن‌ها (سمت چپ یا راست) ظاهر خواهد شد. سریع به آن واکنش نشان دهید: اگر توپ در سمت چپ است، کلید آبی سمت چپ را فشار دهید و اگر در سمت راست است، کلید آبی سمت راست را فشار دهید.",
  "هدف، پاسخ سریع و دقیق است؛ هرچه بهتر عمل کنید، نتیجه مطلوب‌تر خواهد بود.",
  "در صورتی که آماده هستید، دکمه شروع را بزنید."
];

const interventionInstructions = [
  "این مرحله از آزمایش با موفقیت به پایان رسید.",
  "پس از کمی استراحت وارد مرحله بعدی خواهید شد.",
  "در این مرحله شما با یک متن روبرو خواهید شد.",
  "این متن را با دقت بخوانید، در پایان آزمایش سوالاتی در رابطه با این متن از شما پرسیده خواهد شد.",
  "بعد از آن شما یک فیلم خواهید دید، این فیلم میتواند هیجاناتی در شما ایجاد کند، لطفا تا انتها و با دقت آن را تماشا کنید."
];

// ----------------------------------------------------------------------
// NEW CONSTANT: PAUSE BUFFER
// This adds "weight" to the end of sentences to account for pauses.
// A higher number means the text waits longer before switching.
// ----------------------------------------------------------------------
const CHAR_BUFFER = 35; // Equivalent to adding 35 characters of 'silence' to every line.

const styles = {
  backgroundWrapper: {
    height: '100vh',
    width: '100vw',
    background: 'radial-gradient(circle at 50% 10%, #134e4a 0%, #0f172a 60%, #020617 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '15px',
    overflow: 'hidden',
    position: 'relative',
  },
  glassCard: {
    width: '100%',
    maxWidth: 1300,
    height: 'auto',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 23, 42, 0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(45, 212, 191, 0.2)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
    borderRadius: '20px',
    padding: '20px 30px',
    zIndex: 10,
    marginBottom: '40px',
    position: 'relative',
  },
  contentContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    paddingTop: '20px',
    overflowY: 'auto',
  },
  submitButton: {
    height: 55,
    fontSize: '18px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #2dd4bf 100%)',
    border: '1px solid rgba(45, 212, 191, 0.4)',
    boxShadow: '0 0 20px rgba(13, 148, 136, 0.3)',
    marginTop: '15px',
    width: '100%',
    color: 'white',
    letterSpacing: '1px',
  },
  iconWrapper: {
    width: 40, height: 40,
    background: 'rgba(45, 212, 191, 0.1)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 5px',
    border: '1px solid rgba(45, 212, 191, 0.3)',
  },
  footer: {
    position: 'absolute',
    bottom: '10px',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '20px',
    zIndex: 5,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '13px',
  },
  audioPlayer: {
    position: 'absolute',
    top: '20px',
    left: '30px',
    width: 'fit-content',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(45, 212, 191, 0.08)',
    padding: '6px 14px',
    borderRadius: '30px',
    border: '1px solid rgba(45, 212, 191, 0.15)',
    backdropFilter: 'blur(5px)',
    zIndex: 20,
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    direction: 'rtl'
  }
};

const InstructionsScreen = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Animation & Audio State
  const [hasStarted, setHasStarted] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [visibleElements, setVisibleElements] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const navigationInFlightRef = useRef(false);

  // Toast ID
  const toastId = useRef(null);

  const currentPhase = parsePhase(localStorage.getItem('currentPhase'));
  const isInterventionPhase = phaseUsesMoodInstructions(currentPhase);

  const activeInstructions = isInterventionPhase ? interventionInstructions : standardInstructions;
  const activeAudioSrc = isInterventionPhase ? interventionAudioFile : standardAudioFile;

  const standardIcons = [
    <EyeOutlined />, <ExperimentOutlined />, <ThunderboltOutlined />, <AimOutlined />, <CheckCircleOutlined />
  ];
  const interventionIcons = [
    <CheckCircleOutlined />, <CoffeeOutlined />, <ReadOutlined />, <EyeOutlined />, <VideoCameraOutlined />
  ];
  const activeIcons = isInterventionPhase ? interventionIcons : standardIcons;

  // --------------------------------------------------------------------------
  // LOGIC: Weighted Time Calculation
  // --------------------------------------------------------------------------
  // Calculate total "units" of time. A unit is a character + buffer characters per line.
  const totalTimeUnits = useMemo(() => {
    const rawCharCount = activeInstructions.reduce((acc, str) => acc + str.length, 0);
    const bufferCount = activeInstructions.length * CHAR_BUFFER;
    return rawCharCount + bufferCount;
  }, [activeInstructions]);

  const revealThresholds = useMemo(() => {
    let elapsed = 0;

    return activeInstructions.map((_, index) => {
      if (index === 0) return 0;

      const previousLineLength = activeInstructions[index - 1].length + CHAR_BUFFER;
      elapsed += previousLineLength / totalTimeUnits;
      return elapsed;
    });
  }, [activeInstructions, totalTimeUnits]);

  useEffect(() => {
    if (currentPhase === null) {
      navigate(APP_ROUTE.SIGN_UP, { replace: true });
    } else if (!phaseHasInstructions(currentPhase)) {
      navigate(APP_ROUTE.TRIAL, { replace: true });
    }
  }, [currentPhase, navigate]);


  // Initialize Audio & Toast
  useEffect(() => {
    if (!phaseHasInstructions(currentPhase)) return undefined;

    const audio = new Audio(activeAudioSrc);
    audioRef.current = audio;

    const handlePlay = () => {
      setHasStarted(true);
      setIsPlaying(true);
      setVisibleElements((previous) => Math.max(previous, 1));
    };
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

      const elapsed = audio.currentTime / audio.duration;
      const nextVisibleCount = revealThresholds.reduce(
          (count, threshold) => count + (elapsed >= threshold ? 1 : 0),
          0,
      );
      setVisibleElements((previous) => Math.max(previous, nextVisibleCount));
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setVisibleElements(activeInstructions.length);
      setHasFinished(true);
    };
    const handleError = () => {
      setIsPlaying(false);
      setVisibleElements(activeInstructions.length);
      setHasFinished(true);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // CUSTOM TOAST CONTENT
    const CustomToast = () => (
        <div className="flex items-center gap-3 rtl" dir="rtl">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2dd4bf]/20 border border-[#2dd4bf]/40 animate-pulse">
            <SoundOutlined style={{ color: '#2dd4bf', fontSize: '20px' }} />
          </div>
          <div className="flex flex-col">
            <span className="text-[#f1f5f9] font-bold text-sm">آماده‌اید؟</span>
            <span className="text-slate-300 text-xs">برای شنیدن توضیحات دکمه پخش صدا را بزنید.</span>
          </div>
        </div>
    );

    // Show Persistent Toast on Mount (Top-Right)
    toastId.current = toast(
        <CustomToast />,
        {
          theme: "dark",
          autoClose: false,
          closeOnClick: false,
          draggable: false,
          closeButton: false, // Remove default X button for cleaner look
          position: "top-right",
          className: "custom-toast-container",
          toastId: "instruction-toast"
        }
    );

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      if(toastId.current) toast.dismiss(toastId.current);
    };
  }, [activeAudioSrc, activeInstructions, currentPhase, revealThresholds]);


  // Toggle Play / Start
  const handleTogglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
      toast.dismiss("instruction-toast");
    } catch (error) {
      setIsPlaying(false);
      console.error("Audio play error", error);
    }
  };


  const showToast = (msg, type = 'info') => {
    toast(msg, {
      type: type,
      theme: "dark",
      transition: Slide,
      style: {
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid #2dd4bf',
        color: '#e2e8f0',
        fontFamily: 'inherit'
      },
      progressStyle: { background: '#2dd4bf' }
    });
  };

  const handleNavigate = async () => {
    if (navigationInFlightRef.current) return;
    navigationInFlightRef.current = true;

    if (audioRef.current) audioRef.current.pause();

    setIsLoading(true);
    try {
      const token = localStorage.getItem('authToken');

      if (!token || !phaseHasInstructions(currentPhase)) {
        throw new Error('The instruction flow is missing a valid session.');
      }

      if (phaseUsesMoodInstructions(currentPhase)) {
        await findValidSession(token);
      } else if (!localStorage.getItem('currentSessionID')) {
        throw new Error('The phase 1 session is missing.');
      }

      localStorage.setItem('currentState', 'Exam');
      navigate(APP_ROUTE.TRIAL, { replace: true });
    } catch (error) {
      console.error(error);
      showToast("خطا در ارتباط با سرور", "error");
    } finally {
      navigationInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  if (!phaseHasInstructions(currentPhase)) {
    return null;
  }

  return (
      <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorPrimary: '#2dd4bf',
              fontFamily: "'Vazirmatn', 'Inter', sans-serif",
            },
          }}
      >
        <div style={styles.backgroundWrapper}>
          <ToastContainer position="top-right" newestOnTop rtl={true} />

          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[30%] w-[50vw] h-[50vw] rounded-full bg-[#14b8a6] opacity-10 blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[30%] w-[40vw] h-[40vw] rounded-full bg-[#3b82f6] opacity-10 blur-[120px]"></div>
          </div>

          <div style={styles.glassCard}>

            {/* Header Area */}
            <div className="relative w-full flex justify-center items-center mb-6">

              {/* Audio Player Button */}
              <button
                  type="button"
                  aria-label={isPlaying ? 'توقف پخش صدا' : 'پخش صدا'}
                  aria-pressed={isPlaying}
                  style={styles.audioPlayer}
                  onClick={handleTogglePlay}
                  className={`group transition-all duration-300 ${!hasStarted ? 'animate-pulse border-[#2dd4bf] shadow-[0_0_15px_rgba(45,212,191,0.3)]' : 'hover:bg-[#2dd4bf]/20'}`}
              >
                {isPlaying ? (
                    <>
                      <div className="flex gap-[3px] items-end h-[16px] mx-1">
                        <div className="w-[3px] bg-[#2dd4bf] animate-[sound-wave_1s_infinite] h-[40%]"></div>
                        <div className="w-[3px] bg-[#2dd4bf] animate-[sound-wave_1.2s_infinite] h-[100%]"></div>
                        <div className="w-[3px] bg-[#2dd4bf] animate-[sound-wave_0.8s_infinite] h-[60%]"></div>
                      </div>
                      <PauseCircleOutlined style={{ fontSize: 20, color: '#2dd4bf' }} />
                    </>
                ) : (
                    <>
                        <span className={`text-xs pl-1 transition-colors ${!hasStarted ? 'text-[#2dd4bf] font-bold' : 'text-slate-400 group-hover:text-slate-200'}`}>
                            {hasStarted ? 'پخش' : 'پخش صدا'}
                        </span>
                      <PlayCircleOutlined style={{ fontSize: 20, color: hasStarted ? '#94a3b8' : '#2dd4bf' }} className="transition-colors" />
                    </>
                )}
              </button>

              {/* Centered Title */}
              <div className="text-center">
                <div style={styles.iconWrapper}>
                  <InfoCircleOutlined style={{ fontSize: 20, color: '#2dd4bf' }} />
                </div>
                <Title level={4} style={{ margin: 0, color: '#f1f5f9', fontWeight: 600 }}>
                  راهنمای آزمون
                </Title>
              </div>
            </div>

            <div style={styles.contentContainer} className="custom-scrollbar" dir="rtl">
              <div className="space-y-5 pb-4">
                {activeInstructions.map((text, index) => (
                    <div
                        key={index}
                        className={`
                            flex items-start gap-4
                            ${index < visibleElements ? 'instruction-reveal' : 'opacity-0 translate-y-4 blur-sm'}
                        `}
                        style={{ animationPlayState: isPlaying || hasFinished ? 'running' : 'paused' }}
                    >
                      <div className="mt-1 min-w-[24px] text-[#2dd4bf] text-xl flex justify-center">
                        {activeIcons[index] || <CheckCircleOutlined />}
                      </div>

                      <p className="text-[16px] md:text-[18px] text-slate-200 leading-8 m-0 text-justify font-light">
                        {text}
                      </p>
                    </div>
                ))}
              </div>
            </div>

            <div style={{ flexShrink: 0 }}>
              <Button
                  type="primary"
                  block
                  size="large"
                  disabled={!hasFinished}
                  loading={isLoading}
                  onClick={handleNavigate}
                  style={{
                    ...styles.submitButton,
                    opacity: hasFinished ? 1 : 0.6,
                    cursor: hasFinished ? 'pointer' : 'not-allowed',
                    transition: 'all 0.5s ease'
                  }}
                  icon={!isLoading && <ArrowLeftOutlined />}
              >
                {isLoading ? 'در حال آماده‌سازی...' : 'شروع آزمون'}
              </Button>
            </div>
          </div>

          <div style={styles.footer}>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <BankOutlined style={{ color: '#2dd4bf' }} />
              <span>دانشگاه خوارزمی</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
              <ExperimentOutlined style={{ color: '#2dd4bf' }} />
              <span>بنیاد ملی علم</span>
            </div>
          </div>

          <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 0px; background: transparent; }
            .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            
            /* BEAUTIFUL TOAST STYLES */
            .custom-toast-container {
                background: rgba(15, 23, 42, 0.85) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                border: 1px solid rgba(45, 212, 191, 0.4) !important;
                border-radius: 16px !important;
                box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(45, 212, 191, 0.15) !important;
                padding: 12px 16px !important;
                margin-top: 10px !important;
                min-width: 320px !important;
            }
            
            /* Override standard toast body to allow flexbox layout */
            .Toastify__toast-body {
                padding: 0 !important;
                margin: 0 !important;
            }

            @keyframes sound-wave {
              0%, 100% { height: 30%; }
              50% { height: 100%; }
            }
            .instruction-reveal {
              animation: instruction-reveal 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }
            @keyframes instruction-reveal {
              from { opacity: 0; transform: translateY(16px); filter: blur(4px); }
              to { opacity: 1; transform: translateY(0); filter: blur(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .instruction-reveal { animation-duration: 1ms; }
            }
          `}</style>
        </div>
      </ConfigProvider>
  );
};

export default InstructionsScreen;
