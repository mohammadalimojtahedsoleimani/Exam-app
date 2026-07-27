import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, Radio } from 'antd';
import {
    ArrowLeftOutlined,
    BookOutlined,
    CheckCircleFilled,
    CheckOutlined,
    CloseCircleFilled,
    ExclamationCircleFilled,
    ExperimentOutlined,
    IdcardOutlined,
    InfoCircleFilled,
    LoadingOutlined,
    LockOutlined,
    ManOutlined,
    NumberOutlined,
    SafetyCertificateOutlined,
    SolutionOutlined,
    TeamOutlined,
    ThunderboltFilled,
    UserOutlined,
    UserSwitchOutlined,
    WomanOutlined,
} from '@ant-design/icons';
import { toast, Slide, cssTransition } from 'react-toastify';
import { useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../redux/authSlice';
import { API_SERVER } from '../utils/API_SERVER.js';
import { findValidSession } from '../api/probes.js';
import { APP_ROUTE, PHASE } from '../utils/phaseFlow.js';
import './ProgressiveForm.css';

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';
const SIGNUP_SUBMISSION_TOAST_ID = 'signup-submission-feedback';
const SIGNUP_VALIDATION_TOAST_ID = 'signup-validation-feedback';
const SUCCESS_REDIRECT_DELAY = 950;
const REQUIRED_FIELDS = ['subject_id', 'age', 'gender', 'group'];

const ReducedMotionToastTransition = cssTransition({
    enter: 'signup-toast-reduced-motion-enter',
    exit: 'signup-toast-reduced-motion-exit',
    collapse: false,
});

const FIELD_ERROR_MESSAGES = {
    gender: 'جنسیت انتخاب‌شده معتبر نیست. یکی از گزینه‌های مرد یا زن را انتخاب کنید.',
    subject_id: 'شناسه شرکت‌کننده معتبر نیست یا پیش‌تر ثبت شده است.',
    age: 'سن واردشده معتبر نیست.',
    group: 'شماره گروه واردشده معتبر نیست.',
};

const flowSteps = [
    { label: 'اطلاعات اولیه', icon: UserOutlined },
    { label: 'آماده‌سازی جلسه', icon: ExperimentOutlined },
    { label: 'راهنمای آزمون', icon: BookOutlined },
];

const toPersianDigits = (value) => Number(value).toLocaleString('fa-IR');

const getRegistrationErrorMessage = (error) => {
    const responseData = error.response?.data;

    for (const field of Object.keys(FIELD_ERROR_MESSAGES)) {
        if (responseData?.[field]) return FIELD_ERROR_MESSAGES[field];
    }

    if (error.code === 'MISSING_REGISTRATION_TOKEN') {
        return 'پاسخ ثبت‌نام کامل نبود. لطفاً دوباره تلاش کنید.';
    }

    if (!error.response) {
        return 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
    }

    return 'ثبت‌نام انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید.';
};

const getServerFieldErrors = (error) => {
    const responseData = error.response?.data;

    if (!responseData || typeof responseData !== 'object') return [];

    return Object.entries(FIELD_ERROR_MESSAGES)
        .filter(([field]) => responseData[field])
        .map(([field, message]) => ({ name: field, errors: [message] }));
};

const focusFieldSafely = (form, name) => {
    try {
        form.focusField(name);
    } catch {
        /* Segmented and custom controls may not expose a focusable ref. */
    }
};

const isFieldFilled = (value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== undefined && value !== null && value !== '';
};

const FieldLabel = ({ icon, text, hint }) => {
    const LabelIcon = icon;

    return (
        <span className="signup-label">
            <span className="signup-label__icon" aria-hidden="true">
                <LabelIcon />
            </span>
            <span className="signup-label__text">{text}</span>
            {hint ? <span className="signup-label__hint">{hint}</span> : null}
        </span>
    );
};

const SignupToastContent = ({ type, title, message }) => {
    const iconByType = {
        loading: LoadingOutlined,
        success: CheckCircleFilled,
        error: CloseCircleFilled,
        warning: ExclamationCircleFilled,
        info: InfoCircleFilled,
    };
    const Icon = iconByType[type] ?? InfoCircleFilled;

    return (
        <div className={`signup-toast-content signup-toast-content--${type}`} dir="rtl">
            <span className="signup-toast-content__icon" aria-hidden="true">
                <span className="signup-toast-content__pulse" />
                <Icon spin={type === 'loading'} />
            </span>
            <span className="signup-toast-content__copy">
                <strong>{title}</strong>
                <span>{message}</span>
            </span>
        </div>
    );
};

const getToastBaseOptions = (reduceMotion) => ({
    containerId: GLOBAL_TOAST_CONTAINER_ID,
    transition: reduceMotion ? ReducedMotionToastTransition : Slide,
    theme: 'dark',
    icon: false,
    hideProgressBar: true,
});

const startSignupToast = (title, message, reduceMotion) => {
    const content = <SignupToastContent type="loading" title={title} message={message} />;
    const options = {
        ...getToastBaseOptions(reduceMotion),
        toastId: SIGNUP_SUBMISSION_TOAST_ID,
        className: 'app-toast app-toast--loading',
        ariaLabel: `${title}؛ ${message}`,
        isLoading: true,
        autoClose: false,
        closeButton: false,
        closeOnClick: false,
        draggable: false,
        type: 'default',
    };

    if (toast.isActive(SIGNUP_SUBMISSION_TOAST_ID, GLOBAL_TOAST_CONTAINER_ID)) {
        toast.update(SIGNUP_SUBMISSION_TOAST_ID, {
            ...options,
            render: content,
        });
        return SIGNUP_SUBMISSION_TOAST_ID;
    }

    return toast.loading(content, options);
};

const updateSignupToast = (toastId, type, title, message, reduceMotion) => {
    const autoClose = type === 'error' || type === 'warning' ? 5000 : 3500;

    toast.update(toastId, {
        ...getToastBaseOptions(reduceMotion),
        render: <SignupToastContent type={type} title={title} message={message} />,
        type,
        isLoading: false,
        autoClose,
        hideProgressBar: false,
        className: `app-toast app-toast--${type}`,
        progressClassName: `app-toast__progress app-toast__progress--${type}`,
        ariaLabel: `${title}؛ ${message}`,
        closeButton: true,
        closeOnClick: true,
        draggable: 'touch',
    });
};

const ProgressiveForm = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const reduceMotion = useReducedMotion();
    const [form] = Form.useForm();
    const [isLoading, setIsLoading] = useState(false);
    const [submissionStage, setSubmissionStage] = useState('idle');
    const [registeredToken, setRegisteredToken] = useState('');
    const submissionInFlightRef = useRef(false);
    const redirectTimerRef = useRef(null);
    const watchedValues = Form.useWatch([], form);

    useEffect(() => () => {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    }, []);

    const isSuccess = submissionStage === 'success';
    const filledCount = REQUIRED_FIELDS
        .filter((field) => isFieldFilled(watchedValues?.[field])).length;
    const completionPercent = isSuccess
        ? 100
        : Math.round((filledCount / REQUIRED_FIELDS.length) * 100);

    const startParticipantSession = async (token) => {
        await findValidSession(token);
        localStorage.setItem('currentState', 'instructions');
        localStorage.setItem('currentPhase', String(PHASE.PRACTICE));
        form.resetFields();
    };

    const onFinish = async (values) => {
        if (submissionInFlightRef.current) return;

        submissionInFlightRef.current = true;
        setIsLoading(true);
        toast.dismiss({ id: SIGNUP_VALIDATION_TOAST_ID, containerId: GLOBAL_TOAST_CONTAINER_ID });

        let token = registeredToken;
        let succeeded = false;
        const toastId = startSignupToast(
            token ? 'در حال آماده‌سازی آزمون' : 'در حال ثبت اطلاعات',
            token ? 'جلسه آزمون دوباره بررسی می‌شود.' : 'لطفاً چند لحظه منتظر بمانید.',
            reduceMotion,
        );

        try {
            if (!token) {
                setSubmissionStage('registering');
                const registerUrl = `${API_SERVER()}user/participant/register/`;
                const response = await axios.post(registerUrl, {
                    ...values,
                    subject_id: values.subject_id.trim(),
                });
                token = response.data?.token;

                if (!token) {
                    const tokenError = new Error('Registration response did not include a token.');
                    tokenError.code = 'MISSING_REGISTRATION_TOKEN';
                    throw tokenError;
                }

                setRegisteredToken(token);
                dispatch(setCredentials({ token }));
                localStorage.setItem('authToken', token);
            }

            setSubmissionStage('preparing');
            await startParticipantSession(token);
            succeeded = true;
            setSubmissionStage('success');
            updateSignupToast(
                toastId,
                'success',
                'جلسه آزمون آماده است',
                'در حال انتقال به راهنمای آزمون هستید.',
                reduceMotion,
            );

            if (reduceMotion) {
                navigate(APP_ROUTE.INSTRUCTIONS, { replace: true });
            } else {
                redirectTimerRef.current = setTimeout(() => {
                    navigate(APP_ROUTE.INSTRUCTIONS, { replace: true });
                }, SUCCESS_REDIRECT_DELAY);
            }
        } catch (error) {
            console.error(error);

            if (token) {
                updateSignupToast(
                    toastId,
                    'warning',
                    'آماده‌سازی جلسه کامل نشد',
                    'اطلاعات شما ثبت شده است؛ دکمه شروع را دوباره بزنید.',
                    reduceMotion,
                );
            } else {
                const fieldErrors = getServerFieldErrors(error);

                if (fieldErrors.length > 0) {
                    form.setFields(fieldErrors);
                    focusFieldSafely(form, fieldErrors[0].name);
                }

                updateSignupToast(
                    toastId,
                    'error',
                    'ثبت‌نام کامل نشد',
                    getRegistrationErrorMessage(error),
                    reduceMotion,
                );
            }
        } finally {
            submissionInFlightRef.current = false;

            if (!succeeded) {
                setSubmissionStage('idle');
                setIsLoading(false);
            }
        }
    };

    const onFinishFailed = ({ errorFields }) => {
        if (errorFields[0]) {
            form.scrollToField(errorFields[0].name, {
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'center',
            });
            focusFieldSafely(form, errorFields[0].name);
        }

        const title = `${toPersianDigits(errorFields.length)} مورد نیاز به بررسی دارد`;
        const message = 'فیلدهای مشخص‌شده را تکمیل یا اصلاح کنید.';

        toast(
            <SignupToastContent type="error" title={title} message={message} />,
            {
                ...getToastBaseOptions(reduceMotion),
                toastId: SIGNUP_VALIDATION_TOAST_ID,
                type: 'error',
                autoClose: 4000,
                hideProgressBar: false,
                className: 'app-toast app-toast--error',
                progressClassName: 'app-toast__progress app-toast__progress--error',
                ariaLabel: `${title}؛ ${message}`,
            },
        );
    };

    const lockRegisteredFields = Boolean(registeredToken);
    const activeFlowStep = isSuccess
        ? 2
        : lockRegisteredFields || submissionStage === 'preparing'
            ? 1
            : 0;
    const loadingLabel = submissionStage === 'preparing'
        ? 'در حال آماده‌سازی جلسه…'
        : 'در حال ثبت اطلاعات…';
    const meterLabel = isSuccess
        ? 'همه‌چیز آماده است'
        : filledCount === REQUIRED_FIELDS.length
            ? 'آماده ارسال'
            : `${toPersianDigits(filledCount)} از ${toPersianDigits(REQUIRED_FIELDS.length)} مورد تکمیل شده`;

    return (
        <div className={`signup-card${isSuccess ? ' signup-card--success' : ''}`}>
            <span className="signup-card__sheen" aria-hidden="true" />
            <span className="signup-card__scan" aria-hidden="true" />

            <div className="signup-card__header">
                <div className="signup-card__icon" aria-hidden="true">
                    <span className="signup-card__icon-ring" />
                    <IdcardOutlined />
                </div>
                <div className="signup-card__heading">
                    <span className="signup-card__eyebrow">
                        <ThunderboltFilled aria-hidden="true" />
                        فرم شروع آزمون
                    </span>
                    <h2 id="registration-form-title">اطلاعات اولیه شما</h2>
                    <p>برای ساخت جلسه آزمون، هر چهار مورد را تکمیل کنید.</p>
                </div>
            </div>

            <div
                className="signup-meter"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completionPercent}
                aria-label="میزان تکمیل فرم"
            >
                <div className="signup-meter__top">
                    <span className="signup-meter__label">
                        <SolutionOutlined aria-hidden="true" />
                        {meterLabel}
                    </span>
                    <span className="signup-meter__value">{toPersianDigits(completionPercent)}٪</span>
                </div>
                <div className="signup-meter__track">
                    <span
                        className="signup-meter__fill"
                        style={{ width: `${completionPercent}%` }}
                    />
                </div>
            </div>

            <ol className="signup-flow" aria-label="مراحل شروع آزمون">
                {flowSteps.map((step, index) => {
                    const StepIcon = step.icon;
                    const state = index < activeFlowStep
                        ? 'complete'
                        : index === activeFlowStep
                            ? 'active'
                            : 'pending';

                    return (
                        <li
                            key={step.label}
                            className={`signup-flow__step signup-flow__step--${state}`}
                            aria-current={state === 'active' ? 'step' : undefined}
                        >
                            <span className="signup-flow__icon" aria-hidden="true">
                                {state === 'complete' ? <CheckOutlined /> : <StepIcon />}
                            </span>
                            <span>{step.label}</span>
                        </li>
                    );
                })}
            </ol>

            {registeredToken && !isSuccess && (
                <div className="signup-retry-note" role="status">
                    <SafetyCertificateOutlined aria-hidden="true" />
                    <span>
                        <strong>اطلاعات شما ثبت شده است.</strong>
                        برای ادامه، آماده‌سازی جلسه را دوباره امتحان کنید.
                    </span>
                </div>
            )}

            <Form
                form={form}
                className="signup-form"
                layout="vertical"
                onFinish={onFinish}
                onFinishFailed={onFinishFailed}
                size="large"
                autoComplete="off"
                requiredMark={false}
                scrollToFirstError={{
                    behavior: reduceMotion ? 'auto' : 'smooth',
                    block: 'center',
                }}
            >
                <div className="signup-field signup-field--first">
                    <Form.Item
                        label={<FieldLabel icon={UserOutlined} text="شناسه شرکت‌کننده" hint="الزامی" />}
                        name="subject_id"
                        rules={[
                            { required: true, message: 'شناسه شرکت‌کننده را وارد کنید.' },
                            {
                                validator: (_, value) => value?.trim()
                                    ? Promise.resolve()
                                    : Promise.reject(new Error('شناسه نمی‌تواند خالی باشد.')),
                            },
                        ]}
                    >
                        <Input
                            prefix={<IdcardOutlined aria-hidden="true" />}
                            placeholder="شناسه‌ای که پژوهشگر در اختیار شما گذاشته است"
                            disabled={isLoading || lockRegisteredFields}
                            maxLength={64}
                            autoCapitalize="none"
                            spellCheck={false}
                            dir="auto"
                        />
                    </Form.Item>
                </div>

                <div className="signup-fields-row">
                    <div className="signup-field signup-field--second">
                        <Form.Item
                            label={<FieldLabel icon={NumberOutlined} text="سن" />}
                            name="age"
                            rules={[
                                { required: true, message: 'سن را وارد کنید.' },
                                { type: 'integer', message: 'سن باید یک عدد کامل باشد.' },
                                { type: 'number', min: 1, max: 120, message: 'سن باید بین ۱ تا ۱۲۰ باشد.' },
                            ]}
                        >
                            <InputNumber
                                prefix={<NumberOutlined aria-hidden="true" />}
                                placeholder="سن"
                                min={1}
                                max={120}
                                precision={0}
                                controls={false}
                                inputMode="numeric"
                                disabled={isLoading || lockRegisteredFields}
                                aria-label="سن شرکت‌کننده"
                            />
                        </Form.Item>
                    </div>

                    <div className="signup-field signup-field--third">
                        <Form.Item
                            label={<FieldLabel icon={TeamOutlined} text="شماره گروه" />}
                            name="group"
                            rules={[
                                { required: true, message: 'شماره گروه را وارد کنید.' },
                                { type: 'integer', message: 'شماره گروه باید یک عدد کامل باشد.' },
                                { type: 'number', min: 0, message: 'شماره گروه نمی‌تواند منفی باشد.' },
                            ]}
                        >
                            <InputNumber
                                prefix={<TeamOutlined aria-hidden="true" />}
                                placeholder="شماره گروه"
                                min={0}
                                precision={0}
                                controls={false}
                                inputMode="numeric"
                                disabled={isLoading || lockRegisteredFields}
                                aria-label="شماره گروه شرکت‌کننده"
                            />
                        </Form.Item>
                    </div>
                </div>

                <div className="signup-field signup-field--fourth">
                    <Form.Item
                        label={<FieldLabel icon={UserSwitchOutlined} text="جنسیت" />}
                        name="gender"
                        rules={[{ required: true, message: 'جنسیت را انتخاب کنید.' }]}
                    >
                        <Radio.Group
                            className="signup-choice"
                            block
                            optionType="button"
                            buttonStyle="solid"
                            disabled={isLoading || lockRegisteredFields}
                            role="radiogroup"
                            aria-label="جنسیت شرکت‌کننده"
                            options={[
                                {
                                    value: 'MALE',
                                    label: (
                                        <span className="signup-choice__label">
                                            <ManOutlined aria-hidden="true" />
                                            مرد
                                        </span>
                                    ),
                                },
                                {
                                    value: 'FEMALE',
                                    label: (
                                        <span className="signup-choice__label">
                                            <WomanOutlined aria-hidden="true" />
                                            زن
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </Form.Item>
                </div>

                <Form.Item className="signup-submit-item">
                    <Button
                        className="signup-submit-button"
                        type="primary"
                        htmlType="submit"
                        block
                        disabled={isLoading}
                        loading={isLoading && !isSuccess ? {
                            icon: <LoadingOutlined spin={!reduceMotion} aria-hidden="true" />,
                        } : false}
                        icon={
                            isSuccess
                                ? <CheckOutlined aria-hidden="true" />
                                : !isLoading && <ArrowLeftOutlined aria-hidden="true" />
                        }
                    >
                        {isSuccess
                            ? 'آماده است — در حال انتقال'
                            : isLoading
                                ? loadingLabel
                                : registeredToken
                                    ? 'تلاش دوباره برای شروع آزمون'
                                    : 'شروع آزمون'}
                    </Button>
                </Form.Item>
            </Form>

            <div className="signup-privacy-note">
                <LockOutlined aria-hidden="true" />
                <span>اطلاعات واردشده تنها در چارچوب این پژوهش استفاده می‌شود.</span>
            </div>

            {isSuccess && (
                <div className="signup-card__success" role="status">
                    <span className="signup-card__success-ring" aria-hidden="true">
                        <CheckOutlined />
                    </span>
                    <strong>جلسه آزمون آماده شد</strong>
                    <span>در حال انتقال به راهنمای مرحله تمرینی…</span>
                </div>
            )}
        </div>
    );
};

export default ProgressiveForm;
