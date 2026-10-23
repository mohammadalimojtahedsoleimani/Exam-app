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

// Only an explicit duplicate-answer message on a 4xx response confirms that
// this cluster is safe to advance past. A conflict status alone is insufficient.
export const isAlreadySubmittedError = (error) => {
    const status = Number(error?.response?.status);
    if (!(status >= 400 && status < 500)) return false;

    const data = error?.response?.data;
    const messages = [...collectMessages(data?.detail), ...collectMessages(data?.details)];

    return messages.some((value) => {
        const message = normalizeMessage(value);
        const hasAnswerSubject = /\b(?:answer|result|response|submission|cluster)\b/.test(message);
        const hasSavedAction = /\b(?:submitt?ed|answered|recorded|saved|registered|received)\b/.test(message);
        const hasNegatedAction = /(?:\b(?:not|never|cannot)\b|\b[a-z]+n['’]t\b)[^.!?;]{0,80}\b(?:submitt?ed|answered|recorded|saved|registered|received|exists?|duplicate)\b/.test(message)
            || /\bno\s+(?:duplicate\s+)?(?:answer|result|response|submission)\b/.test(message)
            || /(?:ثبت|ارسال)\s*(?:نشد|نگردید|نگرفت)/.test(message)
            || /وجود\s*(?:ندارد|نداشت)/.test(message);

        if (hasNegatedAction) return false;

        if (/\balready\b/.test(message)) {
            if (hasSavedAction && (hasAnswerSubject || /^already\s+(?:been\s+)?submitt?ed[.!\s]*$/.test(message))) {
                return true;
            }
            if (/\b(?:answer|result|response|submission)\b/.test(message) && /\bexists?\b/.test(message)) {
                return true;
            }
        }

        if (/\bduplicate\b/.test(message) && /\b(?:answer|result|response|submission)\b/.test(message)) {
            return true;
        }

        return /(?:پاسخ|جواب|نتیجه)/.test(message)
            && /(?:قبلا|پیش\s*تر|از\s*قبل|تکراری)/.test(message)
            && /(?:ثبت|ارسال|داده|وجود)/.test(message);
    });
};

export const isAlreadyCompletedError = (error) => {
    const status = Number(error?.response?.status);
    if (!(status >= 400 && status < 500)) return false;
    const data = error?.response?.data;
    return [...collectMessages(data?.detail), ...collectMessages(data?.details)].some(value => {
        const message = normalizeMessage(value);
        return (/\b(?:session|phase)\b/.test(message) && /\balready\b/.test(message)
            && /\bcompleted\b/.test(message) && !/(?:\b(?:not|never|no|cannot)\b|\b[a-z]+n['’]t\b)/.test(message))
            || (/(?:جلسه|مرحله)/.test(message) && /(?:قبلا|پیش\s*تر)/.test(message)
                && /(?:تکمیل|پایان)/.test(message) && !/(?:نشد|نیافت|نگردید)/.test(message));
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
