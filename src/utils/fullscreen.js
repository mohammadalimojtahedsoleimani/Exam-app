// Cross-browser wrappers around the Fullscreen API.
// The whole document element is used as the fullscreen target so that portalled
// UI (antd popups, react-toastify containers) stays visible while fullscreen.

const REQUEST_METHODS = [
    'requestFullscreen',
    'webkitRequestFullscreen',
    'webkitRequestFullScreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
];

const EXIT_METHODS = [
    'exitFullscreen',
    'webkitExitFullscreen',
    'mozCancelFullScreen',
    'msExitFullscreen',
];

const ELEMENT_KEYS = [
    'fullscreenElement',
    'webkitFullscreenElement',
    'mozFullScreenElement',
    'msFullscreenElement',
];

const ENABLED_KEYS = [
    'fullscreenEnabled',
    'webkitFullscreenEnabled',
    'mozFullScreenEnabled',
    'msFullscreenEnabled',
];

export const FULLSCREEN_CHANGE_EVENTS = Object.freeze([
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
]);

const getTarget = () => document.documentElement;

const pickMethod = (host, names) => names.find((name) => typeof host?.[name] === 'function');

export const isFullscreenSupported = () => {
    if (typeof document === 'undefined') return false;

    const hasRequest = Boolean(pickMethod(getTarget(), REQUEST_METHODS));
    const enabledKey = ENABLED_KEYS.find((key) => key in document);
    const isEnabled = enabledKey ? Boolean(document[enabledKey]) : true;

    return hasRequest && isEnabled;
};

export const getFullscreenElement = () => {
    if (typeof document === 'undefined') return null;

    const key = ELEMENT_KEYS.find((name) => document[name]);
    return key ? document[key] : null;
};

export const isFullscreenActive = () => Boolean(getFullscreenElement());

export const requestAppFullscreen = async () => {
    const target = getTarget();
    const method = pickMethod(target, REQUEST_METHODS);

    if (!method) {
        throw new Error('Fullscreen is not supported in this browser.');
    }

    // `navigationUI: hide` is ignored by browsers that do not know it.
    await target[method]({ navigationUI: 'hide' });
};

export const exitAppFullscreen = async () => {
    if (!isFullscreenActive()) return;

    const method = pickMethod(document, EXIT_METHODS);

    if (!method) {
        throw new Error('Fullscreen cannot be exited programmatically in this browser.');
    }

    await document[method]();
};
