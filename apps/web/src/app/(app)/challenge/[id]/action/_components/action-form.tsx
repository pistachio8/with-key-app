"use client";

import { AlertTriangle, Camera, Check, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { Textarea } from "@/components/ui/textarea";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import {
  ACTIVITY_TYPES,
  type ActivityType,
  initialShuffle,
  reroll,
  type ShuffleState,
  ALLOWED_PHOTO_MIME,
  MAX_PHOTO_BYTES,
} from "@withkey/domain";
import { cn } from "@/lib/utils";
import { prepareForUpload } from "@/lib/image/prepare-upload";
import {
  precheckPhotoFile,
  type PhotoPrecheckReason,
  type PhotoPrecheckResult,
} from "@/lib/verify/precheck";
import { submitActionLog } from "../_actions";
import { ActionResultDialog, type ActionResultVariant } from "./action-result-dialog";
import { KeywordChipGroup } from "./keyword-chip-group";
import { RerollButton } from "./reroll-button";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
  meal: "🥗 식단",
};

// iOS Safari gives file.type === "" for HEIC picks — extension fallback lets
// us accept those; prepareForUpload transcodes them to JPEG before submit.
const ACCEPTED_PHOTO_EXT = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const;
const ACCEPT_ATTR = `${ALLOWED_PHOTO_MIME.join(",")},image/heic,image/heif,image/*`;

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 인증할 수 있는 기간이 아니에요.",
});

const PRECHECK_REASON_LABELS: Record<PhotoPrecheckReason, string> = {
  blurry: "사진이 흐릿해 보여요",
  screenshot: "스크린샷처럼 보여요",
};

// F10 — 등록 실패 시 draft 보존 (PRD §4.4 "1시간 보관"). 사진은 보존 불가(직렬화 한계).
const DRAFT_TTL_MS = 60 * 60 * 1000;
const draftKey = (challengeId: string) => `withkey:action-draft:${challengeId}`;

type ShuffleByActivity = Partial<Record<ActivityType, ShuffleState>>;

