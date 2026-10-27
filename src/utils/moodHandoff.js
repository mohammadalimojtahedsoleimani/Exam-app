import {APP_ROUTE, PHASE} from './phaseFlow.js';
import {createProbePhaseError} from './probePhaseErrors.js';
import {checkpointParticipantRecovery, commitParticipantFlow} from './participantRecovery.js';
import {readTrialProgress, writeTrialProgress} from './trialProgress.js';

const validId = value => (typeof value === 'string' && value.trim().length > 0)
    || (typeof value === 'number' && Number.isFinite(value));
const sameId = (left, right) => validId(left) && validId(right) && String(left) === String(right);
const count = value => Number.isInteger(value) && value >= 0;
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100;
const conflict = () => {
    throw createProbePhaseError('MOOD_HANDOFF_CONFLICT', 'The server could not verify a consistent mood-phase handoff.');
};
const requireEvidence = condition => { if (!condition) conflict(); };
const passingProof = phase => {
    const proof = phase?.completion;
    return phase?.is_passed === true && validId(proof?.session_id) && proof.is_completed === true
        && count(proof.cluster_count) && proof.cluster_count > 0
        && proof.answered_count === proof.cluster_count && percent(proof.mark)
        && percent(proof.minimum_mark) && proof.mark >= proof.minimum_mark;
};
const validSubmission = submission => validId(submission?.cluster_id)
    && ['LEFT', 'RIGHT'].includes(submission.answer)
    && Number.isFinite(submission.response_time) && submission.response_time >= 0;
const sameSubmission = (left, right) => sameId(left.cluster_id, right.cluster_id)
    && left.answer === right.answer && left.response_time === right.response_time;

const validateSession = (session, phases) => {
    requireEvidence(session && validId(session.session_id) && [3, 4].includes(session.position)
        && sameId(session.phase_id, phases[session.position - 1]?.id)
        && typeof session.name === 'string' && typeof session.has_video === 'boolean'
        && typeof session.video_seen === 'boolean'
        && count(session.cluster_count) && session.cluster_count > 0
        && count(session.answered_count) && session.answered_count <= session.cluster_count
        && Array.isArray(session.cluster_order) && session.cluster_order.length === session.cluster_count
        && session.cluster_order.every(validId)
        && new Set(session.cluster_order.map(String)).size === session.cluster_count
        && Array.isArray(session.confirmed_submissions)
        && session.confirmed_submissions.length === session.answered_count
        && session.confirmed_submissions.every(validSubmission));
    const ids = new Set(session.cluster_order.map(String));
    requireEvidence(new Set(session.confirmed_submissions.map(answer => String(answer.cluster_id))).size === session.answered_count
        && session.confirmed_submissions.every(answer => ids.has(String(answer.cluster_id))));
};

// Flags alone cannot finish the experiment. Require the owned source session
// and the backend's nonempty, fully answered, passing completion evidence.
export const validateMoodHandoff = (data, sourceSessionId, action = 'complete') => {
    requireEvidence(data && ['instructions', 'trial', 'complete'].includes(data.state)
        && ['complete', 'continue'].includes(action)
        && Array.isArray(data.phases) && data.phases.length === 4
        && data.phases.every((phase, index) => validId(phase?.id) && phase.position === index + 1
            && typeof phase.is_allowed === 'boolean' && typeof phase.is_passed === 'boolean')
        && new Set(data.phases.map(phase => String(phase.id))).size === 4);
    const source = data.source;
    requireEvidence(source && sameId(source.session_id, sourceSessionId) && [3, 4].includes(source.position)
        && sameId(source.phase_id, data.phases[source.position - 1].id)
        && typeof source.is_completed === 'boolean'
        && count(source.cluster_count) && source.cluster_count > 0
        && count(source.answered_count) && source.answered_count <= source.cluster_count);
    requireEvidence(data.phases.slice(0, source.position - 1).every(passingProof));
    if (source.is_completed) {
        requireEvidence(source.answered_count === source.cluster_count
            && passingProof(data.phases[source.position - 1])
            && sameId(data.phases[source.position - 1].completion.session_id, source.session_id));
    }
    if (data.state === 'complete') {
        requireEvidence(source.is_completed && data.phases.every(passingProof)
            && data.session === null && data.next_phase_id === null);
    } else if (data.state === 'instructions') {
        requireEvidence(source.is_completed && source.position === PHASE.MOOD_FIRST
            && data.phases[3].is_allowed === true && data.phases[3].is_passed === false
            && sameId(data.next_phase_id, data.phases[3].id) && data.session === null);
    } else {
        requireEvidence(action === 'continue');
        validateSession(data.session, data.phases);
        const target = data.session;
        requireEvidence(data.phases.slice(0, target.position - 1).every(passingProof));
        if (sameId(target.session_id, source.session_id)) {
            requireEvidence(!source.is_completed && target.position === source.position
                && target.cluster_count === source.cluster_count && target.answered_count === source.answered_count);
        } else {
            requireEvidence(source.is_completed && source.position === PHASE.MOOD_FIRST
                && target.position === PHASE.MOOD_SECOND && sameId(data.next_phase_id, target.phase_id));
        }
    }
    return data;
};

