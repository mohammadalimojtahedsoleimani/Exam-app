export const createProbePhaseError = (code, message, phases, context = {}) => Object.assign(new Error(message), {
    code,
    ...context,
    // Include phase flags for diagnosis without participant credentials.
    phaseStates: Array.isArray(phases) ? phases.map(phase => ({
        id: phase?.id, name: phase?.name,
        is_allowed: phase?.is_allowed, is_passed: phase?.is_passed,
    })) : undefined,
});

export const getProbePhaseErrorMessage = error => {
    switch (error?.response?.data?.code ?? error?.code) {
        case 'MOOD_HANDOFF_CONFLICT':
            return 'انتقال به مرحله بعد هنوز تأیید نشده است. لطفاً دوباره تلاش کنید؛ اگر مشکل ادامه داشت با مسئول آزمایش تماس بگیرید.';
        case 'PROBE_EXPERIMENT_COMPLETE':
            return 'همه مراحل این شناسه قبلاً تکمیل شده‌اند. لطفاً با مسئول آزمایش تماس بگیرید.';
        case 'PROBE_PHASE_MISMATCH':
            return 'مرحله ذخیره‌شده با سوابق این شناسه هماهنگ نیست. لطفاً با مسئول آزمایش تماس بگیرید.';
        case 'PROBE_PHASE_UNAVAILABLE':
            return 'مرحله بعدی آزمون در دسترس نیست. لطفاً با مسئول آزمایش تماس بگیرید.';
        case 'PROBE_PHASE_AMBIGUOUS':
        case 'PROBE_PHASES_INVALID':
            return 'اطلاعات مراحل آزمون نیاز به بررسی دارد. لطفاً با مسئول آزمایش تماس بگیرید.';
        default:
            return null;
    }
};
