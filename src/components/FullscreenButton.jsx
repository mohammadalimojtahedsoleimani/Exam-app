import React from 'react';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useFullscreen } from '../context/fullscreenContext.js';
import './FullscreenButton.css';

const LABELS = {
    enter: 'حالت تمام‌صفحه',
    exit: 'خروج از تمام‌صفحه',
};

const HINTS = {
    enter: 'برای تمرکز بیشتر، آزمون را در حالت تمام‌صفحه انجام دهید.',
    exit: 'بازگشت به نمایش معمولی مرورگر.',
};

/**
 * Shared fullscreen control.
 * `mode="toggle"` follows the current state, `mode="exit"` only renders while
 * the app actually is fullscreen.
 */
const FullscreenButton = ({
    mode = 'toggle',
    variant = 'chip',
    className = '',
    showLabel = true,
    showError = true,
}) => {
    const {
        isSupported,
        isFullscreen,
        isBusy,
        error,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
    } = useFullscreen();

    if (!isSupported) return null;
    if (mode === 'exit' && !isFullscreen) return null;

    const action = mode === 'toggle'
        ? (isFullscreen ? 'exit' : 'enter')
        : mode;
    const handleClick = () => {
        if (mode === 'enter') return enterFullscreen();
        if (mode === 'exit') return exitFullscreen();
        return toggleFullscreen();
    };

    const label = LABELS[action];
    const Icon = action === 'exit' ? FullscreenExitOutlined : FullscreenOutlined;

    return (
        <span className={`fs-control fs-control--${variant} ${className}`.trim()}>
            <button
                type="button"
                className={`fs-control__button fs-control__button--${action}`}
                onClick={handleClick}
                disabled={isBusy}
                aria-label={label}
                aria-pressed={mode === 'toggle' ? isFullscreen : undefined}
                title={HINTS[action]}
            >
                <Icon aria-hidden="true" />
                {showLabel && <span className="fs-control__label">{label}</span>}
            </button>

            {showError && error && (
                <span className="fs-control__error" role="alert">{error}</span>
            )}
        </span>
    );
};

export default FullscreenButton;
