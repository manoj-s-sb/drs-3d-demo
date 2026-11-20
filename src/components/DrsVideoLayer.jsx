import { useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setVideoComplete } from "../store/slices/sessionSlice";
import {
  setDrsPhase,
  setDrsMarkerVisibility,
  setDrsVideoStarted,
} from "../store/slices/drsSlice";
import { getConfig } from "../drs/drsConfig";
import { isBroadcast } from "../viewMode";
import { sendProgress } from "../broadcastChannel";

// Phases in which the video overlay should be fully visible. Once the phase
// advances past these the overlay fades out smoothly.
const OVERLAY_PHASES = new Set(["video", "paused", "trajectory"]);
// Crossfade from the mp4 to the 3D (video → 3D). The 3D is already underneath,
// matched to the video's last frame (calibration), so this is a soft opacity blend
// that reads as one continuous shot. Tune here. 650 ms = calm, unnoticeable.
const FADE_MS = 650;
// HOLD the video fully opaque for a beat AFTER entering review, so the 3D (fading in
// underneath, behind the still-opaque video) is FULLY up before the video starts to fade
// out. Without this hold the two crossfade together and the half-transparent video briefly
// reveals the not-yet-opaque 3D → a black flash. Must be ≥ the 3D fade-in (ThreeScene
// CROSSFADE_MS = 500). So: review → [hold, 3D fades in] → video fades out over a solid 3D.
const FADE_HOLD_MS = 520;
const SAFETY_MS = 30000;

