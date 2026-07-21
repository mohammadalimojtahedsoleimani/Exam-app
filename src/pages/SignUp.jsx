import React from 'react';
import { ConfigProvider, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import {
    AimOutlined,
    BarChartOutlined,
    BookOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    ExperimentOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import ProgressiveForm from '../components/ProgressiveForm.jsx';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { APP_ROUTE } from '../utils/phaseFlow.js';
import './SignUp.css';

const confidenceItems = [
    {
        icon: BookOutlined,
        title: 'راهنمای مرحله‌به‌مرحله',
        description: 'پیش از هر بخش، توضیحات لازم را دریافت می‌کنید.',
    },
    {
        icon: SafetyCertificateOutlined,
        title: 'استفاده پژوهشی از اطلاعات',
        description: 'داده‌ها در چارچوب همین فرایند پژوهشی استفاده می‌شوند.',
    },
    {
        icon: ClockCircleOutlined,
        title: 'شروع با مرحله تمرینی',
        description: 'ابتدا با روند پاسخ‌گویی آشنا می‌شوید.',
    },
];

const SignUp = () => {
    const reduceMotion = useReducedMotion();
    const enterTransition = reduceMotion
        ? { duration: 0 }
        : { duration: 0.42, ease: [0.22, 1, 0.36, 1] };

    return (
        <ConfigProvider
            direction="rtl"
            locale={faIR}
            componentSize="large"
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    colorInfo: '#38bdf8',
                    colorSuccess: '#2dd4bf',
                    colorWarning: '#fbbf24',
                    colorError: '#fb7185',
                    colorBgBase: '#020617',
                    colorTextBase: '#f8fafc',
                    borderRadius: 14,
                    controlHeightLG: 50,
                    fontFamily: "'Vazirmatn', Tahoma, sans-serif",
                    motion: !reduceMotion,
                },
                components: {
                    Button: {
                        fontWeight: 800,
                        primaryShadow: '0 14px 34px rgba(8, 145, 178, 0.22)',
                    },
                    Input: {
                        activeBorderColor: '#2dd4bf',
                        activeShadow: '0 0 0 3px rgba(45, 212, 191, 0.13)',
                        hoverBorderColor: '#5eead4',
                    },
                    InputNumber: {
                        activeBorderColor: '#2dd4bf',
                        activeShadow: '0 0 0 3px rgba(45, 212, 191, 0.13)',
                        hoverBorderColor: '#5eead4',
                    },
                    Select: {
                        activeBorderColor: '#2dd4bf',
                        activeOutlineColor: 'rgba(45, 212, 191, 0.13)',
                        hoverBorderColor: '#5eead4',
                    },
                },
            }}
        >
            <main dir="rtl" className="signup-page">
                <a className="signup-skip-link" href="#participant-registration">
                    پرش به فرم ثبت‌نام
                </a>

                <div className="signup-backdrop" aria-hidden="true">
                    <span className="signup-backdrop__grid" />
                    <span className="signup-backdrop__glow signup-backdrop__glow--teal" />
                    <span className="signup-backdrop__glow signup-backdrop__glow--blue" />
                    <span className="signup-backdrop__beam" />
                    <span className="signup-backdrop__dot signup-backdrop__dot--one" />
                    <span className="signup-backdrop__dot signup-backdrop__dot--two" />
                </div>

                <div className="signup-shell">
                    <Motion.header
                        className="signup-topbar"
                        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={enterTransition}
                        aria-label="سربرگ سامانه"
                    >
                        <div className="signup-brand">
                            <span className="signup-brand__mark">
                                <img src={mainlogo} alt="" />
                            </span>
                            <span className="signup-brand__copy">
                                <strong>سامانه آزمون پژوهشی</strong>
                                <span>دانشگاه خوارزمی</span>
                            </span>
                            <span className="signup-brand__divider" aria-hidden="true" />
                            <span className="signup-brand__partner">
                                <span className="signup-brand__partner-mark">
                                    <img src={infs} alt="" />
                                </span>
                                <span>
                                    <small>با حمایت</small>
                                    بنیاد ملی علم ایران
                                </span>
                            </span>
                        </div>

                        <Link
                            to={APP_ROUTE.RESULTS}
                            className="signup-results-link"
                            aria-label="مشاهده نتایج پژوهش"
                        >
                            <BarChartOutlined aria-hidden="true" />
                            <span className="signup-results-link__label">نتایج</span>
                        </Link>
                    </Motion.header>

                    <div className="signup-main-grid">
                        <Motion.section
                            className="signup-hero"
                            initial={reduceMotion ? false : { opacity: 0, x: 28 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.08 }}
                            aria-labelledby="signup-hero-title"
                        >
                            <div className="signup-orbit" aria-hidden="true">
                                <span className="signup-orbit__ring signup-orbit__ring--outer" />
                                <span className="signup-orbit__ring signup-orbit__ring--inner" />
                                <span className="signup-orbit__axis" />
                                <span className="signup-orbit__core"><AimOutlined /></span>
                            </div>

                            <div className="signup-hero__content">
                                <span className="signup-hero__eyebrow">
                                    <ExperimentOutlined aria-hidden="true" />
                                    سامانه پژوهشی دانشگاه خوارزمی
                                </span>

                                <h1 id="signup-hero-title">
                                    آغاز آزمون، با مسیری
                                    <span> روشن و مرحله‌به‌مرحله</span>
                                </h1>

                                <p className="signup-hero__copy">
                                    اطلاعات اولیه را وارد کنید. راهنمای هر مرحله پیش از شروع نمایش داده می‌شود تا با آرامش و تمرکز مسیر آزمون را دنبال کنید.
                                </p>

                                <div className="signup-confidence-list" aria-label="ویژگی‌های فرایند آزمون">
                                    {confidenceItems.map((item) => {
                                        const ConfidenceIcon = item.icon;

                                        return (
                                            <article className="signup-confidence-item" key={item.title}>
                                                <span className="signup-confidence-item__icon" aria-hidden="true">
                                                    <ConfidenceIcon />
                                                </span>
                                                <span>
                                                    <strong>{item.title}</strong>
                                                    <small>{item.description}</small>
                                                </span>
                                            </article>
                                        );
                                    })}
                                </div>

                                <Motion.div
                                    className="signup-journey"
                                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.2 }}
                                >
                                    <span className="signup-journey__icon" aria-hidden="true">
                                        <CheckCircleFilled />
                                    </span>
                                    <span className="signup-journey__copy">
                                        <strong>فرایند هدایت‌شده</strong>
                                        <small>پس از ثبت اطلاعات، مستقیماً وارد راهنمای مرحله تمرینی می‌شوید.</small>
                                    </span>
                                </Motion.div>
                            </div>
                        </Motion.section>

                        <Motion.section
                            id="participant-registration"
                            className="signup-form-stage"
                            initial={reduceMotion ? false : { opacity: 0, x: -28, scale: 0.985 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.12 }}
                            aria-labelledby="registration-form-title"
                            tabIndex={-1}
                        >
                            <span className="signup-form-stage__halo" aria-hidden="true" />
                            <ProgressiveForm />
                        </Motion.section>
                    </div>

                    <footer className="signup-footer">
                        <span>پروتکل پژوهشی دانشگاه خوارزمی</span>
                        <span className="signup-footer__separator" aria-hidden="true" />
                        <span>با حمایت بنیاد ملی علم ایران</span>
                    </footer>
                </div>
            </main>
        </ConfigProvider>
    );
};

export default SignUp;
