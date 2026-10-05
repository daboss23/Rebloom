"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { IconAlert, IconCamera, IconCopy, IconSun, IconUpload } from "@/components/ui/Icons";
import { Label } from "@/components/ui/Typography";
import { failingChecks, toCaptureQuality, UPLOAD_PROBLEMS } from "@/lib/capture/gate";
import { boundingBox, cropAroundFace } from "@/lib/capture/metrics";
import { GATE } from "@/lib/capture/thresholds";
import type { CaptureQuality } from "@/lib/domain";
import { getLandmarker } from "./landmarker";
import { LiveCamera } from "./LiveCamera";
import { isInAppBrowser, measure, packLandmarks, renderShot } from "./measure";

export interface Shot {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  landmarks: [number, number][];
  quality: CaptureQuality;
}

type Phase =
  | { kind: "intro" }
  | { kind: "camera" }
  | { kind: "checking-upload" }
  | { kind: "upload-problem"; message: string }
  | { kind: "review"; shot: Shot }
  | { kind: "submitting"; shot: Shot }
  | { kind: "submit-failed"; shot: Shot; message: string };

const TIPS = [
  { icon: IconSun, text: "Face a window or bright, even light." },
  { icon: IconCamera, text: "Glasses off, hair back, and no makeup if you can." },
  { icon: IconCamera, text: "Hold your phone at eye level, about an arm's length away." },
];

