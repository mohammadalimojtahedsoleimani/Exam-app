import React from 'react';
import { ConfigProvider, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { ArrowLeftOutlined, BarChartOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import ProgressiveForm from '../components/ProgressiveForm.jsx';
import FullscreenButton from '../components/FullscreenButton.jsx';
import SignUpBackground from '../components/SignUpBackground.jsx';
import { useFullscreenPromptPause } from '../context/fullscreenContext.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { APP_ROUTE } from '../utils/phaseFlow.js';
import './SignUp.css';

// Both variants are built once at module scope: antd regenerates its whole
// style cache whenever the theme object identity changes.
const buildTheme = (reduceMotion) => ({
    algorithm: theme.darkAlgorithm,
    token: {
        colorPrimary: '#e4e7ec',
        colorInfo: '#c5cbd5',
        colorSuccess: '#2dd4bf',
        colorWarning: '#fbbf24',
        colorError: '#fb7185',
        colorBgBase: '#090a0d',
        colorTextBase: '#f5f5f7',
        borderRadius: 14,
        controlHeightLG: 48,
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
        motion: !reduceMotion,
    },
    components: {
        Button: { fontWeight: 700, primaryShadow: 'none' },
        Input: {
            activeBorderColor: '#d4d8e0',
            activeShadow: '0 0 0 3px rgba(228, 231, 236, 0.12)',
            hoverBorderColor: 'rgba(255, 255, 255, 0.35)',
        },
        InputNumber: {
            activeBorderColor: '#d4d8e0',
            activeShadow: '0 0 0 3px rgba(228, 231, 236, 0.12)',
            hoverBorderColor: 'rgba(255, 255, 255, 0.35)',
        },
        Radio: {
            buttonBg: 'transparent',
            buttonCheckedBg: 'transparent',
            buttonSolidCheckedBg: 'transparent',
            buttonSolidCheckedHoverBg: 'transparent',
            buttonSolidCheckedActiveBg: 'transparent',
        },
    },
});

const SIGNUP_THEME = buildTheme(false);
const SIGNUP_THEME_REDUCED = buildTheme(true);

const SignUp = () => {
    const reduceMotion = usePrefersReducedMotion();

    // The header already exposes a fullscreen control, so the floating restore
    // chip would only duplicate it here.
    useFullscreenPromptPause();

    return (
        <ConfigProvider
            direction="rtl"
            locale={faIR}
            componentSize="large"
            theme={reduceMotion ? SIGNUP_THEME_REDUCED : SIGNUP_THEME}
        >
            <main dir="rtl" lang="fa" className="signup-page">
                <SignUpBackground />
                <div className="signup-shell">
                    <header className="signup-topbar" aria-label="سربرگ سامانه">
                        <div className="signup-brand">
                            <span className="signup-brand__unit">
                                <img
                                    className="signup-brand__logo"
                                    src={mainlogo}
                                    alt="دانشگاه خوارزمی"
                                    width="30"
                                    height="42"
                                    decoding="async"
                                />
                                <span className="signup-brand__copy">
                                    <strong>سامانه پژوهشی</strong>
                                    <span>دانشگاه خوارزمی</span>
                                </span>
                            </span>

                            <span className="signup-brand__divider" aria-hidden="true" />

                            <span className="signup-brand__unit">
                                <img
                                    className="signup-brand__logo signup-brand__logo--wide"
                                    src={infs}
                                    alt="بنیاد ملی علم ایران"
                                    width="50"
                                    height="42"
                                    decoding="async"
                                />
                                <span className="signup-brand__copy">
                                    <strong>بنیاد ملی علم ایران</strong>
                                </span>
                            </span>
                        </div>

                        <div className="signup-topbar__actions">
                            <span className="signup-status" role="status">
                                <span className="signup-status__dot" aria-hidden="true" />
                                <span className="signup-status__label">سامانه فعال است</span>
                            </span>

                            <FullscreenButton
                                mode="toggle"
                                variant="chip"
                                className="signup-fullscreen"
                            />

                            <Link
                                to={APP_ROUTE.RESULTS}
                                className="signup-results-link"
                                aria-label="مشاهده نتایج پژوهش"
                            >
                                <BarChartOutlined aria-hidden="true" />
                                <span className="signup-results-link__label">نتایج</span>
                            </Link>
                        </div>
                    </header>

                    <div className="signup-stage">
                        <section className="signup-intro" aria-labelledby="signup-title">
                            <p className="signup-intro__eyebrow">
                                <ExperimentOutlined aria-hidden="true" />
                                به سامانه پژوهشی خوش آمدید
                            </p>
                            <h1 id="signup-title">
                                شناخت بیشتر،
                                <span>با همراهی شما.</span>
                            </h1>
                            <p className="signup-intro__description">
                                هر تجربه، گامی به سوی شناخت است.
                                <br />
                                اطلاعات خود را ثبت کنید و وارد راهنمای آزمون شوید.
                            </p>
                            <div className="signup-intro__journey" aria-label="مسیر شرکت در پژوهش">
                                <span className="signup-intro__current">ثبت اطلاعات</span>
                                <ArrowLeftOutlined aria-hidden="true" />
                                <span>راهنمای آزمون</span>
                                <ArrowLeftOutlined aria-hidden="true" />
                                <span>شروع آزمون</span>
                            </div>
                        </section>
                        <ProgressiveForm />
                    </div>

                    <footer className="signup-footer">
                        <span>دانشگاه خوارزمی <span aria-hidden="true">·</span> بنیاد ملی علم ایران</span>
                        <span className="signup-footer__detail">سامانه ثبت‌نام و اجرای آزمون</span>
                    </footer>
                </div>
            </main>
        </ConfigProvider>
    );
};

export default SignUp;