// Recover actual saved answers, including their measured times. Never invent
// responses or overwrite a different pending/acknowledged participant payload.
export const mergeMoodSessionProgress = (saved, session) => {
    const serverOrder = session.cluster_order;
    const confirmed = new Map(session.confirmed_submissions.map(answer => [String(answer.cluster_id), answer]));
    const ids = new Set(serverOrder.map(String));
    if (saved) {
        requireEvidence(Array.isArray(saved.clusterOrder)
            && new Set(saved.clusterOrder.map(String)).size === saved.clusterOrder.length
            && count(saved.nextIndex) && saved.nextIndex <= saved.clusterOrder.length
            && saved.clusterOrder.every(id => ids.has(String(id)))
            && saved.clusterOrder.slice(0, saved.nextIndex).every(id => confirmed.has(String(id))));
        for (const answer of saved.confirmedSubmissions ?? []) {
            requireEvidence(confirmed.has(String(answer.cluster_id))
                && sameSubmission(answer, confirmed.get(String(answer.cluster_id))));
        }
    }
    const originalOrder = saved ? [...saved.clusterOrder, ...serverOrder.filter(id => !saved.clusterOrder.some(savedId => sameId(id, savedId)))]
        : [...serverOrder];
    const acknowledged = originalOrder.filter(id => confirmed.has(String(id)));
    const remaining = originalOrder.filter(id => !confirmed.has(String(id)));
    let pending = saved?.pendingSubmission ? {...saved.pendingSubmission} : null;
    if (pending && confirmed.has(String(pending.cluster_id))) {
        requireEvidence(sameSubmission(pending, confirmed.get(String(pending.cluster_id))));
        pending = null;
    }
    if (pending) requireEvidence(validSubmission(pending) && sameId(pending.cluster_id, remaining[0]));
    return {
        clusterOrder: [...acknowledged, ...remaining], nextIndex: acknowledged.length,
        confirmedSubmissions: acknowledged.map(id => ({...confirmed.get(String(id))})),
        pendingSubmission: pending, phaseCompletionSaved: false,
    };
};

export const getMoodHandoffFlow = handoff => {
    if (handoff.state === 'instructions') {
        return {updates: {currentPhase: '4', currentState: 'instructions'}, route: APP_ROUTE.INSTRUCTIONS};
    }
    if (handoff.state === 'complete') {
        return {updates: {currentPhase: '4', currentState: 'result'}, route: APP_ROUTE.FINAL};
    }
    const session = handoff.session;
    return {
        updates: {
            currentPhase: String(session.position), currentState: 'Exam',
            currentSessionID: String(session.session_id), currentPhaseID: String(session.phase_id),
            currentClusterLength: String(session.cluster_count), currentPhaseName: session.name,
            currentPhaseHasVideo: String(session.has_video), currentPhaseVideoSeen: String(session.video_seen),
        },
        route: APP_ROUTE.TRIAL,
    };
};

export const commitMoodHandoff = (storage, token, handoff) => {
    const recovery = checkpointParticipantRecovery(storage);
    requireEvidence(storage.getItem('authToken') === token);
    validateMoodHandoff(handoff, storage.getItem('currentSessionID'), handoff.state === 'trial' ? 'continue' : 'complete');
    const {updates, route} = getMoodHandoffFlow(handoff);
    if (handoff.state === 'trial') {
        const session = handoff.session;
        const scope = {
            token, sessionId: session.session_id, phaseId: session.phase_id,
            phase: session.position, expiresAt: recovery?.expiresAt,
        };
        // Older clients could label this same backend session with another
        // local phase number. Recover its measured pending response as well.
        const phaseIds = [...new Set([session.phase_id, storage.getItem('currentPhaseID')].filter(validId))];
        const positions = [session.position, ...Object.values(PHASE).filter(phase => phase !== session.position)];
        let progress;
        for (const phase of positions) {
            for (const phaseId of phaseIds) {
                const saved = readTrialProgress(storage, {...scope, phase, phaseId});
                if (!saved) continue;
                const candidate = mergeMoodSessionProgress(saved, session);
                if (candidate.pendingSubmission && progress?.pendingSubmission) {
                    requireEvidence(sameSubmission(candidate.pendingSubmission, progress.pendingSubmission));
                }
                if (!progress || candidate.pendingSubmission) progress = candidate;
            }
        }
        progress ??= mergeMoodSessionProgress(null, session);
        // Save the recovered answers before committing the new current session.
        // An interruption can retry the same idempotent backend handoff.
        writeTrialProgress(storage, scope, progress);
    }
    commitParticipantFlow(storage, updates);
    return route;
};
