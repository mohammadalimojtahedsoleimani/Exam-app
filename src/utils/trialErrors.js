const collectMessages = (value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectMessages);
    if (value && typeof value === 'object') return Object.values(value).flatMap(collectMessages);
    return [];
};

const normalizeMessage = (message) => message
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[_\u200c-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const errorData = error => {
    const data = error?.response?.data;
    if (typeof data !== 'string') return data;
    try { return JSON.parse(data); } catch { return data; }
};

// Prefer the endpoint's primary diagnostic. A conflicting secondary message or
// an echoed request field must never turn a rejected answer into an acceptance.
const operationMessages = error => {
    const data = errorData(error);
    if (typeof data === 'string') return [data];
    const primary = [...collectMessages(data?.detail), ...collectMessages(data?.details)];
    if (primary.length) return primary;
    return [...collectMessages(data?.message), ...collectMessages(data?.error),
        ...collectMessages(data?.non_field_errors), ...collectMessages(data?.code)];
};

const matchesOperation = (error, expected) => {
    const data = errorData(error);
    for (const [field, value] of Object.entries(expected)) {
        if (value === undefined || value === null) continue;
        for (const source of [data, data?.detail, data?.details, data?.error]) {
            if (source && typeof source === 'object' && source[field] != null
                && String(source[field]) !== String(value)) return false;
        }
    }
    return true;
};

// Only an explicit duplicate-answer message on a 4xx response confirms that
// this cluster is safe to advance past. A conflict status alone is insufficient.
export const isAlreadySubmittedError = (error, clusterId) => {
    const status = Number(error?.response?.status);
    if (!(status >= 400 && status < 500)) return false;
    if (!matchesOperation(error, {cluster_id: clusterId})) return false;

    const messages = operationMessages(error);

    return messages.some(value => {
        const normalized = normalizeMessage(value);
        if (/[?؟]/.test(normalized)) return false;
        if (/\b(?:another|different|other|previous)\s+(?:cluster|trial|question)\b/.test(normalized)
            || /(?:خوشه|کلاستر|سؤال|سوال)\s*(?:دیگر|دیگری|قبلی)/.test(normalized)) return false;
        // Read each assertion independently, so "Answer already exists; you
        // cannot submit it again" still acknowledges the original answer.
        const clauses = normalized.split(/[.!?;\n؛،]+|,\s*(?:and|so|but)\b|\b(?:because|therefore|however)\b/);
        return clauses.some(raw => {
            const message = raw.trim();
            const hasRecordSubject = /\b(?:answer|result|response|submission)\b/.test(message);
            const hasAnswerSubject = hasRecordSubject || /\b(?:cluster|trial|question)\b/.test(message);
            const hasSavedAction = /\b(?:submitt?ed|answered|recorded|saved|stored|accepted|received|sent|provided|given|gave|responded)\b/.test(message)
                || (hasRecordSubject && /\b(?:registered|created)\b/.test(message));
            const hasNegatedAction = /(?:\b(?:not|never|cannot|failed|unable|unsuccessfully)\b|\b[a-z]+n['’]t\b)[^.!?;]{0,80}\b(?:submitt?ed|submit|answered|answer|recorded|record|saved|save|stored|store|accepted|accept|registered|received|sent|provided|responded|exists?|duplicate)\b/.test(message)
                || /\b(?:unsuccessfully|unsaved|unrecorded|unsubmitted|rejected)\b/.test(message)
                || /\bno\s+(?:(?:duplicate|previous|prior|existing|saved|recorded|submitted)\s+)*(?:answer|result|response|submission)\b/.test(message)
                || /\b(?:answer|result|response|submission)\b.{0,40}\b(?:missing|absent|not found)\b/.test(message)
                || /(?:ثبت|ارسال|ذخیره|دریافت)\s*(?:نشد|نگردید|نگرفت|نکرده)/.test(message)
                || /(?:وجود\s*(?:ندارد|نداشت)|تکراری\s*نیست)/.test(message);
            const uncertain = /\b(?:may|might|maybe|perhaps|possibly|probably|whether|if|unless|ensure|check|verify|should|must|shall|needs?|required|expected|will|would|could)\b/.test(message)
                || /(?:شاید|احتمالا|در\s*صورت|اگر|بررسی\s*کنید)/.test(message);
            if (hasNegatedAction || uncertain) return false;

            const previously = /\b(?:already|previously|earlier|before)\b|\bin the past\b/.test(message);
            if (previously && hasSavedAction && (hasAnswerSubject
                || /^(?:already|previously)\s+(?:been\s+)?(?:submitt?ed|answered|recorded|saved)$/.test(message))) return true;
            const existingRecord = /\bexists?\b|\bon\s+(?:file|record)\b|\bis\s+(?:already\s+)?present\b/.test(message)
                || /\b(?:has|contains)\s+(?:already\s+)?(?:an?\s+)?(?:answer|result|response|submission)\b/.test(message)
                || /\bthere\s+is\s+(?:already\s+)?(?:an?\s+)?(?:answer|result|response|submission)\b/.test(message);
            if (previously && hasRecordSubject && existingRecord) return true;
            if (/\bduplicate\b/.test(message) && hasRecordSubject) return true;

            return /(?:پاسخ|جواب|نتیجه)/.test(message)
                && (/(?:قبلا|پیش\s*تر|از\s*قبل|پیش\s*از\s*این|سابقا)/.test(message)
                    && /(?:ثبت|ارسال|داده|وجود|ذخیره|دریافت)/.test(message)
                    || /تکراری/.test(message));
        });
    });
};

export const isAlreadyCompletedError = (error, sessionId) => {
    const status = Number(error?.response?.status);
    if (!(status >= 400 && status < 500)) return false;
    if (!matchesOperation(error, {session_id: sessionId})) return false;
    return operationMessages(error).some(value => {
        const message = normalizeMessage(value);
        return (/\b(?:session|phase)\b/.test(message) && /\balready\b/.test(message)
            && /\bcompleted\b/.test(message) && !/(?:\b(?:not|never|no|cannot)\b|\b[a-z]+n['’]t\b)/.test(message))
            || (/(?:جلسه|مرحله)/.test(message) && /(?:قبلا|پیش\s*تر)/.test(message)
                && /(?:تکمیل|پایان)/.test(message) && !/(?:نشد|نیافت|نگردید)/.test(message));
    });
};

export const isAlreadySeenError = (error, sessionVideoId) => {
    const status = Number(error?.response?.status);
    if (!(status >= 400 && status < 500)
        || !matchesOperation(error, {session_video_id: sessionVideoId})) return false;
    return operationMessages(error).some(value => {
        const message = normalizeMessage(value);
        if (/(?:\b(?:not|never|no|cannot|false)\b|\b[a-z]+n['’]t\b)/.test(message)
            || /(?:نشد|نشده|نگردید|ندیده|نکرده|ندارد)/.test(message)) return false;
        return (/\bvideo\b/.test(message) && /\balready\b/.test(message)
            && /\b(?:seen|watched|viewed|completed)\b/.test(message))
            || /^already\s+(?:been\s+)?(?:seen|watched|viewed)[.!\s]*$/.test(message)
            || (/(?:ویدیو|ویدئو|فیلم)/.test(message) && /(?:قبلا|پیش\s*تر|از\s*قبل)/.test(message)
                && /(?:مشاهده|تماشا|دیده)/.test(message));
    });
};

export const getTrialErrorMessage = (error, fallbackMessage) => {
    const status = Number(error?.response?.status);

    if (error?.code === 'PARTICIPANT_RECOVERY_EXPIRED') {
        return 'مهلت ۱۲ ساعته بازیابی آزمون پایان یافته است. لطفاً برای شروع دوباره به صفحه ثبت‌نام برگردید.';
    }
    if (error?.code === 'TRIAL_PROGRESS_WRITE_FAILED') {
        return 'ذخیره پیشرفت آزمون در مرورگر انجام نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید و دوباره تلاش کنید.';
    }
    if (status === 401) {
        return 'اعتبار ورود شما پایان یافته است. لطفاً برای ادامه دوباره وارد شوید.';
    }
    if (status === 403) {
        return 'دسترسی به این بخش مجاز نیست. لطفاً با مسئول آزمون تماس بگیرید.';
    }
    if (status === 404) {
        return 'اطلاعات این بخش در سرور پیدا نشد. لطفاً با مسئول آزمون تماس بگیرید.';
    }
    if (status === 408 || status === 504 || error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        return 'زمان انتظار برای پاسخ سرور تمام شد. لطفاً دوباره تلاش کنید.';
    }
    if (status === 429) {
        return 'تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.';
    }
    if (status >= 500 && status < 600) {
        return 'سرور آزمون موقتاً پاسخ‌گو نیست. کمی بعد دوباره تلاش کنید.';
    }
    if (!error?.response && (error?.request || error?.code === 'ERR_NETWORK')) {
        return 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
    }

    return fallbackMessage;
};
