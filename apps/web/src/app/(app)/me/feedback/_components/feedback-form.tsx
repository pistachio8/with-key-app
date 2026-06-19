"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  Bug,
  Check,
  ImagePlus,
  Info,
  MessageCircle,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALLOWED_PHOTO_MIME,
  FEEDBACK_CATEGORIES,
  MAX_FEEDBACK_PHOTOS,
  MAX_PHOTO_BYTES,
  type FeedbackCategory,
} from "@withkey/domain";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import { submitFeedback } from "../_actions";

// 분류별 메타 — 라벨·아이콘·가이드(helper)·placeholder. 카피는 작성 화면 SoT 그대로:
// docs/superpowers/specs/2026-06-18-feedback-redesign-compose.html
const CATEGORY_META: Record<
  FeedbackCategory,
  { label: string; Icon: LucideIcon; helper: ReactNode; placeholder: string }
> = {
  bug: {
    label: "버그 제보",
    Icon: Bug,
    helper: (
      <>
        <b className="text-foreground font-semibold">무엇이</b>,{" "}
        <b className="text-foreground font-semibold">언제·어디서</b> 일어났는지 적어주시면 빨리 고칠
        수 있어요.
      </>
    ),
    placeholder:
      "예) 챌린지 인증 화면에서 사진을 올리면 화면이 멈춰요. 어제 저녁 인증할 때 그랬어요.",
  },
  feature: {
    label: "기능 제안",
    Icon: Sparkles,
    helper: (
      <>
        어떤 상황에서 <b className="text-foreground font-semibold">무엇이 있었으면</b> 좋을지
        알려주세요.
      </>
    ),
    placeholder: "예) 친구를 챌린지에 초대할 때 카카오톡으로 바로 공유할 수 있으면 좋겠어요.",
  },
  other: {
    label: "기타",
    Icon: MessageCircle,
    helper: <>칭찬, 불편함, 문의 등 무엇이든 편하게 남겨주세요.</>,
    placeholder: "예) 앱을 잘 쓰고 있어요! 정산 영수증 디자인이 특히 마음에 들어요.",
  },
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
  // 완료 화면 recap 은 제출 시점 값으로 고정 — submit 이 photos 를 비우므로 미리 스냅샷.
  const [recap, setRecap] = useState<{ category: FeedbackCategory; photoCount: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 언마운트 cleanup 은 최신 photos 를 ref 로 본다 — 빈 deps closure 가 초기값만 잡는 stale 회피.
  // ref 갱신은 render 가 아닌 effect 에서(react-hooks/refs) — 마지막 commit 값이 언마운트 시 남는다.
  const photosRef = useRef<Picked[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
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
    setRecap(null);
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
      setRecap({ category, photoCount: photos.length });
      for (const p of photos) URL.revokeObjectURL(p.url);
      setPhotos([]);
      setDone(true);
    });
  }

  if (done) {
    const r = recap ?? { category, photoCount: 0 };
    return (
      <div
        className="flex flex-col items-center py-12 text-center"
        role="status"
        aria-live="polite"
      >
        {/* 완료 도장 — 기존 .animate-stamp-in 재사용(settlement-receipt 동형, reduced-motion 자동 무력화) */}
        <span className="animate-stamp-in bg-card ring-border mb-5 grid size-24 place-items-center rounded-full shadow-[0_18px_40px_-16px_var(--brand-success)] ring-1">
          <Check className="text-brand-success size-12" strokeWidth={3} aria-hidden="true" />
        </span>
        <p className="t-h2">전달됐어요</p>
        <p className="t-body text-muted-foreground mt-2 max-w-[30ch]">
          소중한 의견 감사합니다. 개발팀이 꼼꼼히 읽어볼게요.
        </p>
        <div className="border-border bg-card mt-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-2">
          <span className="bg-brand-primary-soft t-caption rounded-full px-2 py-0.5 font-bold text-[var(--brand-primary-deep)]">
            {CATEGORY_META[r.category].label}
          </span>
          <span className="t-caption text-foreground font-semibold">
            {r.photoCount > 0 ? `사진 ${r.photoCount}장 · 접수 완료` : "접수 완료"}
          </span>
        </div>
        {/* base-ui Button 은 asChild 미지원 — link-as-button 은 buttonVariants 패턴 (not-found.tsx 동형) */}
        <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2.5">
          <Link href="/me" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            마이페이지로 돌아가기
          </Link>
          <button
            type="button"
            onClick={resetForm}
            className="t-caption text-muted-foreground py-1"
          >
            하나 더 보내기
          </button>
        </div>
      </div>
    );
  }

  const submittable = body.trim().length > 0 && !pending && !preparing;
  const canAddMore = photos.length < MAX_FEEDBACK_PHOTOS;
  const activeMeta = CATEGORY_META[category];
  const bodyLen = body.length;
  const counterTone =
    bodyLen >= 980
      ? "text-brand-danger"
      : bodyLen >= 900
        ? "text-brand-warn"
        : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-5">
      {/* 분류 — 세그먼트 칩 (SoT: 드롭다운 대체) */}
      <div className="flex flex-col gap-2">
        <span className="t-caption text-muted-foreground">분류</span>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="건의 분류 선택">
          {FEEDBACK_CATEGORIES.map((c) => {
            const { label, Icon } = CATEGORY_META[c];
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-[14px] border-[1.5px] px-2 pt-3 pb-2.5 transition-all active:scale-[0.96]",
                  active
                    ? "border-primary bg-brand-primary-soft text-[var(--brand-primary-deep)] shadow-[0_6px_16px_-10px_var(--primary)]"
                    : "border-input bg-card text-muted-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={1.7} aria-hidden="true" />
                <span className="text-[13px] font-semibold tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
        {/* 카테고리별 동적 가이드 — 분류 전환 시 교체 */}
        <div
          className="bg-muted mt-0.5 flex items-start gap-1.5 rounded-[9px] px-3 py-2.5"
          role="status"
        >
          <Info
            className="mt-px size-[15px] shrink-0 text-[var(--brand-primary-deep)]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-[12.5px] leading-[1.45] font-medium">
            {activeMeta.helper}
          </p>
        </div>
      </div>

      {/* 내용 */}
      <div className="flex flex-col gap-2">
        <label htmlFor="feedback-body" className="t-caption text-muted-foreground">
          내용
        </label>
        <Textarea
          id="feedback-body"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          placeholder={activeMeta.placeholder}
          className="min-h-[168px]"
        />
        {/* 실시간 글자수 + 경고색 (900~979 warn / 980+ danger) */}
        <p className={cn("t-caption self-end tabular-nums", counterTone)}>
          {bodyLen} / {MAX_BODY}
        </p>
      </div>

      {/* 사진 (최대 3장) — 멀티 타일 그리드 */}
      <div className="flex flex-col gap-2">
        <span className="t-caption text-muted-foreground">
          사진 <span className="font-normal opacity-80">· 선택 · 최대 {MAX_FEEDBACK_PHOTOS}장</span>
        </span>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(92px,1fr))]">
          {photos.map((p, i) => (
            <div key={p.url} className="relative aspect-square">
              {/* 로컬 blob 미리보기 — next/image 최적화 대상 아님 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`첨부 사진 ${i + 1}`}
                className="border-border h-full w-full rounded-[14px] border object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`${i + 1}번 사진 제거`}
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
              aria-label="사진 추가"
              disabled={preparing}
              onClick={() => fileInputRef.current?.click()}
              className="border-primary/40 bg-brand-primary-soft/40 flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed text-[var(--brand-primary-deep)]"
            >
              <ImagePlus className="size-5" aria-hidden="true" />
              <span className="t-caption font-semibold">
                {preparing ? "처리 중" : `${photos.length}/${MAX_FEEDBACK_PHOTOS}`}
              </span>
            </button>
          )}
        </div>
        <p className="text-muted-foreground text-[11.5px] leading-[1.45] font-medium">
          문제 화면을 캡처해 첨부하면 더 빨리 확인할 수 있어요. JPG · PNG · WEBP · HEIC · 장당 5MB.
        </p>
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

      {/* 신뢰 안내 */}
      <div className="text-muted-foreground flex items-center gap-2.5 text-[12.5px] font-medium">
        <span className="bg-brand-success/10 text-brand-success grid size-[22px] shrink-0 place-items-center rounded-full">
          <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <span>
          보내면 <b className="text-foreground font-semibold">개발팀에게 바로 전달</b>돼요. 답변이
          필요하면 가입하신 이메일로 연락드려요.
        </span>
      </div>

      {/* 제출 — 풀폭 primary. 앱 셸의 fixed FAB(bottom-center, z-30)과 겹치지 않게
          SoT 의 하단 고정 바 대신 인라인 풀폭 버튼으로 적용. */}
      <Button type="button" className="h-12 w-full" disabled={!submittable} onClick={submit}>
        {pending ? "보내는 중..." : "보내기"}
      </Button>
    </div>
  );
}
