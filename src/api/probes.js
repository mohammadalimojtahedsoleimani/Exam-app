import axios from "axios";
import { API_SERVER } from "../utils/API_SERVER.js";

export const getProbePhases = async (token) => {
    try {
        const response = await axios.get(`${API_SERVER()}probe/phases/`, {
            headers: { Authorization: `token ${token}` },
        });

        return response;

    } catch (error) {
        console.error(error);
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
    try {
        const response = await axios.get(`${API_SERVER()}probe/sessions/clusters/`, {
            headers: { Authorization: `token ${token}` },
            params: {
                session_id: phaseId,
            }
        });

        return response;

    } catch (error) {
        console.error(error);
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
