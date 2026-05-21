"use client";

import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { Textarea } from "@/components/ui/textarea";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/keywords/pool";
import { initialShuffle, reroll, type ShuffleState } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import { ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES } from "@/lib/validators/action-log";
import { submitActionLog } from "../_actions";
import { ActionResultDialog, type ActionResultVariant } from "./action-result-dialog";
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
const ACCEPT_ATTR = `${ALLOWED_PHOTO_MIME.join(",")},image/heic,image/heif,image/*`;

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
});

// F10 — 등록 실패 시 draft 보존 (PRD §4.4 "1시간 보관"). 사진은 보존 불가(직렬화 한계).
const DRAFT_TTL_MS = 60 * 60 * 1000;
const draftKey = (challengeId: string) => `withkey:action-draft:${challengeId}`;

type DraftState = {
  activityType: ActivityType;
  selected: string[];
  shuffle: ShuffleState;
  memo: string;
  memoOpen: boolean;
};

function loadDraft(challengeId: string): DraftState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(draftKey(challengeId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftState & { savedAt?: number };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.localStorage.removeItem(draftKey(challengeId));
      return null;
    }
    return {
      activityType: parsed.activityType,
      selected: parsed.selected,
      shuffle: parsed.shuffle,
      memo: parsed.memo,
      memoOpen: parsed.memoOpen,
    };
  } catch {
    window.localStorage.removeItem(draftKey(challengeId));
    return null;
  }
}

function saveDraft(challengeId: string, draft: DraftState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    draftKey(challengeId),
    JSON.stringify({ ...draft, savedAt: Date.now() }),
  );
}

function clearDraft(challengeId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(challengeId));
}

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

interface ResultState {
  open: boolean;
  variant: ActionResultVariant;
  currentDay?: number;
  totalDays?: number;
}

export function ActionForm({ challengeId }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>({ open: false, variant: "completed" });

  // F10 — 마운트 시 1회 draft 복원. localStorage 는 SSR 에서 접근 불가하므로
  // initial state 가 아닌 mount 후 hydration 단계에서 적용. 외부 영속 store 동기화 케이스.
  useEffect(() => {
    const draft = loadDraft(challengeId);
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-once localStorage hydration
    setActivityType(draft.activityType);
    setShuffle(draft.shuffle);
    setSelected(draft.selected);
    setMemo(draft.memo);
    setMemoOpen(draft.memoOpen);
    toast("이전 작성을 불러왔어요");
  }, [challengeId]);

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
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  const handleFile = useCallback(async (nextFile: File | null) => {
    if (!nextFile) {
      // F9 — picker 취소 / clear: 빈 상태 유지, 토스트 없음.
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
  }, []);

  function openCamera() {
    cameraInputRef.current?.click();
  }
  function openLibrary() {
    libraryInputRef.current?.click();
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
          // F10 — 실패 시 draft 보존 (사진 제외).
          saveDraft(challengeId, { activityType, selected, shuffle, memo, memoOpen });
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          console.error("[submitActionLog] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        clearDraft(challengeId);
        setResult({
          open: true,
          variant: res.data.isFirstAction ? "first-success" : "completed",
          currentDay: res.data.currentDay,
          totalDays: res.data.totalDays,
        });
      } catch (err) {
        console.error("[submitActionLog] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const busy = pending || preparing;

  // 사진 미선택 empty state — Fab(카메라) + 라이브러리 텍스트 링크 (모킹업 §10 진입 흐름).
  if (!file && !preview) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="flex flex-col items-center gap-1">
            <h2 className="t-h3">오늘의 운동을 인증하세요</h2>
            <p className="t-sub">사진 한 장으로 시작할 수 있어요</p>
          </div>
          <Fab onClick={openCamera} label="사진 찍기" icon={Camera} />
          <button
            type="button"
            onClick={openLibrary}
            className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded text-[12px] font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <ImageIcon className="size-3.5" aria-hidden="true" />
            사진에서 선택
          </button>
        </div>
        <HiddenPhotoInputs
          cameraRef={cameraInputRef}
          libraryRef={libraryInputRef}
          onChange={handleFile}
          disabled={busy}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {preview && (
          <div className="flex flex-col gap-2">
            <div className="bg-muted relative aspect-[16/9] w-full overflow-hidden rounded-[12px] border">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob preview is client-local */}
              <img
                src={preview}
                alt="사진 미리보기"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={clearPhoto}
                disabled={busy}
                aria-label="사진 제거"
                className="bg-background/85 text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <DiaryBotInfo />

        <fieldset className="flex flex-col gap-2">
          <legend className="t-caption">운동 종류</legend>
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
                    "min-h-10 flex-1 rounded-xl border py-2 text-[12px] font-semibold transition-colors",
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

        <section className="flex flex-col gap-2" aria-labelledby="keyword-heading">
          <div className="flex items-center justify-between">
            <h2 id="keyword-heading" className="t-caption">
              오늘의 일기 키워드{" "}
              <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
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
            className="text-muted-foreground focus-visible:ring-ring rounded text-left text-[12px] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-expanded={memoOpen}
            aria-controls="action-memo"
          >
            {memoOpen ? "✏️ 메모 접기" : "✏️ 직접 쓰고 싶어요"}
          </button>
          {memoOpen && (
            <Textarea
              id="action-memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value.slice(0, 100))}
              placeholder="자유롭게 남겨도 돼요 (0~100자)"
              className="min-h-20"
              maxLength={100}
            />
          )}
        </section>

        <Button
          size="lg"
          className="h-12"
          disabled={selected.length === 0 || busy}
          onClick={submit}
        >
          {pending ? "일기 쓰는 중..." : preparing ? "사진 준비 중..." : "등록하기"}
        </Button>
      </div>

      <HiddenPhotoInputs
        cameraRef={cameraInputRef}
        libraryRef={libraryInputRef}
        onChange={handleFile}
        disabled={busy}
      />

      <ActionResultDialog
        open={result.open}
        onOpenChange={(open) => setResult((prev) => ({ ...prev, open }))}
        variant={result.variant}
        challengeId={challengeId}
        currentDay={result.currentDay}
        totalDays={result.totalDays}
      />
    </>
  );
}

function DiaryBotInfo() {
  return (
    <Card tone="muted" padding="sm" className="border-transparent">
      <div className="flex items-start gap-2">
        <div
          aria-hidden="true"
          className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[12px]"
        >
          🤖
        </div>
        <p className="t-sub text-[12px] leading-relaxed">
          AI가 사진과 키워드를 보고 짧은 일기를 만들어요.
          <br />
          마음에 안 들면 키워드를 다시 뽑거나 메모로 직접 남길 수 있어요.
        </p>
      </div>
    </Card>
  );
}

function HiddenPhotoInputs({
  cameraRef,
  libraryRef,
  onChange,
  disabled,
}: {
  cameraRef: React.RefObject<HTMLInputElement | null>;
  libraryRef: React.RefObject<HTMLInputElement | null>;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT_ATTR}
        capture="environment"
        onChange={(event) => {
          void onChange(event.target.files?.[0] ?? null);
        }}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={(event) => {
          void onChange(event.target.files?.[0] ?? null);
        }}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
      />
      {disabled && (
        <span className="sr-only" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          사진 준비 중
        </span>
      )}
    </>
  );
}
