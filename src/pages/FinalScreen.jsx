import React from 'react';
import { Button, ConfigProvider, theme, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Home } from 'lucide-react';
import { motion as Motion } from 'framer-motion';
import { BankOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { logout } from '../redux/authSlice.js';
import { APP_ROUTE, PROBE_STORAGE_KEYS } from '../utils/phaseFlow.js';

const { Title, Text } = Typography;

const FinalScreen = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleFinish = () => {
        PROBE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        dispatch(logout());
        navigate(APP_ROUTE.SIGN_UP, { replace: true });
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
            <div style={{
                minHeight: '100vh',
                width: '100vw',
                background: 'radial-gradient(circle at 10% 20%, #134e4a 0%, #0f172a 60%, #020617 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden',
                fontFamily: "'Vazirmatn', sans-serif",
            }}>

                {/* ── Dot grid ── */}
                <div style={{
                    position: 'fixed', inset: 0, opacity: 0.07, pointerEvents: 'none',
                    backgroundImage: 'radial-gradient(#2dd4bf 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }} />

                {/* ── Ambient glows ── */}
                <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: '#14b8a6', opacity: 0.09, filter: 'blur(150px)', pointerEvents: 'none' }} />
                <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '40vw', height: '40vw', borderRadius: '50%', background: '#3b82f6', opacity: 0.07, filter: 'blur(120px)', pointerEvents: 'none' }} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '30vw', height: '30vw', borderRadius: '50%', background: '#2dd4bf', opacity: 0.03, filter: 'blur(100px)', pointerEvents: 'none' }} />

                {/* ── Main card ── */}
                <Motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 24 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        background: 'rgba(15, 23, 42, 0.55)',
                        backdropFilter: 'blur(28px)',
                        WebkitBackdropFilter: 'blur(28px)',
                        border: '1px solid rgba(45, 212, 191, 0.18)',
                        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.07)',
                        borderRadius: '28px',
                        padding: '56px 48px 48px',
                        maxWidth: '520px',
                        width: '90%',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        zIndex: 10,
                        position: 'relative',
                    }}
                >
                    {/* Card inner top shimmer line */}
                    <div style={{
                        position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
                        background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.4), transparent)',
                        borderRadius: '999px',
                    }} />

                    {/* ── Animated icon ── */}
                    <Motion.div
                        initial={{ scale: 0, rotate: -15 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.25, type: 'spring', stiffness: 180, damping: 14 }}
                        style={{ position: 'relative', marginBottom: '36px' }}
                    >
                        {/* Outer glow ring */}
                        <Motion.div
                            animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.08, 1] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                position: 'absolute', inset: '-12px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle, #2dd4bf44 0%, transparent 70%)',
                                filter: 'blur(8px)',
                            }}
                        />
                        {/* Inner ring */}
                        <Motion.div
                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                            style={{
                                position: 'absolute', inset: '-4px', borderRadius: '50%',
                                border: '1px solid rgba(45,212,191,0.4)',
                            }}
                        />
                        {/* Icon container */}
                        <div style={{
                            position: 'relative',
                            padding: '24px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(16,185,129,0.12) 100%)',
                            border: '1px solid rgba(45,212,191,0.25)',
                            boxShadow: '0 8px 32px rgba(45,212,191,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}>
                            <CheckCircle
                                style={{ width: '72px', height: '72px', color: '#2dd4bf', display: 'block' }}
                                strokeWidth={1.5}
                            />
                        </div>
                    </Motion.div>

                    {/* ── Text ── */}
                    <Motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                        style={{ width: '100%' }}
                    >
                        {/* Badge */}
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '7px',
                            padding: '5px 14px', marginBottom: '20px',
                            background: 'rgba(45,212,191,0.08)',
                            border: '1px solid rgba(45,212,191,0.22)',
                            borderRadius: '999px',
                        }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2dd4bf', boxShadow: '0 0 6px #2dd4bf' }} />
                            <span style={{ color: '#2dd4bf', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                ثبت موفق
                            </span>
                        </div>

                        <Title level={2} style={{
                            color: '#f1f5f9', margin: '0 0 14px',
                            fontWeight: 900, lineHeight: 1.3,
                            textShadow: '0 2px 20px rgba(45,212,191,0.15)',
                        }}>
                            آزمون با موفقیت به پایان رسید
                        </Title>

                        <Text style={{
                            color: '#94a3b8', fontSize: '15px',
                            display: 'block', lineHeight: 1.8, marginBottom: '8px',
                        }}>
                            از صبر و شکیبایی شما برای انجام این مراحل سپاسگزاریم.
                        </Text>

                        <Text style={{ color: '#475569', fontSize: '13px', lineHeight: 1.7 }}>
                            اطلاعات شما با موفقیت در سامانه ثبت گردید.
                        </Text>
                    </Motion.div>

                    {/* ── Divider ── */}
                    <Motion.div
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        transition={{ delay: 0.55, duration: 0.6 }}
                        style={{
                            width: '100%', height: '1px', margin: '32px 0 0',
                            background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.2), transparent)',
                        }}
                    />

                    {/* ── Action button ── */}
                    <Motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6, duration: 0.45 }}
                        style={{ width: '100%', marginTop: '28px' }}
                    >
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleFinish}
                            style={{
                                width: '100%',
                                height: '54px',
                                fontSize: '16px',
                                fontWeight: 700,
                                borderRadius: '14px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #0f766e 0%, #2dd4bf 100%)',
                                boxShadow: '0 4px 20px rgba(45,212,191,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                letterSpacing: '0.02em',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.boxShadow = '0 6px 28px rgba(45,212,191,0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,212,191,0.35), inset 0 1px 0 rgba(255,255,255,0.15)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <span>بازگشت به صفحه اصلی</span>
                            <Home style={{ width: 18, height: 18 }} />
                        </Button>
                    </Motion.div>
                </Motion.div>

                {/* ── Footer ── */}
                <Motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.75, duration: 0.5 }}
                    style={{
                        position: 'absolute', bottom: '28px',
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '16px',
                        zIndex: 10,
                    }}
                >
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 16px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(12px)',
                        color: 'rgba(255,255,255,0.5)', fontSize: '13px',
                    }}>
                        <BankOutlined style={{ color: '#2dd4bf', fontSize: 14 }} />
                        <span>دانشگاه خوارزمی</span>
                    </div>

                    <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.15)' }} />

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 16px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(12px)',
                        color: 'rgba(255,255,255,0.5)', fontSize: '13px',
                    }}>
                        <ExperimentOutlined style={{ color: '#2dd4bf', fontSize: 14 }} />
                        <span>بنیاد ملی علم</span>
                    </div>
                </Motion.div>

            </div>
        </ConfigProvider>
    );
};

export default FinalScreen;