type DraftState = {
  activityType: ActivityType;
  selected: string[];
  shuffleByActivity: ShuffleByActivity;
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
    // 활동별 shuffle 캐시 도입 전(단일 shuffle 필드) draft 는 무시 — POC 단방향.
    if (!parsed.shuffleByActivity || !parsed.shuffleByActivity[parsed.activityType]) {
      window.localStorage.removeItem(draftKey(challengeId));
      return null;
    }
    return {
      activityType: parsed.activityType,
      selected: parsed.selected,
      shuffleByActivity: parsed.shuffleByActivity,
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
  verifiedToday?: boolean;
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
  activityType?: ActivityType;
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
}

export function ActionForm({ challengeId, verifiedToday = false }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  // 활동별 shuffle 캐시 — 같은 활동으로 돌아왔을 때 키워드 셋과 rerollCount 가
  // 보존되어야 RerollButton 의 cap(5회)이 활동 토글로 우회되지 않는다.
  const [shuffleByActivity, setShuffleByActivity] = useState<ShuffleByActivity>(() => ({
    gym: initialShuffle("gym"),
  }));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<PhotoPrecheckResult | null>(null);
  const [precheckDismissed, setPrecheckDismissed] = useState(false);
  const [result, setResult] = useState<ResultState>({ open: false, variant: "completed" });

  // F10 + reset-on-reentry (spec 2026-05-29-action-form-reset-on-leave):
  // 최초 mount 는 기존과 동일(draft 있으면 복원). challengeId 가 바뀌면(재진입/교차
  // 챌린지) 입력 state 를 최초 상태로 리셋한 뒤 대상 챌린지 draft 가 있으면 그 위에
  // 복원한다(reset-then-apply). 사진은 직렬화 불가라 draft 에 없으므로 항상 비워진다.
  // setPreview(null) 은 아래 [preview] cleanup 을 태워 이전 blob 을 revoke 한다.
  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    const isReentry = hydratedForRef.current !== null && hydratedForRef.current !== challengeId;
    hydratedForRef.current = challengeId;
    const draft = loadDraft(challengeId);
    /* eslint-disable react-hooks/set-state-in-effect -- mount/re-entry localStorage hydration (reset-then-apply) */
    if (isReentry) {
      setFile(null);
      setPreview(null);
      setPrecheck(null);
      setPrecheckDismissed(false);
      setResult({ open: false, variant: "completed" });
      if (!draft) {
        setActivityType("gym");
        setShuffleByActivity({ gym: initialShuffle("gym") });
        setSelected([]);
        setMemo("");
        setMemoOpen(false);
      }
    }
    if (draft) {
      setActivityType(draft.activityType);
      setShuffleByActivity(draft.shuffleByActivity);
      setSelected(draft.selected);
      setMemo(draft.memo);
      setMemoOpen(draft.memoOpen);
      toast("이전 작성을 불러왔어요");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [challengeId]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // 현재 활동의 shuffle — 캐시에 항상 채워둠을 switchActivity / 초기 state /
  // draft 복원에서 보장하므로 fallback 은 안전 net 으로만 둔다.
  const shuffle = shuffleByActivity[activityType] ?? initialShuffle(activityType);

  function switchActivity(next: ActivityType) {
    setActivityType(next);
    setShuffleByActivity((prev) => {
      if (prev[next]) return prev;
      return { ...prev, [next]: initialShuffle(next) };
    });
    setSelected([]);
  }

  function rerollCurrent() {
    setShuffleByActivity((prev) => {
      const current = prev[activityType] ?? initialShuffle(activityType);
      return { ...prev, [activityType]: reroll(current) };
    });
  }

  function clearPhoto() {
    setFile(null);
    setPreview(null);
    setPrecheck(null);
    setPrecheckDismissed(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  function retakePhoto() {
    clearPhoto();
    window.setTimeout(() => cameraInputRef.current?.click(), 0);
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
    setPrecheck(null);
    setPrecheckDismissed(false);
    setPreparing(true);
    try {
      const [prepared, precheckResult] = await Promise.all([
        prepareForUpload(nextFile),
        precheckPhotoFile(nextFile),
      ]);
      setFile(prepared);
      setPrecheck(precheckResult);
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

  // 직접 입력 모드(spec 2026-05-28-action-manual-diary): 메모에 글이 있으면 AI 를 건너뛰고
  // 입력 글을 그대로 일기로 저장하며, 키워드 선택 없이 제출할 수 있다.
  const isDirect = memoOpen && memo.trim().length > 0;

  function submit() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("challengeId", challengeId);
        formData.append("activityType", activityType);
        formData.append("selectedKeywords", JSON.stringify(selected));
        formData.append("shownKeywords", JSON.stringify(shuffle.shown));
        formData.append("rerollCount", String(shuffle.rerollCount));
        if (isDirect) formData.append("memo", memo);
        if (file) formData.append("photo", file);

        const res = await submitActionLog(formData);
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          // F10 — 실패 시 draft 보존 (사진 제외). 활동별 shuffle 캐시 전체 저장.
          saveDraft(challengeId, {
            activityType,
            selected,
            shuffleByActivity,
            memo,
            memoOpen,
          });
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          console.error("[submitActionLog] ok=true but missing data.id", res);
          toast.error(FALLBACK_ERROR_MESSAGE);
          return;
        }
        clearDraft(challengeId);
        // EVAL-0049 안 A — 오늘 이미 인증한 뒤의 추가 피드(alreadyVerifiedToday)는 인증
        // 횟수가 늘지 않으므로 축하 모달 대신 toast 로 피드백하고 기존 모달과 같은 목적지
        // (챌린지 피드)로 이동한다. 첫 인증·목표 달성·그날 첫 카운트는 모달 유지.
        if (res.data.alreadyVerifiedToday) {
          toast("피드에 올렸어요");
          router.replace(`/challenge/${challengeId}`);
          return;
        }
        setResult({
          open: true,
          // 우선순위: goal-reached > first-success > completed
          variant: res.data.goalReached
            ? "goal-reached"
            : res.data.isFirstAction
              ? "first-success"
              : "completed",
          activityType,
          currentDay: res.data.currentDay,
          totalDays: res.data.totalDays,
          verifiedDays: res.data.verifiedDays,
          goalCount: res.data.goalCount,
        });
      } catch (err) {
        console.error("[submitActionLog] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const busy = pending || preparing;
  const activePrecheck = precheck?.shouldRetake && !precheckDismissed ? precheck : null;

  // 사진 미선택 empty state — Fab(카메라) + 라이브러리 텍스트 링크 (모킹업 §10 진입 흐름).
  if (!file && !preview) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="flex flex-col items-center gap-1">
            <h2 className="t-h3">오늘의 활동을 인증하세요</h2>
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
        {verifiedToday && (
          <Card
            tone="muted"
            padding="sm"
            className="border-transparent"
            role="status"
            aria-live="polite"
          >
            <p className="t-caption text-muted-foreground">
              오늘 이미 인증했어요. 추가로 올리는 피드는 기록되지만 인증 횟수는 늘지 않아요.
            </p>
          </Card>
        )}
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

        {activePrecheck && (
          <PhotoPrecheckAdvice
            result={activePrecheck}
            busy={busy}
            onRetake={retakePhoto}
            onContinue={() => setPrecheckDismissed(true)}
          />
        )}

        <DiaryBotInfo />

        <fieldset className="flex flex-col gap-2">
          <legend className="t-caption">활동 종류</legend>
          <div role="radiogroup" aria-label="활동 종류" className="flex flex-wrap gap-2">
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
          <div className={cn("flex items-center justify-between", isDirect && "opacity-50")}>
            <h2 id="keyword-heading" className="t-caption">
              오늘의 일기 키워드{" "}
              <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
            </h2>
            <RerollButton
              rerollCount={shuffle.rerollCount}
              onClick={rerollCurrent}
              disabled={isDirect}
            />
          </div>
          <KeywordChipGroup
            shown={shuffle.shown}
            selected={selected}
            onChange={setSelected}
            disabled={isDirect}
          />
          {isDirect && (
            <p className="text-muted-foreground text-[12px]" role="status">
              직접 작성 모드 — AI·키워드를 건너뛰고 입력한 글이 그대로 저장돼요.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMemoOpen((value) => !value)}
            className="text-muted-foreground focus-visible:ring-ring rounded text-left text-[12px] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            aria-expanded={memoOpen}
            aria-controls="action-memo"
          >
            {memoOpen ? "✏️ 직접 작성 접기" : "✏️ 직접 쓰고 싶어요"}
          </button>
          {memoOpen && (
            <Textarea
              id="action-memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value.slice(0, 150))}
              placeholder="직접 쓴 일기가 그대로 저장돼요 (1~150자)"
              className="min-h-20"
              maxLength={150}
            />
          )}
        </section>

        <Button
          size="lg"
          className="h-12"
          disabled={busy || (selected.length === 0 && !isDirect)}
          onClick={submit}
        >
          {pending
            ? isDirect
              ? "등록 중..."
              : "일기 쓰는 중..."
            : preparing
              ? "사진 준비 중..."
              : "등록하기"}
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
        activityType={result.activityType}
        currentDay={result.currentDay}
        totalDays={result.totalDays}
        verifiedDays={result.verifiedDays}
        goalCount={result.goalCount}
      />
    </>
  );
}

function PhotoPrecheckAdvice({
  result,
  busy,
  onRetake,
  onContinue,
}: {
  result: PhotoPrecheckResult;
  busy: boolean;
  onRetake: () => void;
  onContinue: () => void;
}) {
  return (
    <Card
      tone="muted"
      padding="sm"
      className="border-amber-200 bg-amber-50 text-amber-950"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="t-caption font-semibold">다시 찍는 게 좋아 보여요</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {result.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold"
                >
                  {PRECHECK_REASON_LABELS[reason]}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onRetake}>
            <Camera className="size-4" aria-hidden="true" />
            다시 찍기
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={onContinue}>
            <Check className="size-4" aria-hidden="true" />
            그대로 진행
          </Button>
        </div>
      </div>
    </Card>
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
          마음에 안 들면 키워드를 다시 뽑거나, 직접 써서 그대로 남길 수 있어요.
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
