import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Button, ConfigProvider, theme } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import {
    AimOutlined,
    ArrowLeftOutlined,
    BankOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    ExperimentOutlined,
    FlagFilled,
    LoadingOutlined,
    ReloadOutlined,
    RiseOutlined,
    TrophyFilled,
    WarningFilled,
} from '@ant-design/icons';
import { cssTransition, Slide, toast } from 'react-toastify';
import { setPhaseComplete, findValidSession } from '../api/probes.js';
import mainlogo from '../assets/mainlogo.png';
import infs from '../assets/infs.png';
import { useLockedViewport } from '../hooks/useLockedViewport.js';
import {
    PERSIAN_PERCENT_SIGN,
    formatPersianNumber,
    formatPersianPercentValue,
} from '../utils/persianNumbers.js';
import { APP_ROUTE, PHASE } from '../utils/phaseFlow.js';
import './Report.css';

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';
const REPORT_LOAD_TOAST_ID = 'report-load-feedback';
const REPORT_TRANSITION_TOAST_ID = 'report-transition-feedback';
const PASS_THRESHOLD = 88;
const RING_RADIUS = 86;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const ReducedMotionToastTransition = cssTransition({
    enter: 'report-toast-reduced-motion-enter',
    exit: 'report-toast-reduced-motion-exit',
    collapse: false,
});

const EM_DASH = '—';
const PASS_THRESHOLD_LABEL = formatPersianNumber(PASS_THRESHOLD);

const formatPercent = (value) => formatPersianPercentValue(value);

const ReportToastContent = ({ type, title, message }) => {
    const icons = {
        success: CheckCircleFilled,
        error: CloseCircleFilled,
        warning: WarningFilled,
    };
    const Icon = icons[type] ?? WarningFilled;

    return (
        <div className={`report-toast-content report-toast-content--${type}`} dir="rtl">
            <span className="report-toast-content__icon" aria-hidden="true">
                <Icon />
            </span>
            <span className="report-toast-content__copy">
                <strong>{title}</strong>
                <span>{message}</span>
            </span>
        </div>
    );
};

