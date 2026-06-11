"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  ALLOWED_PHOTO_MIME,
  FEEDBACK_CATEGORIES,
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

function isAllowedFile(file: File): boolean {
  if (!file.type) return false;
  if ((ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) return true;
  return /^image\/hei[cf]$/i.test(file.type);
}

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onPickPhoto(next: File | null) {
    if (!next) return;
    if (next.size > MAX_PHOTO_BYTES) {
      toast.error("사진은 5MB 이하만 올릴 수 있어요.");
      clearPhoto();
      return;
    }
    if (!isAllowedFile(next)) {
      toast.error("지원하지 않는 이미지 형식이에요.");
      clearPhoto();
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareForUpload(next);
      if (preview) URL.revokeObjectURL(preview);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
    } finally {
      setPreparing(false);
    }
  }

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("category", category);
      fd.append("body", body);
      if (file) fd.append("photo", file);

      const res = await submitFeedback(fd);
      if (!res.ok) {
        toast.error(
          res.error === "invalid_input"
            ? "입력 내용을 다시 확인해주세요."
            : "전송에 실패했어요. 잠시 후 다시 시도해주세요.",
        );
        return;
      }
      clearPhoto();
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
        <Link href="/me" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
          마이페이지로 돌아가기
        </Link>
      </div>
    );
  }

  const submittable = body.trim().length > 0 && !pending && !preparing;

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
        <span className="t-caption">사진 (선택)</span>
        {preview ? (
          <div className="relative w-fit">
            {/* 로컬 blob 미리보기 — next/image 최적화 대상 아님 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="첨부 사진 미리보기" className="max-h-48 rounded-lg" />
            <button
              type="button"
              onClick={clearPhoto}
              aria-label="사진 제거"
              className="bg-foreground/70 text-background absolute top-1.5 right-1.5 rounded-full p-1"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={preparing}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {preparing ? "사진 처리 중..." : "사진 첨부"}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button type="button" disabled={!submittable} onClick={submit}>
        {pending ? "보내는 중..." : "보내기"}
      </Button>
    </div>
  );
}
