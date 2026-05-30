# 정산 공유 미리보기 패널 + 골드 아이콘 카드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정산(recap) 페이지 `ShareCardAction`의 형식 선택 UI를 pill 세그먼트에서 골드 아이콘 카드(radiogroup) + 4:5 실제 출력물 미리보기 패널로 바꾸고, 하단은 단일 `공유하기`(Share2) 버튼을 유지한다.

**Architecture:** 단일 client 컴포넌트(`share-card-action.tsx`) 안에서 처리한다. 형식 선택은 `role=radiogroup`/`radio`, 미리보기는 같은 파일의 내부 `SharePreview` 서브컴포넌트가 형식별 실제 OG 이미지(`<img>`)를 lazy 로 보여준다(영상은 사진형 poster + MP4 배지 재사용). 공유 동작(`navigator.share` → `a[download]` 폴백)은 현행 그대로 유지한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · lucide-react · Vitest + @testing-library/react (jsdom).

**Spec:** [`docs/superpowers/specs/2026-05-30-recap-share-preview-panel.md`](../specs/2026-05-30-recap-share-preview-panel.md)

---

## File Structure

- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx`
  - 책임: 형식 선택(radiogroup 골드 카드) + 미리보기 패널(`SharePreview`) + 단일 공유 버튼.
  - `SharePreview`는 같은 파일의 내부 컴포넌트로 둔다(공유 외 재사용처 없음, 한 화면 응집). 파일이 ~150줄 내라 분리하지 않는다.
- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`
  - 책임: 선택 UI(radio)·공유 동작·미리보기(src/배지/로딩/에러) 검증. 기존 tab 셀렉터를 radio 로 이관.

변경 없음: API 라우트(`/api/og/recap-card` · `/api/share/recap-clip`) · `templates.tsx` · Supabase · `page.tsx`(props 동일).

---

## Task 1: 테스트를 새 계약으로 교체 (RED)

기존 spec 은 `role=tab`/`사진형`/`티켓형` 을 검증한다. 새 계약(radio·미리보기 포함)으로 **파일 전체를 교체**한다. 구현 전이라 실패해야 한다.

**Files:**

- Test: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`

- [ ] **Step 1: spec 파일을 아래 내용으로 전체 교체**

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareCardAction } from "./share-card-action";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("ShareCardAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
    Object.defineProperty(global.navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: undefined, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("형식 3개 radio + 기본 선택 영상(clip)", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    const group = screen.getByRole("radiogroup", { name: "공유 형식" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "영상" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "사진" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "티켓" })).toHaveAttribute("aria-checked", "false");
  });

  it("공유 버튼은 단일 + 접근명 '공유하기'", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
  });

  it("기본(영상) 공유 시 recap-clip URL fetch + navigator.share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/share/recap-clip?challengeId=c1"),
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("사진 선택 후 공유 시 template=photo URL fetch (다운로드 폴백)", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/og/recap-card?challengeId=c1&template=photo"),
    );
  });

  it("티켓 선택 후 공유 시 template=ticket URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("radio", { name: "티켓" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=ticket",
      ),
    );
  });

  it("Web Share files 미지원 시 a[download] 폴백 + URL.revokeObjectURL 호출", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("radio", { name: "사진" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:fake"));
  });

  it("share 취소(AbortError) 시 toast.error 호출 안 함", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it("미리보기: 기본은 사진 poster(template=photo) 이미지 + lazy", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    const img = screen.getByAltText("사진형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("challengeId=c1");
    expect(img.getAttribute("src")).toContain("template=photo");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("미리보기: 로드 전 스켈레톤 노출", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    expect(screen.getByTestId("share-preview-skeleton")).toBeTruthy();
  });

  it("미리보기: 영상 선택 시 로드 후 MP4 배지", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.load(screen.getByAltText("사진형 공유 카드 미리보기"));
    expect(screen.getByText("MP4")).toBeTruthy();
  });

  it("미리보기: 티켓 선택 시 template=ticket 이미지 · MP4 배지 없음", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("radio", { name: "티켓" }));
    const img = screen.getByAltText("티켓형 공유 카드 미리보기");
    expect(img.getAttribute("src")).toContain("template=ticket");
    expect(screen.queryByText("MP4")).toBeNull();
  });

  it("미리보기: 로드 실패 시 fallback 문구 표시", () => {
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.error(screen.getByAltText("사진형 공유 카드 미리보기"));
    expect(screen.getByText("미리보기를 불러오지 못했어요")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm test -- share-card-action`
