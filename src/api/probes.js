import axios from "axios";
import { toast, Slide } from 'react-toastify';
import { API_SERVER } from "../utils/API_SERVER.js";

const GLOBAL_TOAST_CONTAINER_ID = 'app-global';

const TOAST_CONFIG = {
    containerId: GLOBAL_TOAST_CONTAINER_ID,
    theme: "dark",
    transition: Slide,
    style: {
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid #2dd4bf',
        color: '#e2e8f0',
        fontFamily: "'Vazirmatn', sans-serif",
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        direction: 'rtl',
    },
    progressStyle: { background: '#2dd4bf' }
};


const updateToast = (id, message, type) => {
    toast.update(id, {
        render: message,
        type: type,
        isLoading: false,
        autoClose: 3000,
        ...TOAST_CONFIG
    });
};

export const getProbePhases = async (token) => {

    const toastId = toast.loading('درحال دریافت اطلاعات...', TOAST_CONFIG);

    try {
        const response = await axios.get(`${API_SERVER()}probe/phases/`, {
            headers: { Authorization: `token ${token}` },
        });


        updateToast(toastId, 'آزمون با موفقیت دریافت شد', 'success');
        return response;

    } catch (error) {
        console.error(error);

        updateToast(toastId, 'مشکلی در دریافت آزمون رخ داد', 'error');
        throw error;
    }
};

export const createProbeSession = async (token, targetId) => {
    try {

        return await axios.post(`${API_SERVER()}probe/sessions/create/`, {
            phase_id: targetId,
        }, {
            headers: { Authorization: 'token ' + token }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};


export const getSessionClusters = async (token, phaseId) => {
    const toastId = toast.loading("در حال ساخت جلسه آزمون...", TOAST_CONFIG);

    try {
        const response = await axios.get(`${API_SERVER()}probe/sessions/clusters/`, {
            headers: { Authorization: `token ${token}` },
            params: {
                session_id: phaseId,
            }
        });

        updateToast(toastId, "جلسه آزمون با موفقیت ساخته شد", 'success');
        return response;

    } catch (error) {
        console.error(error);
        updateToast(toastId, 'ساخت جلسه آزمون با مشکل روبرو شد', 'error');
        throw error;
    }
};

export const setPhaseComplete = async (token, sessionID) => {
    try {
        return await axios.post(`${API_SERVER()}probe/sessions/complete/`, {
            session_id: sessionID,
        }, {
            headers: { Authorization: `token ${token}` },
        });

    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const setVideoSeen = async (token, session_videoId) => {
    try {
        return await axios.post(`${API_SERVER()}probe/videos/seen/`, {
            session_video_id: session_videoId,
        }, {
            headers: { Authorization: `token ${token}` },
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const findValidSession = async (token) => {
    if (!token) {
        throw new Error('An authentication token is required to create a probe session.');
    }

    const phasesRes = await getProbePhases(token);
    if (!Array.isArray(phasesRes.data)) {
        throw new Error('The probe phases API returned an invalid response.');
    }

    const activePhases = phasesRes.data.filter(item => item.is_allowed && !item.is_passed);
    const activePhase = activePhases[0];

    if (!activePhase) {
        throw new Error('No active probe phase is available.');
    }

    if (activePhases.length > 1) {
        throw new Error('The API returned more than one active probe phase.');
    }

    const sessionRes = await createProbeSession(token, activePhase.id);
    const session = {
        phaseId: activePhase.id,
        phaseName: activePhase.name,
        hasVideo: Boolean(activePhase.has_video),
        videoSeen: Boolean(activePhase.video_seen),
        sessionId: sessionRes.data.session_id,
        clusterCount: sessionRes.data.cluster_count,
    };

    localStorage.setItem('currentPhaseID', String(session.phaseId));
    localStorage.setItem('currentSessionID', String(session.sessionId));
    localStorage.setItem('currentClusterLength', String(session.clusterCount));
    localStorage.setItem('currentPhaseName', session.phaseName ?? '');
    localStorage.setItem('currentPhaseHasVideo', String(session.hasVideo));
    localStorage.setItem('currentPhaseVideoSeen', String(session.videoSeen));

    return session;
}
