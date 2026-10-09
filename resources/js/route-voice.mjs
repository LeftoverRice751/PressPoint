// Spoken guidance for the mobile route: a thin wrapper over the Web Speech
// API plus a screen wake lock.
//
// speechSynthesis rather than recorded clips: the phrases are generated
// ("In 20 meters, turn left"), the voices are on the phone so it keeps
// working on the offline-cached page, and there is no audio pipeline in this
// repo to ship clips through (see the chime note in mobile-route.js).
//
// What to say and when is decided in route-maneuvers.mjs; this only says it.

const STORAGE_KEY = 'presspoint.route.voice';

// The page is for LSPU's campus, so a Philippine English voice when the
// phone has one, else any English voice. The language was agreed as English
// only: fil-PH voices are missing on many phones, and the fallback would be
// an English voice reading Tagalog.
const pickVoice = (voices) => voices.find((v) => /^en[-_]PH/i.test(v.lang))
    || voices.find((v) => /^en[-_]US/i.test(v.lang))
    || voices.find((v) => /^en\b/i.test(v.lang))
    || null;

const readPreference = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
};

const writePreference = (on) => {
    try {
        if (on) localStorage.setItem(STORAGE_KEY, '1');
        else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        // Private mode / blocked storage: the toggle still works this visit.
    }
};

export function createRouteVoice() {
    const synth = window.speechSynthesis;
    const supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';

    let enabled = supported && readPreference();
    // Chrome and iOS Safari both refuse speak() until the page has had a
    // user gesture, so a preference restored from storage stays silent until
    // the first tap; prime() is that tap's job.
    let primed = false;
    let voice = null;

    if (supported) {
        voice = pickVoice(synth.getVoices());
        // The voice list loads asynchronously on Chrome; empty on first call.
        synth.addEventListener('voiceschanged', () => {
            voice = pickVoice(synth.getVoices()) || voice;
        });
    }

    // Mobile browsers stop delivering geolocation once the screen sleeps,
    // so without this the voice goes quiet the moment the phone is pocketed.
    let wakeLock = null;
    let wantWakeLock = false;
    const acquireWakeLock = () => {
        if (!wantWakeLock || wakeLock || !navigator.wakeLock) return;
        if (document.visibilityState !== 'visible') return;
        navigator.wakeLock.request('screen').then((lock) => {
            wakeLock = lock;
            lock.addEventListener('release', () => { wakeLock = null; });
            if (!wantWakeLock) lock.release().catch(() => {});
        }).catch(() => {});
    };
    const releaseWakeLock = () => {
        wantWakeLock = false;
        if (wakeLock) wakeLock.release().catch(() => {});
        wakeLock = null;
    };
    // The browser drops the lock whenever the tab is hidden; take it back.
    document.addEventListener('visibilitychange', acquireWakeLock);

    const speak = (text, { interrupt = false } = {}) => {
        if (!enabled || !text) return;
        // A turn prompt is only useful now. Never let one wait behind a
        // backlog: interrupting prompts cut in, others replace anything
        // still queued rather than lining up after it.
        if (interrupt || synth.pending) synth.cancel();
        const utterance = new window.SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.lang = (voice && voice.lang) || 'en-US';
        synth.speak(utterance);
    };

    const setEnabled = (on) => {
        enabled = supported && on;
        writePreference(enabled);
        if (enabled) {
            wantWakeLock = true;
            acquireWakeLock();
        } else {
            synth.cancel();
            releaseWakeLock();
        }
    };

    if (enabled) {
        wantWakeLock = true;
        acquireWakeLock();
    }

    return {
        supported,
        isEnabled: () => enabled,
        // Call from inside a tap handler: speaks `text` in that gesture,
        // which is what unlocks speech on iOS.
        toggle(text) {
            setEnabled(!enabled);
            primed = true;
            if (enabled) speak(text, { interrupt: true });
            return enabled;
        },
        // First tap anywhere, for a preference restored from storage.
        prime(text) {
            if (primed || !enabled) return;
            primed = true;
            speak(text, { interrupt: true });
        },
        speak,
        // Walk over: let the screen sleep again. Speech already queued (the
        // arrival line) is left to finish.
        release: releaseWakeLock,
    };
}
