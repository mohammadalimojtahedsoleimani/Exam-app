import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button, ConfigProvider, theme, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Trophy, XCircle, RotateCcw, ArrowLeft, Banknote, Landmark, GraduationCap } from 'lucide-react';
import { motion as Motion } from 'framer-motion';
import { setPhaseComplete,findValidSession } from "../api/probes.js";
import { BankOutlined, ExperimentOutlined } from '@ant-design/icons'; // AntD Icons for footer
import { APP_ROUTE, PHASE } from "../utils/phaseFlow.js";

const { Title, Text } = Typography;

const Report = () => {
    const [record, setRecord] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [token, setToken] = useState('');
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionError, setTransitionError] = useState('');
    const [loadError, setLoadError] = useState('');
    const hasFetched = useRef(false);
    const transitionInFlightRef = useRef(false);

    const fetchRecord = useCallback(async () => {
        setLoading(true);
        setLoadError('');

        try {
            const userToken = localStorage.getItem('authToken');
            const sessionId = localStorage.getItem('currentSessionID');

            if (!userToken || !sessionId) {
                throw new Error('The phase 1 session is incomplete.');
            }

            setToken(userToken);
            const response = await setPhaseComplete(userToken, sessionId);
            setRecord(response?.data?.mark || 0);
        } catch (error) {
            console.error("Failed to fetch result:", error);
            setLoadError('دریافت نتیجه آزمون انجام نشد. لطفاً دوباره تلاش کنید.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;
        fetchRecord();
    }, [fetchRecord]);


    const isPassed = record >= 88;
    const resultConfig = loadError ? {
        title: "خطا در دریافت نتیجه",
        description: loadError,
        icon: XCircle,
        colorClass: "text-rose-400",
        bgGradient: "from-rose-500/20 to-orange-500/20",
        strokeColor: "#fb7185",
        btnText: "تلاش دوباره",
        btnIcon: <RotateCcw className="w-5 h-5 ml-2" />
    } : isPassed ? {
        title: "تبریک! آزمون با موفقیت انجام شد",
        description: "عملکرد شما عالی بود. می‌توانید به مرحله بعد بروید.",
        icon: Trophy,
        colorClass: "text-[#2dd4bf]", // Teal
        bgGradient: "from-teal-500/20 to-emerald-500/20",
        strokeColor: "#2dd4bf",
        btnText: "مرحله بعدی",
        btnIcon: <ArrowLeft className="w-5 h-5 ml-2" />
    } : {
        title: "نیاز به تلاش مجدد",
        description: "دقت شما کمتر از حد نصاب بود. لطفاً دوباره تلاش کنید.",
        icon: XCircle,
        colorClass: "text-rose-400", // Soft Red
        bgGradient: "from-rose-500/20 to-orange-500/20",
        strokeColor: "#fb7185",
        btnText: "تکرار آزمون",
        btnIcon: <RotateCcw className="w-5 h-5 ml-2" />
    };

    const IconComponent = resultConfig.icon;

    const handleButton = async () => {
        if (loading || transitionInFlightRef.current) return;

        transitionInFlightRef.current = true;
        setIsTransitioning(true);
        setTransitionError('');

        try {
            await findValidSession(token);

            if (isPassed) {
                localStorage.setItem('currentPhase', String(PHASE.BASELINE));
            }

            localStorage.setItem('currentState', 'Exam');
            navigate(APP_ROUTE.TRIAL, { replace: true });
        } catch (error) {
            console.error('Failed to prepare the next session', error);
            setTransitionError('آماده‌سازی مرحله بعد انجام نشد. لطفاً دوباره تلاش کنید.');
        } finally {
            transitionInFlightRef.current = false;
            setIsTransitioning(false);
        }
    };


    const styles = {
        backgroundWrapper: {
            minHeight: '100vh',
            width: '100vw',
            background: 'radial-gradient(circle at 50% 10%, #134e4a 0%, #0f172a 60%, #020617 100%)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily: "'Vazirmatn', sans-serif",
            overflow: 'hidden'
        },
        glassCard: {
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(45, 212, 191, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            borderRadius: '24px',
            padding: '40px',
            width: '100%',
            maxWidth: '500px',
            textAlign: 'center'
        },
        submitButton: {
            height: 55,
            fontSize: '18px',
            fontWeight: 700,
            background: isPassed
                ? 'linear-gradient(135deg, #0f766e 0%, #2dd4bf 100%)' // Teal Gradient
                : 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)', // Red Gradient
            border: 'none',
            boxShadow: isPassed
                ? '0 0 20px rgba(13, 148, 136, 0.3)'
                : '0 0 20px rgba(244, 63, 94, 0.3)',
            width: '100%',
            marginTop: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
        },
        footer: {
            position: 'absolute',
            bottom: '20px',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '13px',
            zIndex: 10
        }
    };

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    fontFamily: "'Vazirmatn', sans-serif",
                },
            }}
        >
            <div style={styles.backgroundWrapper}>

                {/* --- Ambient Glows --- */}
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#14b8a6] opacity-10 blur-[150px] pointer-events-none"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#3b82f6] opacity-10 blur-[150px] pointer-events-none"></div>

                {/* --- Main Content Area --- */}
                <div className="flex-1 flex items-center justify-center p-6 z-10">
                    <Motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        style={styles.glassCard}
                    >


                        <Motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="flex justify-center mb-6"
                        >
                            <div className={`p-5 rounded-full bg-gradient-to-br ${resultConfig.bgGradient} border border-white/5`}>
                                <IconComponent className={`w-12 h-12 ${resultConfig.colorClass}`} strokeWidth={2} />
                            </div>
                        </Motion.div>


                        <Title level={3} style={{ color: '#f8fafc', marginBottom: '5px' }}>
                            {resultConfig.title}
                        </Title>
                        <Text style={{ color: '#94a3b8', fontSize: '15px' }}>
                            {resultConfig.description}
                        </Text>



                        <Motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="relative flex justify-center items-center my-10"
                        >
                            <svg className="transform -rotate-90 w-48 h-48">

                                <circle
                                    cx="50%" cy="50%" r="42%"
                                    stroke="rgba(255,255,255,0.1)"
                                    strokeWidth="8"
                                    fill="none"
                                />

                                <Motion.circle
                                    cx="50%" cy="50%" r="42%"
                                    stroke={resultConfig.strokeColor}
                                    strokeWidth="8"
                                    fill="none"
                                    strokeLinecap="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: loading ? 0 : record / 100 }}
                                    transition={{ delay: 0.6, duration: 1.5, ease: "easeOut" }}
                                    style={{
                                        filter: `drop-shadow(0 0 8px ${resultConfig.strokeColor})`
                                    }}
                                />
                            </svg>


                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <Motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1 }}
                                    className={`text-5xl font-bold tracking-tight ${resultConfig.colorClass}`}
                                >
                                    {Number(record).toFixed(1)}%
                                </Motion.span>
                                <span className="text-slate-500 text-sm mt-1 uppercase tracking-widest font-semibold">
                                    دقت پاسخ
                                </span>
                            </div>
                        </Motion.div>


                        <Button
                            type="primary"
                            size="large"
                            onClick={loadError ? fetchRecord : handleButton}
                            style={styles.submitButton}
                            loading={loading || isTransitioning}
                        >

                            <span>{resultConfig.btnText}</span>
                            {!loading && resultConfig.btnIcon}
                        </Button>

                        {transitionError && (
                            <Text style={{color: '#fca5a5', display: 'block', marginTop: '14px'}}>
                                {transitionError}
                            </Text>
                        )}

                    </Motion.div>
                </div>


                <div style={styles.footer}>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                        <BankOutlined style={{ color: '#2dd4bf' }} />
                        <span>دانشگاه خوارزمی</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/20"></div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                        <ExperimentOutlined style={{ color: '#2dd4bf' }} />
                        <span>بنیاد ملی علم</span>
                    </div>
                </div>

            </div>
        </ConfigProvider>
    );
};

export default Report;
