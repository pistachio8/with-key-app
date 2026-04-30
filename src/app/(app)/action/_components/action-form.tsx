"use client";

import { Camera, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/keywords/pool";
import { initialShuffle, reroll, type ShuffleState } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import { ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES } from "@/lib/validators/action-log";
import { submitActionLog } from "../_actions";
import { KeywordChipGroup } from "./keyword-chip-group";
import { RerollButton } from "./reroll-button";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
};

// iOS Safari gives file.type === "" for HEIC picks — extension fallback lets
// us accept those; prepareForUpload transcodes them to JPEG before submit.
const ACCEPTED_PHOTO_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const;

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
});

type Props = {
  challengeId: string;
};

function isAllowedFile(file: File): boolean {
  if (file.type) {
    if ((ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) return true;
    if (/^image\/hei[cf]$/i.test(file.type)) return true;
    return false;
  }
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_PHOTO_EXT.some((ext) => lowerName.endsWith(ext));
}

export function ActionForm({ challengeId }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function switchActivity(next: ActivityType) {
    setActivityType(next);
    setShuffle(initialShuffle(next));
    setSelected([]);
  }

  function clearPhoto() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(nextFile: File | null) {
    if (!nextFile) {
      clearPhoto();
      return;
    }
    if (nextFile.size > MAX_PHOTO_BYTES) {
      toast.error("사진은 5MB 이하만 올릴 수 있어요.");
      clearPhoto();
      return;
    }
    if (!isAllowedFile(nextFile)) {
      toast.error("지원하지 않는 이미지 형식이에요.");
      clearPhoto();
      return;
    }

    setPreparing(true);
    try {
      const prepared = await prepareForUpload(nextFile);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
    } finally {
      setPreparing(false);
    }
  }

  function submit() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("challengeId", challengeId);
        formData.append("activityType", activityType);
        formData.append("selectedKeywords", JSON.stringify(selected));
        formData.append("shownKeywords", JSON.stringify(shuffle.shown));
        formData.append("rerollCount", String(shuffle.rerollCount));
        if (memoOpen && memo) formData.append("memo", memo);
        if (file) formData.append("photo", file);

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
          console.error("[submitActionLog] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        toast.success(res.data.photoAttached ? "인증 완료!" : "사진 없이 인증됐어요");
        router.push("/home");
      } catch (err) {
        console.error("[submitActionLog] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const busy = pending || preparing;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">운동 종류</legend>
        <div role="radiogroup" aria-label="운동 종류" className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((type) => {
            const checked = activityType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => switchActivity(type)}
                className={cn(
                  "min-h-12 flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {ACTIVITY_LABELS[type]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="photo-heading">
        <div className="flex items-center justify-between">
          <h2 id="photo-heading" className="text-sm font-semibold">
            사진
          </h2>
          <span className="text-muted-foreground text-xs tabular-nums">최대 5MB</span>
        </div>
        <label
          htmlFor={fileInputId}
          aria-busy={preparing}
          className="bg-muted hover:bg-muted/80 focus-within:ring-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-offset-2"
        >
          {preparing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-4" aria-hidden="true" />
          )}
          {preparing ? "사진 준비 중..." : file ? "사진 바꾸기" : "사진 선택"}
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={`${ALLOWED_PHOTO_MIME.join(",")},image/heic,image/heif,image/*`}
          capture="environment"
          className="sr-only"
          aria-label="사진 선택"
          disabled={busy}
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
          }}
        />
        {preview && (
          <div className="flex flex-col gap-2">
            <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob preview is client-local */}
              <img
                src={preview}
                alt="사진 미리보기"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={clearPhoto}
              disabled={busy}
              className="text-muted-foreground focus-visible:ring-ring inline-flex w-fit items-center gap-1 rounded text-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-3.5" aria-hidden="true" />
              사진 제거
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="keyword-heading">
        <div className="flex items-center justify-between">
          <h2 id="keyword-heading" className="text-sm font-semibold">
            키워드 <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
          </h2>
          <RerollButton
            rerollCount={shuffle.rerollCount}
            onClick={() => setShuffle(reroll(shuffle))}
          />
        </div>
        <KeywordChipGroup shown={shuffle.shown} selected={selected} onChange={setSelected} />
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setMemoOpen((value) => !value)}
          className="text-muted-foreground focus-visible:ring-ring rounded text-left text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-expanded={memoOpen}
          aria-controls="action-memo"
        >
          {memoOpen ? "✏️ 메모 접기" : "✏️ 직접 쓰고 싶어요"}
        </button>
        {memoOpen && (
          <textarea
            id="action-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value.slice(0, 100))}
            placeholder="자유롭게 남겨도 돼요 (0~100자)"
            className="focus-visible:ring-ring min-h-24 rounded-xl border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            maxLength={100}
          />
        )}
      </section>

      <Button size="lg" className="h-12" disabled={selected.length === 0 || busy} onClick={submit}>
        {pending ? "일기 쓰는 중..." : preparing ? "사진 준비 중..." : "인증하기"}
      </Button>
    </div>
  );
}
