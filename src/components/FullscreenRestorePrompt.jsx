import React from 'react';
import { CloseOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useFullscreen } from '../context/fullscreenContext.js';
import './FullscreenRestorePrompt.css';

/**
 * Fullscreen can only be re-entered from a user gesture, so when the participant
 * leaves it mid-session (Esc, F11, tab switch) this chip offers one click back.
 * It stays hidden while a trial is running.
 */
const FullscreenRestorePrompt = () => {
    const {
        shouldOfferRestore,
        isBusy,
        enterFullscreen,
        releaseFullscreenIntent,
    } = useFullscreen();

    if (!shouldOfferRestore) return null;

    return (
        <div className="fs-restore" dir="rtl" role="status">
            <span className="fs-restore__icon" aria-hidden="true">
                <FullscreenOutlined />
            </span>

            <span className="fs-restore__copy">
                <strong>حالت تمام‌صفحه غیرفعال شد</strong>
                <small>برای تمرکز بهتر روی آزمون، دوباره آن را فعال کنید.</small>
            </span>

            <button
                type="button"
                className="fs-restore__action"
                onClick={enterFullscreen}
                disabled={isBusy}
            >
                فعال‌سازی
            </button>

            <button
                type="button"
                className="fs-restore__dismiss"
                onClick={releaseFullscreenIntent}
                aria-label="بستن پیام تمام‌صفحه"
            >
                <CloseOutlined aria-hidden="true" />
            </button>
        </div>
    );
};

export default FullscreenRestorePrompt;