Expected: FAIL — `getByRole("radiogroup", ...)` 등에서 다수 실패(현재는 tablist/tab, 미리보기 없음).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"
git commit -m "test(recap): share-card-action 새 계약(radio·미리보기) 테스트로 교체"
```

---

## Task 2: 컴포넌트 구현 (GREEN)

`share-card-action.tsx` 를 **전체 교체**해 Task 1 테스트를 통과시킨다. 공유 로직(`shareCard`/`onShare`)은 현행 그대로 두고, 선택 UI·미리보기·버튼 아이콘만 바꾼다.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` (전체 교체)

- [ ] **Step 1: 파일을 아래 내용으로 전체 교체**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { useEffect, useState } from "react";
import { Check, Clapperboard, Image as ImageIcon, Play, Share2, Ticket } from "lucide-react";
import { toast } from "sonner";

type Template = "clip" | "photo" | "ticket";
type PreviewKind = "photo" | "ticket";
type Props = { challengeId: string; shareMessage: string };

const FORMATS: ReadonlyArray<{ value: Template; label: string; Icon: typeof Clapperboard }> = [
  { value: "clip", label: "영상", Icon: Clapperboard },
  { value: "photo", label: "사진", Icon: ImageIcon },
  { value: "ticket", label: "티켓", Icon: Ticket },
];

// 영상 미리보기는 사진형 카드를 poster 로 재사용 (스펙 D3)
const PREVIEW_KIND: Record<Template, PreviewKind> = {
  clip: "photo",
  photo: "photo",
  ticket: "ticket",
};
const PREVIEW_ALT: Record<PreviewKind, string> = {
  photo: "사진형 공유 카드 미리보기",
  ticket: "티켓형 공유 카드 미리보기",
};

function ogCardSrc(challengeId: string, kind: PreviewKind): string {
  return `/api/og/recap-card?${new URLSearchParams({ challengeId, template: kind }).toString()}`;
}