export default function DrsVideoLayer() {
  const { videoUrl } = useSelector((s) => s.session);
  const { active: drsActive, phase: drsPhase, videoFrames, paused, reviewPlan, reviewPaused, withVideo } =
    useSelector((s) => s.drs);
  const dispatch = useDispatch();

  const videoRef = useRef(null);
  const completedRef = useRef(false);
  const pitchShownRef = useRef(false);

  // Operator pause (Space): pause/resume the mp4 element in place. Only while the
  // video is actually the active phase and not already completed.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !drsActive) return;
    if (reviewPaused) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    } else if (
      drsPhase === "video" &&
      !completedRef.current &&
      el.currentTime > 0
    ) {
      // Resume only a video that was mid-play (not a cued/held first frame).
      el.play().catch(() => {});
    }
  }, [reviewPaused, drsActive, drsPhase]);
  const impactShownRef = useRef(false);
  // "visible" | "fading" | "hidden"
  const [fade, setFade] = useState("visible");

  const onVideoComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    const el = videoRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    dispatch(setDrsPhase("paused"));
    dispatch(setVideoComplete());
  };

  // Video setup keyed on drsPhase === "video" so that every `drsReplay`
  // re-triggers load() + listener attach, even when videoUrl is the same
  // string as the previous session.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl || !drsActive || drsPhase !== "video") return;

    // Live config (operator overrides via Settings, else defaults).
    const VIDEO_REPLAY_SPEED = getConfig("VIDEO_REPLAY_SPEED");
    const VIDEO_FPS = getConfig("VIDEO_FPS");
    const STOP_AFTER_IMPACT_FRAMES = getConfig("STOP_AFTER_IMPACT_FRAMES");

    // Start playback at the delivery (bowling) frame if provided, else frame 0.
    const startFrame = videoFrames?.start;
    const startTime =
      startFrame != null && VIDEO_FPS ? startFrame / VIDEO_FPS : 0;
    console.log("[drs-video] start plan →", {
      rule: reviewPlan?.ruleId ?? "(none)",
      bowlingFrameFromJson: startFrame ?? "null → start at 0",
      fps: VIDEO_FPS,
      targetStartSec: Number(startTime.toFixed(3)),
      videoUrl,
    });

    // Cued: load the video and hold it on the START frame until Play.
    if (paused) {
      const onLoaded = () => {
        dispatch(setDrsVideoStarted(true)); // first frame ready → hide loader
        try {
          el.pause();
          el.currentTime =
            startTime > 0 ? Math.min(startTime, el.duration || startTime) : 0;
        } catch {
          /* ignore */
        }
      };
      el.addEventListener("loadeddata", onLoaded);
      el.load();
      return () => el.removeEventListener("loadeddata", onLoaded);
    }

    completedRef.current = false;
    pitchShownRef.current = false;
    impactShownRef.current = false;
    el.playbackRate = VIDEO_REPLAY_SPEED;

    // Begin actual playback (marks ready → hides loader, reveals video).
    const beginPlayback = () => {
      dispatch(setDrsVideoStarted(true));
      console.log("[drs-video] ▶ playing", {
        rule: reviewPlan?.ruleId ?? "(none)",
        bowlingFrame: startFrame ?? "null",
        targetStartSec: Number(startTime.toFixed(3)),
        actualStartSec: Number((el.currentTime || 0).toFixed(3)),
        durationSec: Number((el.duration || 0).toFixed(3)),
      });
      el.playbackRate = VIDEO_REPLAY_SPEED;
      el.play().catch((err) =>
        console.warn("[drs-video] autoplay failed:", err),
      );
    };
    // After first frame is decoded: seek to the START frame, then play once the
    // seek lands (so the video reveals AT the delivery, never a frame-0 flash).
    const onSeeked = () => beginPlayback();
    const handleLoaded = () => {
      const t =
        startTime > 0 ? Math.min(startTime, el.duration || startTime) : 0;
      if (t > 0) {
        el.addEventListener("seeked", onSeeked, { once: true });
        try {
          el.currentTime = t;
        } catch {
          el.removeEventListener("seeked", onSeeked);
          beginPlayback();
        }
      } else {
        beginPlayback();
      }
    };
    const handleEnded = () => onVideoComplete();
    const handleError = (e) => {
      console.error("[drs-video] error:", e, el.error);
      onVideoComplete();
    };

    el.addEventListener("ended", handleEnded);
    el.addEventListener("error", handleError);
    // FAST PATH: if the video was already CUED (loaded + buffered while paused)
    // and its src hasn't changed, do NOT call load() again — that would re-fetch
    // and re-decode the whole file, causing a visible reload on Play. Instead just
    // seek + play the already-buffered element. readyState >= 2 (HAVE_CURRENT_DATA)
    // means at least the current frame is decoded and ready.
    const sameSrc =
      !!el.currentSrc &&
      (el.currentSrc === videoUrl || el.currentSrc.endsWith(videoUrl));
    const alreadyLoaded = el.readyState >= 2 && sameSrc;
    if (alreadyLoaded) {
      handleLoaded(); // seek to start + play, no re-fetch
    } else {
      el.addEventListener("loadeddata", handleLoaded);
      // Explicit load() re-fetches only when needed (first play without a cue, or
      // a different src) so we restart cleanly.
      el.load();
    }

    const safety = setTimeout(onVideoComplete, SAFETY_MS / VIDEO_REPLAY_SPEED);

    // Poll video.currentTime every frame and flip the pitch/impact marker
    // visibility the moment the video crosses the thresholds from
    // ball_coords.json (pitching_frame, impact_frame). Also stop the video
    // STOP_AFTER_IMPACT_FRAMES past impact_frame so the hand-off to the 3D
    // trajectory happens at the moment of impact rather than at EOF.
    const pitchTh = videoFrames?.pitching;
    const impactTh = videoFrames?.impact;
    // Outside leg (trajectory "none"): FREEZE the video EXACTLY at the pitching
    // frame (that's where the ball pitched outside leg — nothing after matters),
    // then hand off to the 3D. Every other ball plays the full delivery and stops
    // just after impact.
    const outsideLeg = reviewPlan?.trajectory === "none";
    const stopTh =
      outsideLeg && pitchTh != null
        ? pitchTh
        : impactTh != null && STOP_AFTER_IMPACT_FRAMES != null
          ? impactTh + STOP_AFTER_IMPACT_FRAMES
          : null;
    let raf = 0;
    const tick = () => {
      if (completedRef.current) return;
      const frame = el.currentTime * VIDEO_FPS;
      if (
        pitchTh != null &&
        !pitchShownRef.current &&
        frame >= pitchTh
      ) {
        pitchShownRef.current = true;
        dispatch(setDrsMarkerVisibility({ pitching: true }));
      }
      if (
        impactTh != null &&
        !impactShownRef.current &&
        frame >= impactTh
      ) {
        impactShownRef.current = true;
        dispatch(setDrsMarkerVisibility({ impact: true }));
      }
      if (stopTh != null && frame >= stopTh) {
        onVideoComplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      el.removeEventListener("loadeddata", handleLoaded);
      el.removeEventListener("ended", handleEnded);
      el.removeEventListener("error", handleError);
      el.removeEventListener("seeked", onSeeked);
      clearTimeout(safety);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, drsActive, drsPhase, videoFrames, paused, reviewPlan]);

  useEffect(() => {
    if (!drsActive) {
      setFade("visible");
      return;
    }
    if (OVERLAY_PHASES.has(drsPhase)) {
      setFade("visible");
      return;
    }
    // Entered review: keep the video fully visible for FADE_HOLD_MS (the 3D fades in behind
    // it), THEN fade the video out — so a solid 3D is always revealed, never black.
    const hold = setTimeout(() => {
      setFade((s) => (s === "visible" ? "fading" : s));
    }, FADE_HOLD_MS);
    const done = setTimeout(() => setFade("hidden"), FADE_HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(hold);
      clearTimeout(done);
    };
  }, [drsActive, drsPhase]);

  // Big screen only: report the video's real playback progress to the operator
  // so its broadcast monitor can show what's on air. Additive listeners — this
  // does NOT touch the playback logic above.
  useEffect(() => {
    if (!isBroadcast) return;
    const el = videoRef.current;
    if (!el) return;
    const VIDEO_FPS = getConfig("VIDEO_FPS");
    const STOP_AFTER_IMPACT_FRAMES = getConfig("STOP_AFTER_IMPACT_FRAMES");
    // Effective duration = up to where the DRS video actually STOPS (impact +
    // STOP_AFTER_IMPACT_FRAMES). The replay pauses there rather than playing to
    // EOF, so measuring against this makes the bar reach 100% exactly when the
    // segment completes instead of stalling at a fraction of the full file.
    const stopFrame =
      videoFrames?.impact != null && STOP_AFTER_IMPACT_FRAMES != null
        ? videoFrames.impact + STOP_AFTER_IMPACT_FRAMES
        : null;
    const effDur = () =>
      stopFrame != null && VIDEO_FPS
        ? stopFrame / VIDEO_FPS
        : Number.isFinite(el.duration)
          ? el.duration
          : 0;
    const post = (extra) => {
      const d = effDur();
      const done = !!el.ended || completedRef.current;
      sendProgress({
        currentTime: done ? d : Math.min(el.currentTime || 0, d || Infinity),
        duration: d,
        playing: !el.paused && !el.ended && !completedRef.current,
        ended: done,
        ...(extra || {}),
      });
    };
    const onTime = () => post();
    const onPlay = () => post();
    const onPause = () => post();
    const onEnded = () => post({ ended: true, playing: false });
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [videoUrl, drsActive, videoFrames]);

  // Keep the <video> element mounted for the entire DRS session (even when
  // faded out) so videoRef.current stays valid across renders. Otherwise the
  // setup effect above would see a null ref on re-trigger.
  if (!drsActive || !videoUrl) return null;
  // Operator turned the video overlay OFF → render no video; the 3D DRS (ball tracking +
  // review) plays underneath and is shown on its own.
  if (!withVideo) return null;

  const opacity = fade === "visible" ? 1 : 0;
  const visibility = fade === "hidden" ? "hidden" : "visible";

  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0, visibility }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full object-cover transition-opacity"
        style={{
          opacity,
          transitionDuration: `${FADE_MS}ms`,
          // Soft, symmetric blend (no linear "video dissolving" feel). The 3D sits
          // underneath already matched, so this reads as one continuous shot.
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        playsInline
        muted
        preload="auto"
        // Never let the browser pop its OWN native Picture-in-Picture for this video
        // (it auto-triggers when the video plays while the window is small/hidden —
        // that was the stray "second PiP"). Our PiP is the whole 3D window, not this.
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
      />
    </div>
  );
}
