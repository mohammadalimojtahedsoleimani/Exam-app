import React, { useRef, useState } from 'react';
import {
    Button,
    ConfigProvider,
    Form,
    Input,
    InputNumber,
    Select,
    Space,
    Typography,
    theme,
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    DownOutlined,
    LoadingOutlined,
    LockOutlined,
    ManOutlined,
    NumberOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
    UserOutlined,
    WomanOutlined,
} from '@ant-design/icons';
import { toast, Slide } from 'react-toastify';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../redux/authSlice';
import { API_SERVER } from '../utils/API_SERVER.js';
import { findValidSession } from '../api/probes.js';
import { APP_ROUTE, PHASE } from '../utils/phaseFlow.js';

const { Title, Text } = Typography;
const GLOBAL_TOAST_CONTAINER_ID = 'app-global';

const getRegistrationErrorMessage = (error) => {
    const responseData = error.response?.data;

    if (responseData?.gender) {
        return 'جنسیت انتخاب‌شده معتبر نیست. لطفاً یکی از گزینه‌های مرد یا زن را انتخاب کنید.';
    }

    if (responseData?.subject_id) {
        return 'شناسه شرکت‌کننده معتبر نیست یا پیش‌تر ثبت شده است.';
    }

    if (responseData?.age) {
        return 'سن واردشده معتبر نیست.';
    }

    if (responseData?.group) {
        return 'شماره گروه واردشده معتبر نیست.';
    }

    if (!error.response) {
        return 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
    }

    return 'ثبت‌نام انجام نشد. لطفاً اطلاعات را بررسی و دوباره تلاش کنید.';
};

const styles = {
    card: {
        position: 'relative',
        width: '100%',
        padding: 'clamp(14px, 2.2vw, 24px)',
        overflow: 'hidden',
        background: 'linear-gradient(155deg, rgba(15,23,42,0.92), rgba(15,23,42,0.76))',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: '1px solid rgba(94, 234, 212, 0.2)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
        borderRadius: 24,
    },
    submitButton: {
        width: '100%',
        minHeight: 48,
        border: 'none',
        borderRadius: 14,
        fontSize: 16,
        fontWeight: 800,
        background: 'linear-gradient(100deg, #0f766e 0%, #0d9488 48%, #2563eb 100%)',
        boxShadow: '0 12px 30px rgba(13,148,136,0.28)',
    },
};

