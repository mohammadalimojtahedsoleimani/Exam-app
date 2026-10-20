import { useEffect, useRef, useState } from 'react';
import { CaretRightOutlined, PauseOutlined } from '@ant-design/icons';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';
import poster from '../assets/signup-background-poster.jpg';
import './SignUpBackground.css';

const BACKGROUND_STREAM = 'https://stream.mux.com/kimF2ha9zLrX64H00UgLGPflCzNtl1T0215MlAmeOztv8.m3u8';

/** Decorative media is kept separate from the registration flow. */
const SignUpBackground = () => {
    const reduceMotion = usePrefersReducedMotion();
    const videoRef = useRef(null);
    const userPausedRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasFrame, setHasFrame] = useState(false);
    const [streamFailed, setStreamFailed] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || reduceMotion || streamFailed) return undefined;

        let disposed = false;
        let hls;
        let nativePlayback = false;
        let hlsRequested = false;

        const play = () => {
            if (disposed || userPausedRef.current || document.hidden) return;
            video.play().catch(() => {
                if (!disposed) setIsPlaying(false);
            });
        };
        const handlePlaying = () => {
            setHasFrame(true);
            setIsPlaying(true);
        };
        const handlePause = () => setIsPlaying(false);
        const fail = () => {
            if (!disposed) setStreamFailed(true);
        };
        const startHls = () => {
            if (disposed || hlsRequested) return;
            hlsRequested = true;
            nativePlayback = false;
            video.pause();
            video.removeAttribute('src');
            video.load();

            // Keep the streaming player out of the initial registration bundle.
            import('hls.js/light').then(({ default: Hls }) => {
                if (disposed) return;
                if (!Hls.isSupported()) {
                    fail();
                    return;
                }

                hls = new Hls({
                    capLevelToPlayerSize: true,
                    maxBufferLength: 12,
                    backBufferLength: 12,
                });
                hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(BACKGROUND_STREAM));
                hls.on(Hls.Events.MANIFEST_PARSED, play);
                hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) fail();
                });
                hls.attachMedia(video);
            }).catch(fail);
        };
        const handleError = () => {
            if (disposed) return;
            // Some browsers report native HLS support but cannot demux this
            // stream. Let the MediaSource player try before using the poster.
            if (nativePlayback) startHls();
            else if (hls) fail();
        };
        const handleVisibility = () => {
            if (document.hidden) video.pause();
            else play();
        };

        video.muted = true;
        video.addEventListener('canplay', play);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('pause', handlePause);
        video.addEventListener('error', handleError);
        document.addEventListener('visibilitychange', handleVisibility);

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            nativePlayback = true;
            video.src = BACKGROUND_STREAM;
            video.load();
            play();
        } else {
            startHls();
        }

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', handleVisibility);
            video.removeEventListener('canplay', play);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('error', handleError);
            hls?.destroy();
            video.pause();
            video.removeAttribute('src');
            video.load();
        };
    }, [reduceMotion, streamFailed]);

    const togglePlayback = () => {
        const video = videoRef.current;
        if (!video) return;

        if (isPlaying) {
            userPausedRef.current = true;
            video.pause();
        } else {
            userPausedRef.current = false;
            video.play().catch(() => setIsPlaying(false));
        }
    };

    const showVideo = hasFrame && !reduceMotion && !streamFailed;

    return (
        <>
            <div className="signup-background" aria-hidden="true">
                <img
                    className="signup-background__poster"
                    src={poster}
                    alt=""
                    decoding="async"
                    fetchPriority="high"
                />
                <video
                    ref={videoRef}
                    className={`signup-background__video${showVideo ? ' signup-background__video--ready' : ''}`}
                    poster={poster}
                    muted
                    loop
                    playsInline
                    preload="none"
                    disablePictureInPicture
                    disableRemotePlayback
                    tabIndex={-1}
                />
                <div className="signup-background__shade" />
            </div>
            {!reduceMotion && !streamFailed && (
                <button
                    className="signup-background__control"
                    type="button"
                    onClick={togglePlayback}
                    dir="rtl"
                >
                    {isPlaying ? <PauseOutlined aria-hidden="true" /> : <CaretRightOutlined aria-hidden="true" />}
                    <span>{isPlaying ? 'توقف پس‌زمینه' : 'پخش پس‌زمینه'}</span>
                </button>
            )}
        </>
    );
};

export default SignUpBackground;
