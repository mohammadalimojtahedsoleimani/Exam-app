import axios from "axios";
import { API_SERVER } from "../utils/API_SERVER.js";
import { isAlreadySubmittedError, isAlreadyCompletedError, isAlreadySeenError } from "../utils/trialErrors.js";
import {checkpointParticipantRecovery, commitParticipantFlow} from "../utils/participantRecovery.js";
import {captureProbeRequestGuard, performProbeRequest, PROBE_REQUEST_TIMEOUT_MS} from '../utils/probeRequest.js';

export const submitTrialAnswer = async (token, payload) => {
    // All retries reuse the exact answer and original measured reaction time.
    await performProbeRequest(
        () => axios.post(`${API_SERVER()}probe/results/create/`, payload, {
            headers: {Authorization: `token ${token}`, 'Content-Type': 'application/json'},
            timeout: PROBE_REQUEST_TIMEOUT_MS,
        }),
        {isCurrent: captureProbeRequestGuard(token), recover: error => isAlreadySubmittedError(error, payload.cluster_id)},
    );
};

export const getProbePhases = async (token) => {
    return performProbeRequest(
        () => axios.get(`${API_SERVER()}probe/phases/`, {
            headers: { Authorization: `token ${token}` },
            timeout: PROBE_REQUEST_TIMEOUT_MS,
        }),
        {isCurrent: captureProbeRequestGuard(token)},
    );
};

export const createProbeSession = async (token, targetId) => {
    return performProbeRequest(
        () => axios.post(`${API_SERVER()}probe/sessions/create/`, {
            phase_id: targetId,
        }, {
            headers: { Authorization: 'token ' + token },
            timeout: PROBE_REQUEST_TIMEOUT_MS,
        }),
        {isCurrent: captureProbeRequestGuard(token), maxRetries: 0},
    );
};


export const getSessionClusters = async (token, phaseId) => {
    return performProbeRequest(
        () => axios.get(`${API_SERVER()}probe/sessions/clusters/`, {
            headers: { Authorization: `token ${token}` },
            timeout: PROBE_REQUEST_TIMEOUT_MS,
            params: {
                session_id: phaseId,
            }
        }),
        {isCurrent: captureProbeRequestGuard(token)},
    );
};

export const setPhaseComplete = async (token, sessionID) => {
    return performProbeRequest(
        () => axios.post(`${API_SERVER()}probe/sessions/complete/`, {
            session_id: sessionID,
        }, {
            headers: { Authorization: `token ${token}` },
            timeout: PROBE_REQUEST_TIMEOUT_MS,
        }),
        {isCurrent: captureProbeRequestGuard(token), recover: error => isAlreadyCompletedError(error, sessionID)},
    );
};

export const setVideoSeen = async (token, session_videoId) => {
    return performProbeRequest(
        () => axios.post(`${API_SERVER()}probe/videos/seen/`, {
            session_video_id: session_videoId,
        }, {
            headers: { Authorization: `token ${token}` },
            timeout: PROBE_REQUEST_TIMEOUT_MS,
        }),
        {isCurrent: captureProbeRequestGuard(token), recover: error => isAlreadySeenError(error, session_videoId)},
    );
};

export const findValidSession = async (token, flow = {}) => {
    if (!token) {
        throw new Error('An authentication token is required to create a probe session.');
    }
    checkpointParticipantRecovery(localStorage);
    if (localStorage.getItem('authToken') !== token) {
        throw new Error('The participant session is no longer active.');
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

    if (localStorage.getItem('authToken') !== token) {
        throw new Error('The participant session changed while loading phases.');
    }
    const sessionRes = await createProbeSession(token, activePhase.id);
    checkpointParticipantRecovery(localStorage);
    if (localStorage.getItem('authToken') !== token) {
        throw new Error('The participant session changed while preparing the exam.');
    }
    const sessionId = sessionRes.data?.session_id;
    if (!((typeof sessionId === 'string' && sessionId.trim())
        || (typeof sessionId === 'number' && Number.isFinite(sessionId)))) {
        throw new Error('The API did not return a valid probe session ID.');
    }
    const session = {
        phaseId: activePhase.id,
        phaseName: activePhase.name,
        hasVideo: Boolean(activePhase.has_video),
        videoSeen: Boolean(activePhase.video_seen),
        sessionId,
        clusterCount: sessionRes.data.cluster_count,
    };

    commitParticipantFlow(localStorage, {
        currentPhaseID: String(session.phaseId),
        currentSessionID: String(session.sessionId),
        currentClusterLength: String(session.clusterCount),
        currentPhaseName: session.phaseName ?? '',
        currentPhaseHasVideo: String(session.hasVideo),
        currentPhaseVideoSeen: String(session.videoSeen),
        ...(flow.phase !== undefined ? {currentPhase: String(flow.phase)} : {}),
        ...(flow.state !== undefined ? {currentState: flow.state} : {}),
    });

    return session;
}