async function shareCard(challengeId: string, template: Template, text: string): Promise<void> {
  const isClip = template === "clip";
  const endpoint = isClip
    ? `/api/share/recap-clip?challengeId=${encodeURIComponent(challengeId)}`
    : `/api/og/recap-card?${new URLSearchParams({ challengeId, template }).toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `recap-${challengeId}-${template}.${isClip ? "mp4" : "png"}`, {
    type: isClip ? "video/mp4" : "image/png",
  });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({ files: [file], text });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SharePreview({ challengeId, template }: { challengeId: string; template: Template }) {
  const kind = PREVIEW_KIND[template];
  // 한 번 선택된 kind 의 <img> 는 mount 유지 → 전환 즉시·재fetch 0 (스펙 D3)
  const [seen, setSeen] = useState<ReadonlySet<PreviewKind>>(() => new Set([kind]));
  const [status, setStatus] = useState<Record<PreviewKind, "loading" | "loaded" | "error">>({
    photo: "loading",
    ticket: "loading",
  });

  useEffect(() => {
    setSeen((prev) => (prev.has(kind) ? prev : new Set(prev).add(kind)));
  }, [kind]);

  return (
    <div
      className="bg-muted relative mx-auto w-[160px] overflow-hidden rounded-xl"
      style={{ aspectRatio: "4 / 5" }}
    >
      {status[kind] === "loading" && (
        <div data-testid="share-preview-skeleton" className="absolute inset-0 animate-pulse" />
      )}
      {status[kind] === "error" && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-3 text-center text-[11px]">
          미리보기를 불러오지 못했어요
        </div>
      )}
      {(["photo", "ticket"] as const).map((k) =>
        seen.has(k) ? (
          // eslint-disable-next-line @next/next/no-img-element -- 인증 쿠키 필요한 same-origin OG 라우트 이미지를 그대로 표시 (스펙 D5)
          <img
            key={k}
            src={ogCardSrc(challengeId, k)}
            alt={PREVIEW_ALT[k]}
            loading="lazy"
            onLoad={() => setStatus((s) => ({ ...s, [k]: "loaded" }))}
            onError={() => setStatus((s) => ({ ...s, [k]: "error" }))}
            className={`absolute inset-0 size-full object-cover ${
              k === kind && status[k] === "loaded" ? "" : "hidden"
            }`}
          />
        ) : null,
      )}
      {template === "clip" && status[kind] === "loaded" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            MP4
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/90 shadow">
            <Play
              className="text-foreground size-4 translate-x-px"
              fill="currentColor"
              aria-hidden="true"
            />
          </span>
        </div>
      )}
    </div>
  );
}

export function ShareCardAction({ challengeId, shareMessage }: Props) {
  const [template, setTemplate] = useState<Template>("clip");
  const [pending, setPending] = useState(false);

  async function onShare(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await shareCard(challengeId, template, shareMessage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(
        template === "clip"
          ? "공유 영상 생성에 실패했어요. 다시 시도해 주세요."
          : "공유 카드 생성에 실패했어요. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <SharePreview challengeId={challengeId} template={template} />

      <div role="radiogroup" aria-label="공유 형식" className="mt-1 grid grid-cols-3 gap-2">
        {FORMATS.map(({ value, label, Icon }) => {
          const checked = template === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setTemplate(value)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-semibold transition-colors ${
                checked
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted"
              }`}
            >
              {checked && (
                <span className="bg-foreground absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full">
                  <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              <Icon className="size-[22px]" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void onShare()}
        disabled={pending}
        className="bg-primary text-primary-foreground flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-60"
      >
        <Share2 className="size-4" aria-hidden="true" />
        {pending ? (template === "clip" ? "영상 만드는 중..." : "카드 만드는 중...") : "공유하기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 테스트 실행 → 통과 확인**

Run: `pnpm test -- share-card-action`
Expected: PASS (11 tests).

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과(`no-img-element`는 라인 주석으로 무시됨). 실패 시 메시지대로 수정.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx"
git commit -m "feat(recap): 공유 선택 UI 골드 카드(radiogroup) + 4:5 미리보기 패널 + Share2 버튼"
```

---

## Task 3: 전체 검증 + 수동 확인

코드 회귀와 빌드를 확인하고, jsdom 으로 못 잡는 시각·플랫폼 동작을 수동 점검한다.

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 검증 명령**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: 모두 통과. `pnpm build`로 raw `<img>`·Next 16 client boundary 회귀 없음 확인.

- [ ] **Step 2: 모바일 뷰포트 수동 확인 (`pnpm dev` → DevTools 모바일, 종료된 챌린지 recap)**

확인 항목:

- 영상/사진/티켓 카드 탭 → 미리보기 즉시 전환(사진형 하단 크림 데이터바 · 티켓형 테라 빅넘버 · 영상 poster + `MP4` 배지). 선택 카드 = 골드, 비선택 = 흰/옅은 border. 미리보기↔카드 여백 확인.
- 같은 형식 재선택·영상↔사진 전환 시 Network 탭에서 이미지 재요청이 없거나 캐시 hit(서버 재렌더 0).
- 느린 네트워크(throttling)에서 4:5 스켈레톤 → 로드 후 교체, 레이아웃 점프(CLS) 0.
- `공유하기` 탭 → 모바일은 시스템 시트(이미지/비디오 저장 + 공유), 데스크톱은 파일 다운로드. 시트 취소 시 토스트 없음.
- 엣지: 사진 0장(TERRA 단색)·솔로(1명)·긴 그룹명에서 미리보기·카드 깨짐 없음.

- [ ] **Step 3: (해당 시) 후속 커밋**

수동 확인 중 수정이 생기면 동일 컴포넌트 범위로 커밋한다. 수정이 없으면 이 단계는 생략.

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx"
git commit -m "fix(recap): 공유 미리보기 수동 확인 반영"
```

---

## 후속 (이 PR 범위 밖, 선택)

- 부모 SoT [`2026-05-29-recap-share-redesign.md`](../specs/2026-05-29-recap-share-redesign.md) §D2 의 "토글(`role=tablist`)" 묘사를 "아이콘 카드(`radiogroup`) + 미리보기"로, 영상 Phase 1b 상태 배너를 코드 현실로 갱신.
- 미리보기 전용 축소 size 파라미터로 OG 렌더 비용 추가 절감.