export function CaptureFlow({ clinicSlug }: { clinicSlug: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [inApp, setInApp] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Feature detection has to run in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInApp(isInAppBrowser(navigator.userAgent));
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraUnavailable("The camera isn't available on this page. You can upload a photo instead.");
    }
  }, []);

  // Free the preview image when a shot is discarded.
  const shotUrl = phase.kind === "review" || phase.kind === "submitting" || phase.kind === "submit-failed" ? phase.shot.url : null;
  useEffect(() => () => void (shotUrl && URL.revokeObjectURL(shotUrl)), [shotUrl]);

  const chooseFile = () => fileInput.current?.click();

  async function onFile(file: File) {
    setPhase({ kind: "checking-upload" });
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const landmarker = await getLandmarker("IMAGE");
      const result = landmarker.detect(bitmap);
      if (result.faceLandmarks.length !== 1) {
        setPhase({ kind: "upload-problem", message: UPLOAD_PROBLEMS[result.faceLandmarks.length ? "multiple_faces" : "no_face"]! });
        return;
      }
      const facePx = boundingBox(result.faceLandmarks[0].map((p) => ({ x: p.x * bitmap.width, y: p.y * bitmap.height })));
      const crop = cropAroundFace(facePx, bitmap.width, bitmap.height);
      const m = measure(bitmap, bitmap.width, bitmap.height, crop, result, null, document.createElement("canvas"));
      const fails = failingChecks(m.metrics, { still: true });
      if (fails.length > 0 || !m.landmarks) {
        setPhase({ kind: "upload-problem", message: UPLOAD_PROBLEMS[fails[0]] ?? "This photo won't give a reliable result." });
        return;
      }
      const out = await renderShot(bitmap, crop, { mirror: false, shortSide: GATE.outputShortSide, quality: GATE.jpegQuality });
      setPhase({
        kind: "review",
        shot: {
          ...out,
          url: URL.createObjectURL(out.blob),
          landmarks: packLandmarks(m.landmarks, false),
          quality: toCaptureQuality(m.metrics, "upload", true),
        },
      });
    } catch {
      setPhase({ kind: "upload-problem", message: "We couldn't read that photo. Try a JPEG or PNG." });
    }
  }

  const onCapture = useCallback((shot: Shot) => setPhase({ kind: "review", shot }), []);

  async function submit(shot: Shot) {
    setPhase({ kind: "submitting", shot });
    try {
      const created = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clinicSlug,
          width: shot.width,
          height: shot.height,
          quality: shot.quality,
          landmarks: shot.landmarks,
        }),
      });
      if (!created.ok) throw new Error((await created.json().catch(() => null))?.error ?? "create");
      const { scanId, upload } = (await created.json()) as {
        scanId: string;
        upload: { url: string; method: "PUT"; headers: Record<string, string> };
      };
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: shot.blob });
      if (!put.ok) throw new Error("upload");
      const started = await fetch(`/api/scans/${scanId}/analyze`, { method: "POST" });
      if (!started.ok) throw new Error((await started.json().catch(() => null))?.error ?? "analyze");
      router.push(`/c/${clinicSlug}/processing?scan=${scanId}`);
    } catch (e) {
      const message =
        e instanceof Error && e.message && !["create", "upload", "analyze"].includes(e.message)
          ? e.message
          : "We couldn't send your photo. Check your connection and try again.";
      setPhase({ kind: "submit-failed", shot, message });
    }
  }

  return (
    <div className="pt-8 pb-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      {inApp && phase.kind !== "review" && <InAppNotice />}

      {phase.kind === "intro" && (
        <div className="reveal">
          <Label>Your photo</Label>
          <h1 className="t-h1 mt-4">One good photo is all it takes.</h1>
          <p className="t-body mt-5">
            We&apos;ll guide you, one small step at a time. The photo is taken when everything looks right, so your
            results are reliable.
          </p>
          <ul className="mt-10 border-t border-mist">
            {TIPS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-4 items-start py-4 border-b border-mist">
                <Icon className="mt-[2px] shrink-0 text-bronze" />
                <span className="t-body">{text}</span>
              </li>
            ))}
          </ul>
          {cameraUnavailable && <Notice>{cameraUnavailable}</Notice>}
          <div className="mt-10 space-y-3">
            {!cameraUnavailable && (
              <Button block onClick={() => setPhase({ kind: "camera" })}>
                Open the camera
              </Button>
            )}
            <Button block variant="secondary" onClick={chooseFile}>
              <IconUpload width={18} height={18} /> Upload a photo instead
            </Button>
          </div>
          <p className="t-caption mt-6 text-center">Your photo stays private. You can delete it from your report at any time.</p>
        </div>
      )}

      {phase.kind === "camera" && (
        <LiveCamera
          onCapture={onCapture}
          onUploadInstead={chooseFile}
          onUnavailable={(message) => {
            setCameraUnavailable(message);
            setPhase({ kind: "intro" });
          }}
        />
      )}

      {phase.kind === "checking-upload" && (
        <div className="py-24 text-center fade" role="status">
          <p className="t-h2">Checking your photo</p>
          <p className="t-body mt-3">Making sure it will give a reliable result.</p>
        </div>
      )}

      {phase.kind === "upload-problem" && (
        <div className="reveal">
          <Label>Your photo</Label>
          <h1 className="t-h2 mt-4">Let&apos;s try another photo.</h1>
          <Notice>{phase.message}</Notice>
          <p className="t-body mt-6">
            The best photos are taken straight on, in bright even light, with your whole face in view and nothing
            covering it.
          </p>
          <div className="mt-10 space-y-3">
            <Button block onClick={chooseFile}>
              Choose another photo
            </Button>
            {!cameraUnavailable && (
              <Button block variant="secondary" onClick={() => setPhase({ kind: "camera" })}>
                Use the camera instead
              </Button>
            )}
          </div>
        </div>
      )}

      {(phase.kind === "review" || phase.kind === "submitting" || phase.kind === "submit-failed") && (
        <div className="fade">
          <Label>Your photo</Label>
          <h1 className="t-h2 mt-4">{phase.kind === "submitting" ? "Sending your photo" : "Happy with this one?"}</h1>
          <div className="relative mt-6 aspect-[3/4] bg-mist overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={phase.shot.url} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
            {phase.shot.quality.passedGate && (
              <span className="absolute left-3 bottom-3 t-label !text-ink bg-porcelain/85 px-2 py-1">Quality checked</span>
            )}
          </div>
          {phase.kind === "submit-failed" && <Notice>{phase.message}</Notice>}
          <div className="mt-8 space-y-3">
            <Button block disabled={phase.kind === "submitting"} onClick={() => void submit(phase.shot)}>
              {phase.kind === "submitting" ? "Sending" : phase.kind === "submit-failed" ? "Try again" : "Use this photo"}
            </Button>
            <Button
              block
              variant="secondary"
              disabled={phase.kind === "submitting"}
              onClick={() => setPhase(phase.shot.quality.method === "upload" ? { kind: "intro" } : { kind: "camera" })}
            >
              Retake
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-6 flex gap-3 items-start border border-bronze/60 px-4 py-3 text-[14px] text-ink">
      <IconAlert className="shrink-0 mt-[1px] text-bronze" width={18} height={18} />
      <span>{children}</span>
    </p>
  );
}

function InAppNotice() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-8 border border-mist bg-mist/40 px-4 py-4">
      <p className="text-[14px] text-ink">For the camera to work, open this page in Safari or Chrome.</p>
      <p className="t-caption mt-1">In-app browsers often block the camera. Uploading a photo still works here.</p>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-2 min-h-11 text-[14px] text-ink underline underline-offset-4"
        onClick={async () => {
          await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
          setCopied(true);
        }}
      >
        <IconCopy width={16} height={16} /> {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
