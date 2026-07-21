import React from 'react';
import { Button, ConfigProvider, theme, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { Home, FileQuestion } from 'lucide-react';
import { motion as Motion } from 'framer-motion';
import { BankOutlined, ExperimentOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const NotFound = () => {

    const styles = {
        backgroundWrapper: {
            minHeight: '100vh',
            width: '100vw',
            background: 'radial-gradient(circle at 50% 10%, #134e4a 0%, #0f172a 60%, #020617 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Vazirmatn', sans-serif",
        },
        glassCard: {
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(45, 212, 191, 0.2)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            borderRadius: '24px',
            padding: '50px 40px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10
        },
        primaryButton: {
            background: 'linear-gradient(135deg, #0f766e 0%, #2dd4bf 100%)',
            border: 'none',
            height: '55px',
            fontSize: '18px',
            fontWeight: 'bold',
            marginTop: '30px',
            width: '100%',
            boxShadow: '0 4px 15px rgba(13, 148, 136, 0.4)',
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

                {/* --- Ambient Background Glows --- */}
                <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#14b8a6] opacity-10 blur-[150px] pointer-events-none"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#3b82f6] opacity-10 blur-[150px] pointer-events-none"></div>

                {/* --- Glass Card Content --- */}
                <Motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    style={styles.glassCard}
                >

                    {/* Animated 404 Icon */}
                    <Motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="mb-6 relative"
                    >
                        {/* Glow effect behind icon */}
                        <div className="absolute inset-0 bg-[#2dd4bf] blur-2xl opacity-20 rounded-full"></div>

                        <div className="relative p-6 rounded-full bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-[#2dd4bf]/30">
                            <FileQuestion className="w-20 h-20 text-[#2dd4bf]" strokeWidth={1.5} />
                        </div>
                    </Motion.div>

                    {/* Text */}
                    <Title level={1} style={{ color: '#2dd4bf', margin: 0, fontSize: '4rem', lineHeight: 1 }}>
                        404
                    </Title>
                    <Title level={3} style={{ color: '#f8fafc', marginTop: '10px', marginBottom: '5px' }}>
                        صفحه مورد نظر پیدا نشد
                    </Title>

                    <Text style={{ color: '#94a3b8', fontSize: '16px', display: 'block', maxWidth: '300px' }}>
                        آدرس وارد شده صحیح نمی‌باشد یا صفحه حذف شده است.
                    </Text>

                    {/* Action Button */}
                    <Link to="/" style={{ width: '100%' }}>
                        <Button
                            type="primary"
                            size="large"
                            style={styles.primaryButton}
                        >
                            <span>بازگشت به صفحه اصلی</span>
                            <Home className="w-5 h-5" />
                        </Button>
                    </Link>

                </Motion.div>

                {/* --- Unified Footer --- */}
                <div style={styles.footer}>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                        <BankOutlined style={{ color: '#2dd4bf' }} />
                        <span>دانشگاه خوارزمی</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/20"></div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                        <ExperimentOutlined style={{ color: '#2dd4bf' }} />
                        <span>بنیاد ملی علم</span>
                    </div>
                </div>

            </div>
        </ConfigProvider>
    );
};

export default NotFound;
