const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const PERSIAN_DECIMAL_SEPARATOR = '٫';

// Locale formatting is avoided on purpose: `toLocaleString('fa-IR')` falls back
// to latin digits whenever the runtime ships trimmed ICU data.
export const toPersianDigits = (value) => String(value ?? '')
    .replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)])
    .replace(/\./g, PERSIAN_DECIMAL_SEPARATOR);

export const formatPersianNumber = (value, fractionDigits = 0) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) return '—';

    return toPersianDigits(numeric.toFixed(fractionDigits));
};

// Keeps whole numbers clean (۸۸) and only shows a decimal when it carries data (۸۷٫۵).
export const formatPersianPercentValue = (value, maxFractionDigits = 1) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) return '—';

    const rounded = Number(numeric.toFixed(maxFractionDigits));
    return formatPersianNumber(rounded, Number.isInteger(rounded) ? 0 : maxFractionDigits);
};

export const PERSIAN_PERCENT_SIGN = '٪';
