"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { failingChecks, instructionFor, toCaptureQuality, type CheckKey } from "@/lib/capture/gate";
import { portraitCrop, type Point } from "@/lib/capture/metrics";
import { GATE } from "@/lib/capture/thresholds";
import type { Shot } from "./CaptureFlow";
import { getLandmarker } from "./landmarker";
import { measure, packLandmarks, renderShot, type Measurement } from "./measure";

/** The face guide oval, in a 300 x 400 viewBox. Its width is 70% of the frame, matching the gate. */
const OVAL = { cx: 150, cy: 188, rx: 105, ry: 140 };

/** starting: waiting for the camera. loading: camera on, face guide still loading. */
type Status = "starting" | "loading" | "live" | "capturing";

export function LiveCamera({
  onCapture,
  onUploadInstead,
  onUnavailable,
}: {
  onCapture: (shot: Shot) => void;
  onUploadInstead: () => void;
  onUnavailable: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const latest = useRef<Measurement | null>(null);
  const capturing = useRef(false);
  const captureRef = useRef<() => Promise<void>>(async () => undefined);
  const [status, setStatus] = useState<Status>("starting");
  const [fails, setFails] = useState<CheckKey[]>(["no_face"]);
  const [hold, setHold] = useState(0);
  const [suggestUpload, setSuggestUpload] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const analysisCanvas = document.createElement("canvas");

    async function capture() {
      const video = videoRef.current;
      const m = latest.current;
      if (!video || !m?.landmarks || capturing.current) return;
      capturing.current = true;
      setStatus("capturing");
      const crop = portraitCrop(video.videoWidth, video.videoHeight);
      try {
        const out = await renderShot(video, crop, { mirror: true, shortSide: GATE.outputShortSide, quality: GATE.jpegQuality });
        onCapture({
          ...out,
          url: URL.createObjectURL(out.blob),
          landmarks: packLandmarks(m.landmarks, true),
          quality: toCaptureQuality(m.metrics, "camera", failingChecks(m.metrics).length === 0),
        });
      } catch {
        capturing.current = false;
        setStatus("live");
      }
    }
    captureRef.current = capture;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1920 } },
        });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        onUnavailable(
          name === "NotAllowedError"
            ? "Camera access is turned off. You can allow it in your browser settings, or upload a photo instead."
            : name === "NotFoundError"
              ? "We couldn't find a camera on this device. You can upload a photo instead."
              : "The camera couldn't start. You can upload a photo instead.",
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      // Show the camera straight away, even if the face guide is still on its way.
      setStatus("loading");

      let landmarker;
      try {
        landmarker = await getLandmarker("VIDEO");
      } catch {
        onUnavailable("The live guide couldn't load on this device. You can upload a photo instead.");
        return;
      }
      if (stopped) return;
      setStatus("live");

      let lastCheck = 0;
      let passSince: number | null = null;
      let previousCenter: Point | null = null;
      const loop = (t: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (capturing.current || t - lastCheck < 1000 / GATE.checksPerSecond || video.readyState < 2) return;
        lastCheck = t;
        const crop = portraitCrop(video.videoWidth, video.videoHeight);
        const result = landmarker.detectForVideo(video, performance.now());
        const m = measure(video, video.videoWidth, video.videoHeight, crop, result, previousCenter, analysisCanvas);
        previousCenter = m.center;
        latest.current = m;
        const f = failingChecks(m.metrics);
        setFails(f);
        if (f.length === 0) {
          passSince ??= t;
          const progress = Math.min(1, (t - passSince) / GATE.holdMs);
          setHold(progress);
          if (progress >= 1) void capture();
        } else {
          passSince = null;
          setHold(0);
        }
      };
      raf = requestAnimationFrame(loop);
    }

    void start();
    const uploadTimer = window.setTimeout(() => setSuggestUpload(true), GATE.suggestUploadAfterMs);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(uploadTimer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCapture, onUnavailable]);

  const ready = fails.length === 0;
  const instruction =
    status === "starting"
      ? "Starting the camera"
      : status === "loading"
        ? "Loading the face guide"
        : status === "capturing"
          ? "Got it"
          : instructionFor(fails);

  return (
    <div className="fade">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-[#0b1a24] shadow-[0_30px_60px_-30px_rgba(12,26,34,0.7)] ring-1 ring-white/60">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className="absolute inset-0 h-full w-full object-cover -scale-x-100"
        />
        <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
          <defs>
            <mask id="oval-cutout">
              <rect width="300" height="400" fill="white" />
              <ellipse {...OVAL} fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(12,26,34,0.5)" mask="url(#oval-cutout)" />
          <ellipse {...OVAL} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <ellipse
            {...OVAL}
            fill="none"
            stroke="var(--clinic-accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - hold}
            opacity={hold > 0 ? 1 : 0}
            transform={`rotate(-90 ${OVAL.cx} ${OVAL.cy})`}
            style={{ transition: "stroke-dashoffset 200ms linear" }}
          />
        </svg>
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/80" style={{ animation: "breathe 2.4s ease-in-out infinite" }}>
              Preparing the camera
            </span>
          </div>
        )}
      </div>

      <p aria-live="polite" className="mt-6 min-h-[3.5rem] text-center font-display text-[26px] font-light leading-tight text-ink">
        {instruction}
      </p>

      <div className="mt-4 space-y-3">
        <Button block disabled={!ready || status !== "live"} onClick={() => void captureRef.current()} className="!min-h-14 text-[16px]">
          Take photo
        </Button>
        <p className="t-caption text-center">The photo is taken for you once you&apos;ve held still for a second.</p>
        <div className="text-center">
          <Button
            variant="quiet"
            onClick={onUploadInstead}
            className={suggestUpload || fails.includes("resolution") ? "!text-ink" : "!text-text-3"}
          >
            {suggestUpload ? "Having trouble? Upload a photo instead" : "Upload a photo instead"}
          </Button>
        </div>
      </div>
    </div>
  );
}
