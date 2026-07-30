import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';

import SignUp from './pages/SignUp';

// Everything past the landing screen is code-split: the sign-up page no longer
// pays for antd's Table, the report screens or framer-motion on first paint.
const loadInstructions = () => import('./pages/InstructionsScreen');
const InstructionsScreen = lazy(loadInstructions);
const Trial = lazy(() => import('./pages/Trial'));
const FinalScreen = lazy(() => import('./pages/FinalScreen.jsx'));
const Report = lazy(() => import('./pages/Report'));
const TableResults = lazy(() => import('./pages/TableResults.jsx'));
const NotFound = lazy(() => import('./pages/NotFound'));

const RouteFallback = () => (
    <div
        dir="rtl"
        role="status"
        aria-label="در حال بارگذاری"
        style={{ minHeight: '100dvh', background: '#05070d' }}
    />
);

const AppRoutes = () => {
    // The participant always goes straight from sign-up to the instructions
    // screen, so warm that chunk once the browser is idle.
    useEffect(() => {
        const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
        const cancel = window.cancelIdleCallback ?? clearTimeout;
        const handle = idle(() => { loadInstructions(); });

        return () => cancel(handle);
    }, []);

    return (
        <Suspense fallback={<RouteFallback />}>
            <Routes>
                <Route path="/" element={<SignUp />} />
                <Route path="/instructions" element={<InstructionsScreen />} />
                <Route path="/Final" element={<FinalScreen />} />
                <Route path="/Trial" element={<Trial />} />
                <Route path="/Report" element={<Report />} />
                <Route path="/results" element={<TableResults />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Suspense>
    );
};

export default AppRoutes;
