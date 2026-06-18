"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  ALLOWED_PHOTO_MIME,
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_PHOTOS,
  MAX_PHOTO_BYTES,
  type FeedbackCategory,
} from "@withkey/domain";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import { submitFeedback } from "../_actions";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "버그 제보",
  feature: "기능 제안",
  other: "기타",
};

const MAX_BODY = 1000;
// HEIC/HEIF 는 입력으로 받고 prepareForUpload 가 JPEG 으로 변환한다 (action-form 과 동일).
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

type Picked = { file: File; url: string };

function isAllowedFile(file: File): boolean {
  if (!file.type) return false;
  if ((ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) return true;
  return /^image\/hei[cf]$/i.test(file.type);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 언마운트 cleanup 은 최신 photos 를 ref 로 본다 — 빈 deps closure 가 초기값만 잡는 stale 회피.
  const photosRef = useRef<Picked[]>([]);
  photosRef.current = photos;
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  async function onPickPhotos(list: FileList | null) {
    if (!list) return;
    const room = MAX_FEEDBACK_PHOTOS - photos.length;
    if (room <= 0) return;
    setPreparing(true);
    try {
      const next: Picked[] = [];
      for (const f of Array.from(list).slice(0, room)) {
        if (f.size > MAX_PHOTO_BYTES) {
          toast.error("사진은 5MB 이하만 올릴 수 있어요.");
          continue;
        }
        if (!isAllowedFile(f)) {
          toast.error("지원하지 않는 이미지 형식이에요.");
          continue;
        }
        const prepared = await prepareForUpload(f);
        next.push({ file: prepared, url: URL.createObjectURL(prepared) });
      }
      if (next.length > 0) setPhotos((prev) => [...prev, ...next]);
    } finally {
      setPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(i: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function resetForm() {
    for (const p of photos) URL.revokeObjectURL(p.url);
    setPhotos([]);
    setBody("");
    setCategory("bug");
    setDone(false);
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("category", category);
      fd.append("body", body);
      for (const p of photos) fd.append("photos", p.file);

      const res = await submitFeedback(fd);
      if (!res.ok) {
        toast.error(
          res.error === "invalid_input"
            ? "입력 내용을 다시 확인해주세요."
            : "전송에 실패했어요. 잠시 후 다시 시도해주세요.",
        );
        return;
      }
      for (const p of photos) URL.revokeObjectURL(p.url);
      setPhotos([]);
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="text-primary size-10" aria-hidden="true" />
        <p className="t-h2">전달됐어요</p>
        <p className="t-body text-muted-foreground">소중한 의견 감사합니다. 꼼꼼히 읽어볼게요.</p>
        {/* base-ui Button 은 asChild 미지원 — link-as-button 은 buttonVariants 패턴 (not-found.tsx 동형) */}
        <div className="mt-2 flex flex-col items-center gap-2">
          <Link href="/me" className={buttonVariants({ variant: "outline" })}>
            마이페이지로 돌아가기
          </Link>
          <button
            type="button"
            onClick={resetForm}
            className="t-caption text-muted-foreground underline"
          >
            하나 더 보내기
          </button>
        </div>
      </div>
    );
  }

  const submittable = body.trim().length > 0 && !pending && !preparing;
  const canAddMore = photos.length < MAX_FEEDBACK_PHOTOS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-category" className="t-caption">
          분류
        </label>
        <Select
          id="feedback-category"
          value={category}
          onValueChange={(v) => {
            if (v && (FEEDBACK_CATEGORIES as readonly string[]).includes(v)) {
              setCategory(v as FeedbackCategory);
            }
          }}
          items={CATEGORY_LABELS}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-body" className="t-caption">
          내용
        </label>
        <Textarea
          id="feedback-body"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          placeholder="불편했던 점이나 바라는 점을 적어주세요"
          className="min-h-36"
        />
        <p className="t-caption text-muted-foreground self-end">
          {body.length}/{MAX_BODY}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="t-caption">사진 (선택 · 최대 {MAX_FEEDBACK_PHOTOS}장)</span>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(92px,1fr))]">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square">
              {/* 로컬 blob 미리보기 — next/image 최적화 대상 아님 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`첨부 사진 ${i + 1}`}
                className="h-full w-full rounded-[14px] object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label="사진 제거"
                className="bg-foreground/70 text-background absolute top-1.5 right-1.5 rounded-full p-1"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <span className="bg-foreground/70 text-background t-caption absolute bottom-1.5 left-1.5 rounded px-1">
                {formatSize(p.file.size)}
              </span>
            </div>
          ))}
          {canAddMore && (
            <button
              type="button"
              data-testid="feedback-photo-add"
              disabled={preparing}
              onClick={() => fileInputRef.current?.click()}
              className="border-input text-muted-foreground flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed"
            >
              <ImagePlus className="size-5" aria-hidden="true" />
              <span className="t-caption">
                {preparing ? "처리 중" : `${photos.length}/${MAX_FEEDBACK_PHOTOS}`}
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          data-testid="feedback-photo-input"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void onPickPhotos(e.target.files)}
        />
      </div>

      <Button type="button" disabled={!submittable} onClick={submit}>
        {pending ? "보내는 중..." : "보내기"}
      </Button>
    </div>
  );
}