const showReportToast = ({ toastId, type, title, message, reduceMotion }) => {
    const content = <ReportToastContent type={type} title={title} message={message} />;
    const options = {
        containerId: GLOBAL_TOAST_CONTAINER_ID,
        toastId,
        type,
        transition: reduceMotion ? ReducedMotionToastTransition : Slide,
        theme: 'dark',
        icon: false,
        autoClose: type === 'success' ? 3600 : 5200,
        hideProgressBar: false,
        closeButton: true,
        closeOnClick: true,
        draggable: 'touch',
        className: `app-toast app-toast--${type}`,
        progressClassName: `app-toast__progress app-toast__progress--${type}`,
        role: type === 'success' ? 'status' : 'alert',
        ariaLabel: `${title}؛ ${message}`,
    };

    if (toast.isActive(toastId, GLOBAL_TOAST_CONTAINER_ID)) {
        toast.update(toastId, { ...options, render: content, isLoading: false });
        return;
    }

    toast(content, options);
};

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
    const reduceMotion = useReducedMotion();
    const reduceMotionRef = useRef(reduceMotion);

    // The result card is a single-screen layout; scrolling it is bad UX here.
    useLockedViewport();

    useEffect(() => {
        reduceMotionRef.current = reduceMotion;
    }, [reduceMotion]);

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
            console.error('Failed to fetch result:', error);
            const message = 'دریافت نتیجه آزمون انجام نشد. لطفاً دوباره تلاش کنید.';
            setLoadError(message);
            showReportToast({
                toastId: REPORT_LOAD_TOAST_ID,
                type: 'error',
                title: 'نتیجه آزمون دریافت نشد',
                message,
                reduceMotion: reduceMotionRef.current,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;
        fetchRecord();
    }, [fetchRecord]);

    const isPassed = record >= PASS_THRESHOLD;
    const hasError = Boolean(loadError);
    const safeRecord = Math.min(100, Math.max(0, Number(record) || 0));
    const gapToThreshold = Math.max(0, PASS_THRESHOLD - safeRecord);

    // Until the score arrives, `record` is still 0 — stay neutral rather than
    // rendering the "failed" theme.
    const resultConfig = loading ? {
        tone: 'loading',
        eyebrow: 'نتیجه مرحله تمرینی',
        title: 'در حال دریافت نتیجه آزمون',
        description: 'دقت پاسخ‌های شما در حال محاسبه است؛ چند لحظه منتظر بمانید.',
        Icon: LoadingOutlined,
        stroke: '#2dd4bf',
        btnText: 'در حال دریافت نتیجه…',
        BtnIcon: ReloadOutlined,
    } : hasError ? {
        tone: 'error',
        eyebrow: 'خطا در دریافت نتیجه',
        title: 'نتیجه آزمون دریافت نشد',
        description: loadError,
        Icon: CloseCircleFilled,
        stroke: '#fb7185',
        btnText: 'تلاش دوباره',
        BtnIcon: ReloadOutlined,
    } : isPassed ? {
        tone: 'success',
        eyebrow: 'مرحله تمرینی با موفقیت گذرانده شد',
        title: 'تبریک! آزمون با موفقیت انجام شد',
        description: 'عملکرد شما بالاتر از حد نصاب بود. می‌توانید وارد مرحله بعد شوید.',
        Icon: TrophyFilled,
        stroke: '#2dd4bf',
        btnText: 'مرحله بعدی',
        BtnIcon: ArrowLeftOutlined,
    } : {
        tone: 'retry',
        eyebrow: 'نتیجه مرحله تمرینی',
        title: 'نیاز به تلاش مجدد',
        description: `دقت شما ${formatPercent(gapToThreshold)} درصد کمتر از حد نصاب بود. لطفاً دوباره تلاش کنید.`,
        Icon: WarningFilled,
        stroke: '#fb7185',
        btnText: 'تکرار آزمون',
        BtnIcon: ReloadOutlined,
    };

    const { Icon: ResultIcon, BtnIcon } = resultConfig;

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
            const message = 'آماده‌سازی مرحله بعد انجام نشد. لطفاً دوباره تلاش کنید.';
            setTransitionError(message);
            showReportToast({
                toastId: REPORT_TRANSITION_TOAST_ID,
                type: 'error',
                title: 'انتقال به مرحله بعد ناموفق بود',
                message,
                reduceMotion: reduceMotionRef.current,
            });
        } finally {
            transitionInFlightRef.current = false;
            setIsTransitioning(false);
        }
    };

    const enterTransition = reduceMotion
        ? { duration: 0 }
        : { duration: 0.42, ease: [0.22, 1, 0.36, 1] };
    const isBusy = loading || isTransitioning;
    const scoreLabel = loading
        ? '—'
        : hasError
            ? '—'
            : `${formatPercent(safeRecord)}٪`;

    return (
        <ConfigProvider
            direction="rtl"
            locale={faIR}
            componentSize="large"
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    colorError: '#fb7185',
                    colorBgBase: '#020617',
                    colorTextBase: '#f8fafc',
                    borderRadius: 14,
                    fontFamily: "'Vazirmatn', Tahoma, sans-serif",
                    motion: !reduceMotion,
                },
            }}
        >
            <main dir="rtl" className={`report-page report-page--${resultConfig.tone}`}>
                <div className="report-backdrop" aria-hidden="true">
                    <span className="report-backdrop__grid" />
                    <span className="report-backdrop__aurora" />
                    <span className="report-backdrop__glow report-backdrop__glow--accent" />
                    <span className="report-backdrop__glow report-backdrop__glow--blue" />
                    <span className="report-backdrop__beam" />
                    <span className="report-backdrop__dot report-backdrop__dot--one" />
                    <span className="report-backdrop__dot report-backdrop__dot--two" />
                </div>

                <div className="report-shell">
                    <Motion.header
                        className="report-topbar"
                        initial={reduceMotion ? false : { opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={enterTransition}
                        aria-label="سربرگ سامانه"
                    >
                        <div className="report-brand">
                            <span className="report-brand__mark">
                                <img src={mainlogo} alt="" />
                            </span>
                            <span className="report-brand__copy">
                                <strong>سامانه آزمون پژوهشی</strong>
                                <span>دانشگاه خوارزمی</span>
                            </span>
                        </div>

                        <span className="report-phase-pill">
                            <ExperimentOutlined aria-hidden="true" />
                            نتیجه مرحله تمرینی
                        </span>
                    </Motion.header>

                    <Motion.section
                        className="report-card"
                        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ ...enterTransition, delay: reduceMotion ? 0 : 0.08 }}
                        aria-labelledby="report-title"
                    >
                        <span className="report-card__sheen" aria-hidden="true" />
                        <span className="report-card__halo" aria-hidden="true" />

                        <Motion.span
                            className="report-emblem"
                            aria-hidden="true"
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.65 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={reduceMotion
                                ? { duration: 0 }
                                : { delay: 0.18, type: 'spring', stiffness: 200, damping: 15 }}
                        >
                            <ResultIcon spin={loading && !reduceMotion} />
                        </Motion.span>

                        <span className="report-eyebrow">{resultConfig.eyebrow}</span>
                        <h1 id="report-title">{resultConfig.title}</h1>
                        <p className="report-lead">{resultConfig.description}</p>

                        <div className="report-gauge">
                            <svg
                                className="report-gauge__svg"
                                viewBox="0 0 200 200"
                                role="img"
                                aria-label={loading
                                    ? 'در حال دریافت نتیجه آزمون'
                                    : `دقت پاسخ ${scoreLabel} از حد نصاب ${PASS_THRESHOLD.toLocaleString('fa-IR')} درصد`}
                            >
                                {/* Rotated so the ring starts at 12 o'clock and runs clockwise. */}
                                <g transform="rotate(-90 100 100)">
                                    <circle
                                        className="report-gauge__track"
                                        cx="100"
                                        cy="100"
                                        r={RING_RADIUS}
                                        fill="none"
                                        strokeWidth="12"
                                    />
                                    <Motion.circle
                                        className="report-gauge__progress"
                                        cx="100"
                                        cy="100"
                                        r={RING_RADIUS}
                                        fill="none"
                                        strokeWidth="12"
                                        strokeLinecap="round"
                                        stroke={resultConfig.stroke}
                                        strokeDasharray={RING_CIRCUMFERENCE}
                                        initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                                        animate={{
                                            strokeDashoffset: loading || hasError
                                                ? RING_CIRCUMFERENCE
                                                : RING_CIRCUMFERENCE * (1 - safeRecord / 100),
                                        }}
                                        transition={reduceMotion
                                            ? { duration: 0 }
                                            : { delay: 0.45, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                                        style={{ filter: `drop-shadow(0 0 0.5rem ${resultConfig.stroke})` }}
                                    />
                                </g>
                                {/* Pass threshold marker, measured clockwise from 12 o'clock. */}
                                <g transform={`rotate(${(360 * PASS_THRESHOLD) / 100} 100 100)`}>
                                    <rect
                                        className="report-gauge__threshold"
                                        x="98.5"
                                        y="5"
                                        width="3"
                                        height="18"
                                        rx="1.5"
                                    />
                                </g>
                            </svg>

                            <div className="report-gauge__center">
                                {loading ? (
                                    <LoadingOutlined
                                        className="report-gauge__spinner"
                                        spin={!reduceMotion}
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Motion.strong
                                        className="report-gauge__value"
                                        initial={reduceMotion ? false : { opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: reduceMotion ? 0 : 0.85 }}
                                        aria-live="polite"
                                    >
                                        {scoreLabel}
                                    </Motion.strong>
                                )}
                                <span className="report-gauge__caption">دقت پاسخ</span>
                            </div>
                        </div>

                        <dl className="report-metrics">
                            <div className="report-metric">
                                <dt>
                                    <RiseOutlined aria-hidden="true" />
                                    امتیاز شما
                                </dt>
                                <dd>{scoreLabel}</dd>
                            </div>
                            <div className="report-metric">
                                <dt>
                                    <FlagFilled aria-hidden="true" />
                                    حد نصاب
                                </dt>
                                <dd>{PASS_THRESHOLD.toLocaleString('fa-IR')}٪</dd>
                            </div>
                            <div className="report-metric report-metric--status">
                                <dt>
                                    <AimOutlined aria-hidden="true" />
                                    وضعیت
                                </dt>
                                <dd>
                                    {loading
                                        ? 'در حال بررسی…'
                                        : hasError
                                            ? 'نامشخص'
                                            : isPassed
                                                ? 'قبول'
                                                : 'نیاز به تکرار'}
                                </dd>
                            </div>
                        </dl>

                        <Button
                            className="report-action"
                            type="primary"
                            size="large"
                            block
                            onClick={hasError ? fetchRecord : handleButton}
                            disabled={isBusy}
                            loading={isBusy ? {
                                icon: <LoadingOutlined spin={!reduceMotion} aria-hidden="true" />,
                            } : false}
                            icon={!isBusy && <BtnIcon aria-hidden="true" />}
                        >
                            {isBusy
                                ? loading ? 'در حال دریافت نتیجه…' : 'در حال آماده‌سازی…'
                                : resultConfig.btnText}
                        </Button>

                        {transitionError && (
                            <p className="report-inline-error" role="alert">
                                <CloseCircleFilled aria-hidden="true" />
                                {transitionError}
                            </p>
                        )}
                    </Motion.section>

                    <footer className="report-footer">
                        <span className="report-footer__chip">
                            <BankOutlined aria-hidden="true" />
                            دانشگاه خوارزمی
                        </span>
                        <span className="report-footer__separator" aria-hidden="true" />
                        <span className="report-footer__chip">
                            <span className="report-footer__chip-mark" aria-hidden="true">
                                <img src={infs} alt="" />
                            </span>
                            بنیاد ملی علم ایران
                        </span>
                    </footer>
                </div>
            </main>
        </ConfigProvider>
    );
};

export default Report;
