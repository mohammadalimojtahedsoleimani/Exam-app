import {useEffect} from 'react';
import {pruneParticipantRecovery} from '../utils/participantRecovery.js';

// localStorage has no built-in expiry. Remove elapsed backups while the app is
// open and check again when a suspended tab wakes. Reads also enforce the same
// deadline, including after the browser has been closed for more than 12 hours.
export const useParticipantRecoveryExpiry = onExpired => {
    useEffect(() => {
        let timer;
        const check = () => {
            clearTimeout(timer);
            let delay = 60_000;
            try {
                const {activeExpired, nextExpiryAt} = pruneParticipantRecovery(localStorage);
                if (nextExpiryAt !== null) delay = Math.min(delay, Math.max(1, nextExpiryAt - Date.now()));
                if (activeExpired) onExpired();
            } catch (error) {
                console.error('Participant recovery cleanup failed:', error);
            }
            timer = setTimeout(check, delay);
        };

        check();
        window.addEventListener('focus', check);
        window.addEventListener('storage', check);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', check);
            window.removeEventListener('storage', check);
        };
    }, [onExpired]);
};
