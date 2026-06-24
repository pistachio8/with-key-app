"use client";

// 영상 인증 캡처·제출 (spec §C2 / EVAL-0043 Phase 2).
// 실시간 캡처 전용 — getUserMedia + MediaRecorder(최대 3초). 갤러리 업로드 UI 없음(각서 앱 신뢰 = 카메라 단 차단).
// 업로드·RPC 는 submitActionLog Server Action(mediaType=video)으로 일원화 — 사진과 done-count·완료 푸시를 공유한다.
// 카메라 상태머신은 penalty-proof-form.tsx 와 동형. 차이: 길이 3초 · 인증 결과 모달(ActionResultDialog).

import { Camera, Check, Loader2, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { submitActionLog } from "../_actions";
import { ActionResultDialog, type ActionResultVariant } from "./action-result-dialog";

const MAX_RECORD_MS = 3_000; // spec §C2 "실시간 3초 클립". 자동 정지 상한.

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
  invalid_input: "영상을 다시 확인해 주세요. (mp4·webm, 20MB 이하)",
});

type Phase = "idle" | "requesting" | "ready" | "recording" | "recorded";

// MediaRecorder 가 지원하는 mime 선택 — Safari=mp4, Chrome/FF=webm. 서버 ALLOWED_VIDEO_MIME 와 정합.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function extForMime(mime: string): "mp4" | "webm" {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

type Props = {
  challengeId: string;
  verifiedToday?: boolean;
};

interface ResultState {
  open: boolean;
  variant: ActionResultVariant;
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
}

export function VideoActionForm({ challengeId, verifiedToday = false }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResultState>({ open: false, variant: "completed" });

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // 언마운트 시 카메라·blob URL 정리(권한 해제·메모리 누수 방지).
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const requestCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("이 브라우저는 실시간 촬영을 지원하지 않아요.");
      return;
    }
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch {
      setPhase("idle");
      toast.error("카메라 권한이 필요해요. 권한을 허용한 뒤 다시 시도해 주세요.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      toast.error("녹화를 시작할 수 없어요.");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = extForMime(type);
      const file = new File([blob], `clip.${ext}`, { type: type.split(";")[0] });
      const url = URL.createObjectURL(blob);
      setRecordedFile(file);
      setRecordedUrl(url);
      setPhase("recorded");
      // 미리보기로 전환 — 라이브 스트림은 멈춰 카메라 표시등을 끈다.
      if (videoRef.current) videoRef.current.srcObject = null;
      stopStream();
    };
    recorder.start();
    setPhase("recording");
    stopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORD_MS);
  }, [stopRecording, stopStream]);

  const retake = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedFile(null);
    void requestCamera();
  }, [recordedUrl, requestCamera]);

  function submit() {
    if (!recordedFile) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("challengeId", challengeId);
        formData.append("mediaType", "video");
        formData.append("video", recordedFile);

        const res = await submitActionLog(formData);
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          console.error("[submitActionLog video] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        setResult({
          open: true,
          // 우선순위: goal-reached > first-success > completed (사진 경로와 동일).
          variant: res.data.goalReached
            ? "goal-reached"
            : res.data.isFirstAction
              ? "first-success"
              : "completed",
          currentDay: res.data.currentDay,
          totalDays: res.data.totalDays,
          verifiedDays: res.data.verifiedDays,
          goalCount: res.data.goalCount,
        });
      } catch (err) {
        console.error("[submitActionLog video] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const busy = pending;

  return (
    <div className="flex flex-col gap-4">
      {verifiedToday && (
        <Card
          tone="muted"
          padding="sm"
          className="border-transparent"
          role="status"
          aria-live="polite"
        >
          <p className="t-caption text-muted-foreground">
            오늘 이미 인증했어요. 추가로 올리는 클립은 기록되지만 인증 횟수는 늘지 않아요.
          </p>
        </Card>
      )}

      <div className="bg-foreground/95 relative aspect-[9/16] max-h-[60vh] w-full overflow-hidden rounded-2xl">
        {/* 라이브 프리뷰(녹화 전·중) — 녹화 완료 후엔 캡처본 재생으로 교체. */}
        {phase !== "recorded" ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            aria-label="실시간 미리보기"
          />
        ) : (
          recordedUrl && (
            <video
              src={recordedUrl}
              playsInline
              controls
              className="absolute inset-0 h-full w-full object-cover"
              aria-label="촬영한 인증 영상"
            />
          )
        )}

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white">
            <Camera className="size-10 opacity-90" aria-hidden="true" />
            <p className="t-body font-semibold">앱 카메라로 3초 인증</p>
            <p className="text-[12px] opacity-75">미리 찍어둔 영상은 올릴 수 없어요</p>
          </div>
        )}
        {phase === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="size-7 animate-spin" aria-hidden="true" />
          </div>
        )}
        {phase === "recording" && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
            <span className="bg-secondary size-2 animate-pulse rounded-full" aria-hidden="true" />
            녹화 중 · 3초
          </span>
        )}
      </div>

      {/* 컨트롤 — phase 별 버튼 분기. */}
      {phase === "idle" && (
        <Button size="lg" className="h-12" onClick={() => void requestCamera()}>
          <Camera className="size-4" aria-hidden="true" />
          촬영하기
        </Button>
      )}
      {phase === "requesting" && (
        <Button size="lg" className="h-12" disabled>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          카메라 준비 중...
        </Button>
      )}
      {phase === "ready" && (
        <Button size="lg" className="h-12" onClick={startRecording}>
          <span className="bg-secondary mr-1 size-3 rounded-full" aria-hidden="true" />
          녹화 시작
        </Button>
      )}
      {phase === "recording" && (
        <Button size="lg" variant="secondary" className="h-12" onClick={stopRecording}>
          <Square className="size-4" aria-hidden="true" />
          녹화 정지
        </Button>
      )}
      {phase === "recorded" && (
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-12" disabled={busy} onClick={submit}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {busy ? "등록 중..." : "이 영상으로 인증"}
          </Button>
          <Button size="lg" variant="outline" className="h-12" disabled={busy} onClick={retake}>
            <RotateCcw className="size-4" aria-hidden="true" />
            다시 찍기
          </Button>
        </div>
      )}

      <ActionResultDialog
        open={result.open}
        onOpenChange={(open) => setResult((prev) => ({ ...prev, open }))}
        variant={result.variant}
        challengeId={challengeId}
        currentDay={result.currentDay}
        totalDays={result.totalDays}
        verifiedDays={result.verifiedDays}
        goalCount={result.goalCount}
      />
    </div>
  );
}
