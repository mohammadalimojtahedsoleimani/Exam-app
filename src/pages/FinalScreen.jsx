import React from 'react';
import { Button, ConfigProvider, theme } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Home } from 'lucide-react';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { BankOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { logout } from '../redux/authSlice.js';
import FullscreenButton from '../components/FullscreenButton.jsx';
import { useFullscreen, useFullscreenPromptPause } from '../context/fullscreenContext.js';
import { useLockedViewport } from '../hooks/useLockedViewport.js';
import { APP_ROUTE, PROBE_STORAGE_KEYS } from '../utils/phaseFlow.js';
import './FinalScreen.css';

const FinalScreen = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const reduceMotion = useReducedMotion();
    const { releaseFullscreenIntent } = useFullscreen();

    // This screen is a fixed viewport card and owns its own fullscreen control.
    useLockedViewport();
    useFullscreenPromptPause();

    const handleFinish = () => {
        PROBE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        // The session is over: stop asking the participant to restore fullscreen.
        releaseFullscreenIntent();
        dispatch(logout());
        navigate(APP_ROUTE.SIGN_UP, { replace: true });
    };

    const enterTransition = reduceMotion
        ? { duration: 0 }
        : { duration: 0.6, ease: [0.22, 1, 0.36, 1] };

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    fontFamily: "'Vazirmatn', sans-serif",
                    motion: !reduceMotion,
                },
            }}
        >
            <main dir="rtl" className="final-page">
                <div className="final-backdrop" aria-hidden="true">
                    <span className="final-backdrop__grid" />
                    <span className="final-backdrop__glow final-backdrop__glow--teal" />
                    <span className="final-backdrop__glow final-backdrop__glow--blue" />
                    <span className="final-backdrop__glow final-backdrop__glow--center" />
                </div>

                <div className="final-shell">
                    <Motion.section
                        className="final-card"
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={enterTransition}
                        aria-labelledby="final-title"
                    >
                        <span className="final-card__sheen" aria-hidden="true" />

                        <Motion.div
                            className="final-emblem"
                            aria-hidden="true"
                            initial={reduceMotion ? false : { scale: 0, rotate: -15 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={reduceMotion
                                ? { duration: 0 }
                                : { delay: 0.25, type: 'spring', stiffness: 180, damping: 14 }}
                        >
                            <Motion.span
                                className="final-emblem__halo"
                                animate={reduceMotion ? undefined : { opacity: [0.15, 0.35, 0.15], scale: [1, 1.08, 1] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <Motion.span
                                className="final-emblem__ring"
                                animate={reduceMotion ? undefined : { opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                            />
                            <span className="final-emblem__core">
                                <CheckCircle strokeWidth={1.5} />
                            </span>
                        </Motion.div>

                        <Motion.div
                            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.4 }}
                            style={{ width: '100%' }}
                        >
                            <span className="final-badge">
                                <span className="final-badge__dot" aria-hidden="true" />
                                ثبت موفق
                            </span>

                            <h1 id="final-title">آزمون با موفقیت به پایان رسید</h1>

                            <p className="final-lead">
                                از صبر و شکیبایی شما برای انجام این مراحل سپاسگزاریم.
                            </p>

                            <p className="final-note">
                                اطلاعات شما با موفقیت در سامانه ثبت گردید.
                            </p>
                        </Motion.div>

                        <Motion.div
                            className="final-divider"
                            initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
                            animate={{ scaleX: 1, opacity: 1 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.55 }}
                        />

                        <Motion.div
                            className="final-actions"
                            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.6 }}
                        >
                            <Button
                                className="final-action"
                                type="primary"
                                size="large"
                                onClick={handleFinish}
                            >
                                <span>بازگشت به صفحه اصلی</span>
                                <Home className="final-action__icon" aria-hidden="true" />
                            </Button>

                            <FullscreenButton
                                mode="exit"
                                variant="ghost"
                                className="final-fullscreen"
                            />
                        </Motion.div>
                    </Motion.section>

                    <Motion.footer
                        className="final-footer"
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.75 }}
                    >
                        <span className="final-footer__chip">
                            <BankOutlined aria-hidden="true" />
                            دانشگاه خوارزمی
                        </span>

                        <span className="final-footer__separator" aria-hidden="true" />

                        <span className="final-footer__chip">
                            <ExperimentOutlined aria-hidden="true" />
                            بنیاد ملی علم
                        </span>
                    </Motion.footer>
                </div>
            </main>
        </ConfigProvider>
    );
};

export default FinalScreen;
