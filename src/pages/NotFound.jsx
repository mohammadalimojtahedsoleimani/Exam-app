import React from 'react';
import { ConfigProvider, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { Link } from 'react-router-dom';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import {
    ArrowLeftOutlined,
    BankOutlined,
    BarChartOutlined,
    CompassOutlined,
    ExperimentOutlined,
    HomeOutlined,
    LinkOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { useLockedViewport } from '../hooks/useLockedViewport.js';
import { APP_ROUTE } from '../utils/phaseFlow.js';
import './NotFound.css';

const recoverySteps = [
    {
        icon: LinkOutlined,
        title: 'نشانی صفحه را بررسی کنید',
        description: 'ممکن است بخشی از آدرس هنگام کپی جا افتاده باشد.',
    },
    {
        icon: ReloadOutlined,
        title: 'صفحه را دوباره باز کنید',
        description: 'گاهی یک بار تازه‌سازی، مشکل را برطرف می‌کند.',
    },
    {
        icon: SafetyCertificateOutlined,
        title: 'از مسیر اصلی وارد شوید',
        description: 'برای شروع آزمون به صفحه ثبت‌نام بازگردید.',
    },
];

const NotFound = () => {
    const reduceMotion = useReducedMotion();

    // Single-screen layout: never let the document scroll.
    useLockedViewport();

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
                    colorBgBase: '#020617',
                    colorTextBase: '#f8fafc',
                    borderRadius: 14,
                    fontFamily: "'Vazirmatn', Tahoma, sans-serif",
                    motion: !reduceMotion,
                },
            }}
        >
            <main dir="rtl" className="nf-page">
                <div className="nf-backdrop" aria-hidden="true">
                    <span className="nf-backdrop__grid" />
                    <span className="nf-backdrop__aurora" />
                    <span className="nf-backdrop__glow nf-backdrop__glow--teal" />
                    <span className="nf-backdrop__glow nf-backdrop__glow--blue" />
                    <span className="nf-backdrop__beam" />
                    <span className="nf-backdrop__dot nf-backdrop__dot--one" />
                    <span className="nf-backdrop__dot nf-backdrop__dot--two" />
                </div>

                <div className="nf-shell">
                    <Motion.header
                        className="nf-topbar"
                        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={enterTransition}
                        aria-label="سربرگ سامانه"
                    >
                        <div className="nf-brand">
                            <span className="nf-brand__mark">
                                <img src={mainlogo} alt="" />
                            </span>
                            <span className="nf-brand__copy">
                                <strong>سامانه آزمون پژوهشی</strong>
                                <span>دانشگاه خوارزمی</span>
                            </span>
                        </div>

                        <span className="nf-code-pill">
                            <span className="nf-code-pill__dot" aria-hidden="true" />
                            کد خطا ۴۰۴
                        </span>
                    </Motion.header>

                    <Motion.section
                        className="nf-card"
                        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.08 }}
                        aria-labelledby="nf-title"
                    >
                        <span className="nf-card__sheen" aria-hidden="true" />
                        <span className="nf-card__halo" aria-hidden="true" />

                        <Motion.div
                            className="nf-emblem"
                            aria-hidden="true"
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={reduceMotion
                                ? { duration: 0 }
                                : { delay: 0.18, type: 'spring', stiffness: 190, damping: 16 }}
                        >
                            <span className="nf-emblem__ring nf-emblem__ring--outer">
                                <span className="nf-emblem__satellite" />
                            </span>
                            <span className="nf-emblem__ring nf-emblem__ring--inner">
                                <span className="nf-emblem__satellite nf-emblem__satellite--blue" />
                            </span>
                            <span className="nf-emblem__core">
                                <CompassOutlined />
                            </span>
                        </Motion.div>

                        <p className="nf-code" aria-hidden="true">404</p>

                        <h1 id="nf-title">صفحه مورد نظر پیدا نشد</h1>
                        <p className="nf-lead">
                            نشانی واردشده معتبر نیست یا این صفحه دیگر در دسترس نمی‌باشد. از گزینه‌های زیر مسیر خود را ادامه دهید.
                        </p>

                        <div className="nf-actions">
                            <Link to={APP_ROUTE.SIGN_UP} className="nf-button nf-button--primary">
                                <HomeOutlined aria-hidden="true" />
                                <span>بازگشت به صفحه اصلی</span>
                                <ArrowLeftOutlined className="nf-button__arrow" aria-hidden="true" />
                            </Link>
                            <Link to={APP_ROUTE.RESULTS} className="nf-button nf-button--ghost">
                                <BarChartOutlined aria-hidden="true" />
                                <span>مشاهده نتایج پژوهش</span>
                            </Link>
                        </div>

                        <ul className="nf-steps" aria-label="راه‌های ادامه مسیر">
                            {recoverySteps.map((step, index) => {
                                const StepIcon = step.icon;

                                return (
                                    <Motion.li
                                        className="nf-step"
                                        key={step.title}
                                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                            ...enterTransition,
                                            delay: reduceMotion ? 0 : 0.3 + index * 0.07,
                                        }}
                                    >
                                        <span className="nf-step__icon" aria-hidden="true">
                                            <StepIcon />
                                        </span>
                                        <span className="nf-step__copy">
                                            <strong>{step.title}</strong>
                                            <small>{step.description}</small>
                                        </span>
                                    </Motion.li>
                                );
                            })}
                        </ul>
                    </Motion.section>

                    <footer className="nf-footer">
                        <span className="nf-footer__chip">
                            <BankOutlined aria-hidden="true" />
                            دانشگاه خوارزمی
                        </span>
                        <span className="nf-footer__separator" aria-hidden="true" />
                        <span className="nf-footer__chip">
                            <span className="nf-footer__chip-mark" aria-hidden="true">
                                <img src={infs} alt="" />
                            </span>
                            بنیاد ملی علم ایران
                        </span>
                        <span className="nf-footer__separator" aria-hidden="true" />
                        <span className="nf-footer__chip">
                            <ExperimentOutlined aria-hidden="true" />
                            پروتکل پژوهشی
                        </span>
                    </footer>
                </div>
            </main>
        </ConfigProvider>
    );
};

export default NotFound;