const ProgressiveForm = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [form] = Form.useForm();
    const [isLoading, setIsLoading] = useState(false);
    const [registeredToken, setRegisteredToken] = useState('');
    const submissionInFlightRef = useRef(false);

    const showToast = (message, type = 'info') => {
        toast(message, {
            containerId: GLOBAL_TOAST_CONTAINER_ID,
            type,
            theme: 'dark',
            transition: Slide,
            icon: type === 'success'
                ? <CheckCircleOutlined aria-hidden="true" style={{ color: '#5eead4' }} />
                : type === 'error'
                    ? <CloseCircleOutlined aria-hidden="true" style={{ color: '#fda4af' }} />
                    : <SafetyCertificateOutlined aria-hidden="true" style={{ color: '#7dd3fc' }} />,
            style: {
                background: 'rgba(15, 23, 42, 0.96)',
                border: `1px solid ${type === 'error' ? 'rgba(251,113,133,.45)' : 'rgba(45,212,191,.4)'}`,
                borderRadius: 16,
                color: '#e2e8f0',
                fontFamily: "'Vazirmatn', sans-serif",
                boxShadow: '0 18px 40px rgba(0,0,0,.35)',
                direction: 'rtl',
            },
            hideProgressBar: true,
        });
    };

    const startParticipantSession = async (token) => {
        await findValidSession(token);
        localStorage.setItem('currentState', 'instructions');
        localStorage.setItem('currentPhase', String(PHASE.PRACTICE));
        showToast('ثبت‌نام با موفقیت انجام شد.', 'success');
        navigate(APP_ROUTE.INSTRUCTIONS, { replace: true });
        form.resetFields();
    };

    const onFinish = async (values) => {
        if (submissionInFlightRef.current) return;
        submissionInFlightRef.current = true;
        setIsLoading(true);

        let token = registeredToken;

        try {
            if (!token) {
                const registerUrl = `${API_SERVER()}user/participant/register/`;
                const response = await axios.post(registerUrl, values);
                token = response.data.token;

                if (!token) {
                    throw new Error('Registration response did not include a token.');
                }

                setRegisteredToken(token);
                dispatch(setCredentials({ token }));
                localStorage.setItem('authToken', token);
            }

            await startParticipantSession(token);
        } catch (error) {
            console.error(error);

            if (token) {
                showToast('اطلاعات شما ثبت شد، اما آماده‌سازی آزمون کامل نشد. دکمه شروع را دوباره بزنید.', 'error');
            } else {
                showToast(getRegistrationErrorMessage(error), 'error');
            }
        } finally {
            submissionInFlightRef.current = false;
            setIsLoading(false);
        }
    };

    const lockRegisteredFields = Boolean(registeredToken);

    return (
        <ConfigProvider
            direction="rtl"
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2dd4bf',
                    borderRadius: 12,
                    fontFamily: "'Vazirmatn', sans-serif",
                    colorBgContainer: 'rgba(2, 6, 23, 0.42)',
                    colorBorder: 'rgba(148, 163, 184, 0.2)',
                    colorTextPlaceholder: '#64748b',
                    controlHeightLG: 46,
                },
            }}
        >
            <div className="signup-card" style={styles.card}>
                <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent" />
                <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl" />

                <div className="signup-form-header relative mb-4 flex items-center gap-3 text-right">
                    <div className="signup-form-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-teal-300/25 bg-gradient-to-br from-teal-300/15 to-blue-500/15 text-2xl text-teal-300 shadow-lg shadow-teal-950/30">
                        <UserOutlined aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <Title
                            level={2}
                            className="signup-form-title"
                            style={{ margin: 0, color: '#f8fafc', fontSize: 24, lineHeight: 1.35, fontWeight: 900 }}
                        >
                            ثبت‌نام شرکت‌کننده
                        </Title>
                        <Text className="signup-form-description" style={{ display: 'block', marginTop: 2, color: '#94a3b8', fontSize: 12, lineHeight: 1.7 }}>
                            برای آغاز آزمون، اطلاعات زیر را تکمیل کنید.
                        </Text>
                    </div>
                </div>

                {registeredToken && (
                    <div
                        role="status"
                        className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs leading-5 text-amber-100"
                    >
                        <SafetyCertificateOutlined aria-hidden="true" className="mt-1 text-amber-300" />
                        ثبت‌نام انجام شده است؛ برای ادامه، آماده‌سازی آزمون را دوباره امتحان کنید.
                    </div>
                )}

                <Form
                    form={form}
                    className="signup-form"
                    layout="vertical"
                    onFinish={onFinish}
                    size="large"
                    autoComplete="off"
                    requiredMark={false}
                >
                    <div className="signup-field signup-field-1">
                        <Form.Item
                            label="شناسه شرکت‌کننده"
                            name="subject_id"
                            rules={[{ required: true, message: 'شناسه شرکت‌کننده را وارد کنید.' }]}
                        >
                            <Input
                                prefix={<UserOutlined aria-hidden="true" />}
                                placeholder="شناسه شرکت‌کننده"
                                disabled={isLoading || lockRegisteredFields}
                                dir="auto"
                            />
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 sm:gap-x-3">
                        <div className="signup-field signup-field-2">
                            <Form.Item
                                label="سن"
                                name="age"
                                rules={[{ required: true, message: 'سن را وارد کنید.' }]}
                            >
                                <InputNumber
                                    prefix={<NumberOutlined aria-hidden="true" />}
                                    placeholder="سن"
                                    min={1}
                                    max={120}
                                    controls={false}
                                    disabled={isLoading || lockRegisteredFields}
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        </div>

                        <div className="signup-field signup-field-3">
                            <Form.Item
                                label="جنسیت"
                                name="gender"
                                rules={[{ required: true, message: 'جنسیت را انتخاب کنید.' }]}
                            >
                                <Select
                                    placeholder="انتخاب جنسیت"
                                    disabled={isLoading || lockRegisteredFields}
                                    suffixIcon={<DownOutlined aria-hidden="true" />}
                                    menuItemSelectedIcon={<CheckOutlined aria-hidden="true" />}
                                    options={[
                                        {
                                            value: 'MALE',
                                            label: <Space><ManOutlined aria-hidden="true" className="text-sky-300" />مرد</Space>,
                                        },
                                        {
                                            value: 'FEMALE',
                                            label: <Space><WomanOutlined aria-hidden="true" className="text-pink-300" />زن</Space>,
                                        },
                                    ]}
                                />
                            </Form.Item>
                        </div>
                    </div>

                    <div className="signup-field signup-field-4">
                        <Form.Item
                            label="شماره گروه"
                            name="group"
                            rules={[{ required: true, message: 'شماره گروه را وارد کنید.' }]}
                        >
                            <InputNumber
                                prefix={<TeamOutlined aria-hidden="true" />}
                                placeholder="شماره گروه"
                                min={0}
                                controls={false}
                                disabled={isLoading || lockRegisteredFields}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item style={{ marginBottom: 0, marginTop: 4 }}>
                        <Button
                            className="signup-submit-button"
                            type="primary"
                            htmlType="submit"
                            block
                            loading={isLoading ? { icon: <LoadingOutlined aria-hidden="true" /> } : false}
                            style={styles.submitButton}
                            icon={!isLoading && <ArrowLeftOutlined aria-hidden="true" />}
                        >
                            {isLoading
                                ? 'در حال آماده‌سازی آزمون…'
                                : registeredToken
                                    ? 'تلاش دوباره برای شروع آزمون'
                                    : 'شروع آزمون'}
                        </Button>
                    </Form.Item>
                </Form>

                <div className="signup-privacy-note mt-3 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-slate-500">
                    <LockOutlined aria-hidden="true" className="text-teal-400/70" />
                    اطلاعات واردشده محرمانه نگهداری می‌شود.
                </div>

                <style>{`
                    .signup-form .ant-form-item { margin-bottom: 10px; }
                    .signup-form .ant-form-item-label { padding-bottom: 4px; }
                    .signup-form .ant-form-item-label > label {
                        color: #cbd5e1 !important;
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .signup-form .ant-input-affix-wrapper,
                    .signup-form .ant-input-number,
                    .signup-form .ant-select-single,
                    .signup-form .ant-select-single .ant-select-selector {
                        min-height: 46px !important;
                    }
                    .signup-form .ant-input,
                    .signup-form .ant-input-number,
                    .signup-form .ant-select-selector {
                        border-color: rgba(148, 163, 184, 0.18) !important;
                        background: rgba(2, 6, 23, 0.42) !important;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                    }
                    .signup-form .ant-input:hover,
                    .signup-form .ant-input-number:hover,
                    .signup-form .ant-select:hover .ant-select-selector {
                        border-color: rgba(94, 234, 212, 0.5) !important;
                    }
                    .signup-form .ant-input-affix-wrapper-focused,
                    .signup-form .ant-input-number-focused,
                    .signup-form .ant-select-focused .ant-select-selector {
                        border-color: #2dd4bf !important;
                        box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12) !important;
                    }
                    .signup-form .ant-input-prefix,
                    .signup-form .ant-input-number-prefix { color: #5eead4; margin-left: 9px; }
                    .signup-form .ant-input-number-input { height: 44px; }
                    .signup-form .ant-form-item-explain-error { font-size: 12px; margin-top: 4px; }
                    .signup-field { min-width: 0; animation: signupFieldIn .5s cubic-bezier(.22,1,.36,1) both; }
                    .signup-field-2 { animation-delay: .05s; }
                    .signup-field-3 { animation-delay: .1s; }
                    .signup-field-4 { animation-delay: .15s; }
                    @keyframes signupFieldIn {
                        from { opacity: 0; transform: translateY(12px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media (max-height: 700px) {
                        .signup-card { padding: 12px 16px !important; border-radius: 20px !important; }
                        .signup-form-header { margin-bottom: 9px; }
                        .signup-form-icon { width: 40px; height: 40px; border-radius: 13px; font-size: 20px; }
                        .signup-form-title { font-size: 21px !important; }
                        .signup-form-description { display: none !important; }
                        .signup-form .ant-form-item { margin-bottom: 7px; }
                        .signup-form .ant-form-item-label { padding-bottom: 2px; }
                        .signup-form .ant-input-affix-wrapper,
                        .signup-form .ant-input-number,
                        .signup-form .ant-select-single,
                        .signup-form .ant-select-single .ant-select-selector {
                            min-height: 42px !important;
                            height: 42px !important;
                        }
                        .signup-form .ant-input-number-input { height: 40px; }
                        .signup-submit-button { min-height: 44px !important; }
                        .signup-privacy-note { margin-top: 7px; line-height: 18px; }
                    }
                    @media (max-height: 560px) {
                        .signup-form-icon { display: none; }
                        .signup-form-header { margin-bottom: 5px; }
                        .signup-privacy-note { display: none; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .signup-field { animation: none !important; }
                    }
                `}</style>
            </div>
        </ConfigProvider>
    );
};

export default ProgressiveForm;
