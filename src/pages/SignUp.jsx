import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import {
    CheckCircleOutlined,
    ExperimentOutlined,
    SafetyCertificateOutlined,
    TableOutlined,
} from '@ant-design/icons';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import ProgressiveForm from '../components/ProgressiveForm .jsx';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { APP_ROUTE } from '../utils/phaseFlow.js';

const SignUp = () => {
    const reduceMotion = useReducedMotion();
    const enterTransition = reduceMotion
        ? { duration: 0 }
        : { duration: 0.5, ease: [0.22, 1, 0.36, 1] };

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousDocumentOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousDocumentOverflow;
        };
    }, []);

    return (
        <ConfigProvider
            direction="rtl"
            locale={faIR}
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    borderRadius: 14,
                    fontFamily: "'Vazirmatn', sans-serif",
                },
            }}
        >
            <main
                dir="rtl"
                className="signup-page relative h-[100dvh] w-full overflow-hidden bg-[#020617] text-slate-100"
                style={{
                    background: 'radial-gradient(circle at 12% 16%, #164e63 0%, #0f172a 42%, #020617 100%)',
                    overscrollBehavior: 'none',
                }}
            >
                <div
                    className="pointer-events-none fixed inset-0 opacity-[0.075]"
                    style={{
                        backgroundImage: 'radial-gradient(#5eead4 1px, transparent 1px)',
                        backgroundSize: '34px 34px',
                    }}
                />
                <div className="pointer-events-none fixed -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-teal-400/10 blur-[140px]" />
                <div className="pointer-events-none fixed -bottom-52 -left-40 h-[32rem] w-[32rem] rounded-full bg-blue-500/10 blur-[150px]" />
                <div className="pointer-events-none absolute left-[7%] top-[19%] h-20 w-20 rounded-full border border-teal-300/10" />
                <div className="pointer-events-none absolute bottom-[16%] right-[8%] h-3 w-3 rounded-full bg-cyan-300/40 shadow-[0_0_24px_rgba(103,232,249,.8)]" />

                <div className="signup-shell relative z-10 mx-auto flex h-full w-full max-w-[1380px] flex-col px-4 py-3 sm:px-7 lg:px-10">
                    <header className="signup-header flex shrink-0 items-center" aria-label="سربرگ سامانه">
                        <Motion.div
                            initial={reduceMotion ? false : { opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={enterTransition}
                            className="signup-brand flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-1.5 shadow-xl shadow-black/10 backdrop-blur-xl sm:gap-4 sm:px-4"
                        >
                            <img
                                src={mainlogo}
                                alt="نشان دانشگاه خوارزمی"
                                className="h-9 w-auto object-contain drop-shadow-lg sm:h-11"
                            />
                            <div className="h-8 w-px bg-white/10 sm:h-10" />
                            <img
                                src={infs}
                                alt="نشان بنیاد ملی علم ایران"
                                className="h-9 w-auto object-contain drop-shadow-lg sm:h-11"
                            />
                            <div className="hidden border-r border-teal-300/20 pr-4 md:block">
                                <div className="text-sm font-extrabold text-white">سامانه آزمون هوشمند</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">دانشگاه خوارزمی</div>
                            </div>
                        </Motion.div>
                    </header>

                    <section className="signup-content grid min-h-0 flex-1 items-center gap-5 py-2 lg:grid-cols-[0.82fr_1.08fr] lg:gap-12">
                        <Motion.section
                            initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.08 }}
                            className="signup-hero order-2 hidden w-full max-w-lg lg:block"
                            aria-labelledby="signup-hero-title"
                        >
                            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3.5 py-1.5 text-xs font-bold text-teal-200">
                                <ExperimentOutlined aria-hidden="true" />
                                سامانه پژوهشی دانشگاه خوارزمی
                            </div>

                            <h1
                                id="signup-hero-title"
                                className="signup-hero-title mt-4 text-4xl font-black leading-[1.28] text-white xl:text-5xl"
                            >
                                آغاز یک تجربه
                                <span className="mt-1 block bg-gradient-to-l from-teal-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                                    دقیق و هوشمند
                                </span>
                            </h1>

                            <p className="signup-hero-copy mt-4 max-w-lg text-base leading-7 text-slate-300">
                                اطلاعات خواسته‌شده را با دقت وارد کنید. راهنمای مراحل مربوط، درست در زمان مناسب نمایش داده خواهد شد.
                            </p>

                            <Motion.div
                                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.2 }}
                                className="signup-security-card mt-5 flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5 backdrop-blur-lg"
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-300/10 text-xl text-teal-300">
                                    <SafetyCertificateOutlined aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-extrabold text-slate-100">ثبت امن اطلاعات</h2>
                                    <p className="mt-0.5 text-xs leading-5 text-slate-400">
                                        اطلاعات شما فقط برای اجرای آزمون استفاده می‌شود.
                                    </p>
                                </div>
                            </Motion.div>

                            <div className="signup-guide-note mt-4 flex items-center gap-2 text-xs leading-6 text-slate-400">
                                <CheckCircleOutlined aria-hidden="true" className="text-teal-300" />
                                پیش از مراحل دارای راهنما، زمان کافی برای مطالعه خواهید داشت.
                            </div>
                        </Motion.section>

                        <Motion.section
                            initial={reduceMotion ? false : { opacity: 0, x: -24, scale: 0.985 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.12 }}
                            className="relative order-1 mx-auto flex max-h-full w-full max-w-[525px] items-center"
                            aria-label="فرم ثبت‌نام شرکت‌کننده"
                        >
                            <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal-400/10 via-transparent to-blue-500/10 blur-2xl" />
                            <ProgressiveForm />
                        </Motion.section>
                    </section>

                    <footer className="signup-footer flex shrink-0 items-center justify-center border-t border-white/[0.06] py-1.5 sm:justify-between">
                        <div className="hidden items-center gap-3 text-[11px] text-slate-500 sm:flex">
                            <span>دانشگاه خوارزمی</span>
                            <span className="h-1 w-1 rounded-full bg-teal-400/50" />
                            <span>بنیاد ملی علم ایران</span>
                        </div>

                        <Link
                            to={APP_ROUTE.RESULTS}
                            aria-label="مشاهده نتایج شرکت‌کنندگان"
                            className="signup-results-link inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3.5 text-xs font-bold text-slate-300 backdrop-blur-lg transition-all duration-300"
                        >
                            <TableOutlined aria-hidden="true" className="text-teal-300" />
                            مشاهده نتایج
                        </Link>
                    </footer>
                </div>

                <style>{`
                    .signup-results-link:hover,
                    .signup-results-link:focus-visible {
                        color: #ffffff !important;
                        border-color: rgba(94, 234, 212, 0.55) !important;
                        background: rgba(13, 148, 136, 0.16) !important;
                        box-shadow: 0 8px 24px rgba(13, 148, 136, 0.14);
                        transform: translateY(-1px);
                        outline: none;
                    }
                    @media (max-height: 700px) {
                        .signup-shell { padding-top: 8px; padding-bottom: 8px; }
                        .signup-brand { padding-top: 4px; padding-bottom: 4px; }
                        .signup-brand img { height: 34px; }
                        .signup-content { padding-top: 2px; padding-bottom: 2px; }
                        .signup-hero-title { margin-top: 10px; font-size: 2.25rem; }
                        .signup-hero-copy { margin-top: 8px; line-height: 1.55; }
                        .signup-security-card { margin-top: 10px; }
                        .signup-guide-note { margin-top: 8px; }
                        .signup-footer { padding-top: 3px; padding-bottom: 3px; }
                    }
                    @media (max-height: 590px) {
                        .signup-hero-copy,
                        .signup-guide-note { display: none; }
                        .signup-security-card { margin-top: 8px; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .signup-results-link { transition: none !important; }
                    }
                `}</style>
            </main>
        </ConfigProvider>
    );
};

export default SignUp;
