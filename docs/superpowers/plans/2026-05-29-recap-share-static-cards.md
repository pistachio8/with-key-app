# 정산 공유 카드(정적 2종) 구현 계획 — Phase 1a

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정산 페이지 "공유하기"를 루틴-흔적 정적 카드 **2종(사진형·티켓형) 토글**로 교체한다 — 계좌·실명·벌금 제거, 기간 표기, OG 게이팅 버그 수정.

**Architecture:** 기존 `/api/og/recap-card` Route Handler가 `?template=photo|ticket` 로 분기해 4:5(1080×1350) PNG를 렌더한다. 카드 데이터는 `fetchRecap`(그룹명·기간·인증일수·인원) + `fetchChallengePhotos`(대표 사진 1장)에서 온다. 클라이언트 `ShareCardAction`은 토글로 템플릿을 고르고 선택된 PNG를 `navigator.share({ files })`(미지원 시 다운로드)로 내보낸다. 디자인은 brainstorming 목업의 구도·타이포 위계를 최대한 유지하되, `next/og`가 지원하는 flex/absolute/gradient/이미지/단순 도형만 사용한다.

**Tech Stack:** Next.js 16 Route Handler · `next/og`(Satori) · React 19 client component · Vitest(jsdom).

> ⚠️ **Next.js 16 / Satori 제약 (필독)**: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md` 확인 결과 `ImageResponse`는 flexbox·absolute positioning·custom fonts·nested images를 지원하지만 CSS subset만 지원한다. `filter` · `mix-blend-mode` · `background-blend-mode` · `backdrop-filter` · CSS 애니메이션에 의존하지 않는다. 따라서 brainstorming 목업의 **실제 그레인·듀오톤 필터·하프톤 필터는 정적 카드에서 재현하지 않고**, Satori 호환 방식으로 흉내낸다: 따뜻한 반투명 overlay, 큰 면 분할, 점 패턴 도형, 절취선, 빅타이포, 기간 강조. `ImageResponse` 문서는 `ttf`/`otf`/`woff` 선호 및 `woff2` 미명시이므로 신규 폰트는 `ttf`만 추가한다. 기존 `public/fonts/PretendardVariable.woff2`는 현재 OG 라우트가 이미 쓰는 자산이라 재사용하되, Task 6 실제 렌더에서 tofu/weight 문제가 있으면 merge 전에 `Pretendard-Bold.ttf` 또는 `.otf`로 교체한다.

## 검토 결과 반영

- **목업 원본 파일 부재**: spec은 목업이 `.superpowers/brainstorm/<session>/content/`에 있다고 하지만 현재 워크트리에서 해당 파일을 찾지 못했다. 이 plan은 spec D2의 사진형/티켓형 설명을 시각 SoT로 삼고, 구현자는 Task 6에서 실제 PNG를 저장해 PR에 첨부한다.
- **폰트 계획 수정**: 기존 plan의 `Pretendard-Bold.woff2` 추가는 Next.js 16 `ImageResponse` 문서와 맞지 않는다. 신규 추가는 `Anton-Regular.ttf` + 라이선스 파일로 제한하고, Korean text는 기존 Pretendard 자산으로 렌더한다.
- **테스트 안정성 수정**: Route Handler 테스트는 `fetchChallengePhotos`와 `server-only`를 명시 mock하고, component 테스트는 `sonner`를 hoisted mock으로 고정한다. 실제 toast 구현에 spy를 걸면 환경별로 흔들릴 수 있다.
- **디자인 기준 명확화**: Task 2의 템플릿은 "평면 대체"가 아니라 **목업 구도 대체**다. 사진형은 풀블리드 사진+오버레이+하단 데이터바, 티켓형은 좌 사진+우 필드+절취선 스텁+바코드/점 패턴까지 포함해야 한다.

---

## 데이터 계약 (모든 태스크 공통)

`fetchRecap`(`src/lib/db/reads/recap.ts`)이 주는 `RecapView`에서 사용:

- `group?.name` → 그룹명 (fallback `"우리 그룹"`)
- `startAt` · `endAt` (ISO string | null) → 기간
- `viewerDoneCount: number` → "N일 인증"
- `members.length` → "M명 함께"
- `status: "active" | "closed"` → 게이팅(이미 `fetchRecap`이 closed 또는 active+만기만 반환)

대표 사진: `fetchChallengePhotos(challengeId)`(`src/lib/db/reads/challenge-photos.ts`) → `RecapPhotoView[]`(created_at 오름차순). **최신 1장** = 배열 마지막 요소의 `signedUrl`. 없으면 `null`(플레이스홀더).

**제외(절대 금지)**: 계좌(bankCode·accountHolder·accountNumberLast4) · 멤버 실명(displayName) · 벌금 금액. 카드에 넣지 않는다.

---

## File Structure

- **Create** `src/lib/share/period.ts` — `formatSharePeriod(startIso, endIso)` 순수 함수 (날짜 포맷 SoT, 테스트 대상)
- **Create** `src/lib/share/period.spec.ts` — 위 단위 테스트
- **Create** `src/app/api/og/recap-card/templates.tsx` — `renderPhotoCard(data)` · `renderTicketCard(data)` Satori JSX + 공통 타입 `CardData`
- **Add(asset)** `public/fonts/Anton-Regular.ttf` (+ `public/fonts/Anton-OFL.txt`) — 티켓형 숫자용 디스플레이 폰트(OFL 무료). `PretendardVariable.woff2`는 기존 자산 재사용
- **Create** `src/lib/share/hero-image.ts` — 티켓 사진 **`sharp` 네이비 듀오톤 → data URI**(`duotoneDataUrl`). 사진형은 자연색이라 미사용
- **Modify** `src/app/api/og/recap-card/route.tsx` — `template` 파라미터 분기 · 게이팅 수정 · 사진 fetch · 계좌/실명 제거 · 1080×1350
- **Modify** `src/app/api/og/recap-card/route.spec.ts` — 사진 mock 추가 · template/게이팅 테스트
- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — 토글 + 공유 + 로딩/에러
- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx` — 토글/공유 테스트
- **Modify** `src/app/(app)/challenge/[id]/recap/page.tsx` — `shareMessage` 문구 + `formatKRW` import 제거

---

## Task 1: 날짜 포맷 유틸 `formatSharePeriod`

**Files:**

- Create: `src/lib/share/period.ts`
- Test: `src/lib/share/period.spec.ts`

규칙: 같은 해 → `YYYY.M.D – M.D`, 해 넘김 → `YYYY.M.D – YYYY.M.D`, 한쪽이라도 null → `""`. 0 패딩 없음, en-dash 양쪽 공백(`–`). KST 기준(`Asia/Seoul`).

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/share/period.spec.ts
import { describe, it, expect } from "vitest";
import { formatSharePeriod } from "./period";

describe("formatSharePeriod", () => {
  it("같은 해 — YYYY.M.D–M.D", () => {
    expect(formatSharePeriod("2026-05-16T00:00:00+09:00", "2026-05-28T00:00:00+09:00")).toBe(
      "2026.5.16 – 5.28",
    );
  });
  it("해 넘김 — 양쪽 연도", () => {
    expect(formatSharePeriod("2025-12-28T00:00:00+09:00", "2026-01-10T00:00:00+09:00")).toBe(
      "2025.12.28 – 2026.1.10",
    );
  });
  it("null 입력 시 빈 문자열", () => {
    expect(formatSharePeriod(null, "2026-05-28T00:00:00+09:00")).toBe("");
    expect(formatSharePeriod("2026-05-16T00:00:00+09:00", null)).toBe("");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/share/period.spec.ts`
Expected: FAIL — "formatSharePeriod is not a function" (모듈 없음)

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/share/period.ts
const KST = "Asia/Seoul";

function parts(iso: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const p = fmt.formatToParts(new Date(iso));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** 공유 카드용 기간 표기. 같은 해는 연도 1회, 해 넘김은 양쪽. KST 기준. */
export function formatSharePeriod(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "";
  const s = parts(startIso);
  const e = parts(endIso);
  if (s.y === e.y) return `${s.y}.${s.m}.${s.d} – ${e.m}.${e.d}`;
  return `${s.y}.${s.m}.${s.d} – ${e.y}.${e.m}.${e.d}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/share/period.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/share/period.ts src/lib/share/period.spec.ts
git commit -m "feat(share): 공유 카드 기간 포맷 formatSharePeriod 추가"
```

---

## Task 2: OG 카드 템플릿 모듈 (사진형·티켓형)

**Files:**

- Create: `src/app/api/og/recap-card/templates.tsx`

Satori 지원 범위 내에서 목업의 구도를 최대한 보존한다. 두 함수 모두 `ReactElement` 반환. 색: 크림 `#FAF6EF` · 잉크 `#2A221C` · 테라코타 `#C2683D` · 서브 `#5E4838`.

**목업 일치 기준(Phase 1a에서 반드시 반영):**

- 사진형: 4:5 세로 카드에서 자연색 사진이 80% 이상을 차지한다. 상단 좌측 `from.with` pill, 사진 위 warm overlay, 하단 크림 데이터바, 기간 테라코타 강조, `N일 인증 · M명 함께` 보조라인. **전원 달성 시 우상단 테라코타 "전원 달성" 배지**(미달성 시 제외).
- 티켓형(이미지 I 기반): 크림 티켓 배경 안에 좌측 세로 **네이비 듀오톤 사진**(sharp 전처리), 우측 `ROUTINE/PERIOD/CREW` 필드(+ 전원 달성 시 `RESULT / 전원 달성`), 하단 **모던 dash 절취선**(양끝 라운드 캡 + 가는 선, `#C9C0B0`), 스텁의 `인증 N일` 빅타이포(Anton·테라코타) + 우하단 **진한 잉크 바코드** + `from.with`. 라벨·from.with = sub text `#8E8579`.
- Satori CSS `filter`/`mix-blend`는 쓰지 않는다. 티켓 사진 **듀오톤은 sharp 전처리**(`hero-image.ts`)로, 그 외 질감은 `rgba(...)` overlay·점/막대 `div`로 암시한다.
- 카드에는 `displayName`, 계좌, 벌금, "최종" 카피가 없어야 한다.

- [ ] **Step 1: 템플릿 모듈 작성**

```tsx
// src/app/api/og/recap-card/templates.tsx
import type { ReactElement } from "react";

export type CardData = {
  groupName: string;
  period: string; // formatSharePeriod 결과
  doneCount: number;
  crew: number;
  heroUrl: string | null;
  allAchieved: boolean; // 전원 달성 시에만 배지/RESULT 노출
};

const CREAM = "#FAF6EF";
const INK = "#2A221C";
const TERRA = "#C2683D";
const SUB = "#5E4838";
const SUBTEXT = "#8E8579"; // 가이드 sub text — 라벨·from.with(이미지 I 톤)
const DASHLINE = "#C9C0B0"; // 절취선(연한 웜그레이)

function wordmark(): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        left: 44,
        display: "flex",
        fontSize: 26,
        letterSpacing: 3,
        color: "#fff",
        background: "rgba(0,0,0,0.32)",
        padding: "10px 22px",
        borderRadius: 999,
      }}
    >
      from.with
    </div>
  );
}

function photoOverlay(): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        background:
          "linear-gradient(180deg, rgba(42,34,28,0.12) 0%, rgba(42,34,28,0.04) 54%, rgba(42,34,28,0.34) 100%)",
      }}
    />
  );
}

/** 사진형: 풀블리드 사진 + 하단 데이터바 */
export function renderPhotoCard(d: CardData): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: CREAM,
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", position: "relative", width: 1080, height: 1110 }}>
        {d.heroUrl ? (
          <img src={d.heroUrl} width={1080} height={1110} style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: "100%", height: "100%", background: TERRA }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "rgba(194,104,61,0.16)",
          }}
        />
        {photoOverlay()}
        {wordmark()}
        {d.allAchieved ? (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 44,
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              background: TERRA,
              padding: "10px 22px",
              borderRadius: 999,
            }}
          >
            전원 달성
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 56,
            bottom: 46,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 6 }}>ROUTINE TRACE</div>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 700, lineHeight: 1.02 }}>
            {d.doneCount} DAYS
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          padding: "0 60px",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: INK }}>
            {d.groupName}
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: TERRA }}>
            {d.period}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: SUB }}>
          {d.doneCount}일 인증 · {d.crew}명 함께
        </div>
      </div>
    </div>
  );
}

function field(label: string, value: string, color: string): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: SUBTEXT }}>{label}</div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function barcode(): ReactElement {
  // 이미지 I 처럼 진한 잉크(INK) 단색 얇은 바코드.
  const bars = [10, 4, 16, 6, 6, 18, 8, 12, 4, 20, 6, 10, 14, 4, 16, 8];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ display: "flex", width: w, height: 60, background: INK }} />
      ))}
    </div>
  );
}

/** 티켓형: 좌 사진 + 우 필드 + 절취선 + 스텁 */
export function renderTicketCard(d: CardData): ReactElement {
  // 모던 절취선 — 가는 dash + 양끝 라운드 캡(이미지 I). 연한 웜그레이.
  const dashes = Array.from({ length: 24 }, (_, i) => (
    <div
      key={i}
      style={{ display: "flex", width: 18, height: 3, borderRadius: 3, background: DASHLINE }}
    />
  ));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#FBF7EF",
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", height: 1090, padding: 64, gap: 48 }}>
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 380,
            borderRadius: 28,
            overflow: "hidden",
          }}
        >
          {d.heroUrl ? (
            <img src={d.heroUrl} width={380} height={962} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: 380, height: 962, background: TERRA }} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 48,
          }}
        >
          {field("ROUTINE", d.groupName, INK)}
          {field("PERIOD", d.period, TERRA)}
          {field("CREW", `${d.crew}명 함께`, INK)}
          {d.allAchieved ? field("RESULT", "전원 달성", TERRA) : null}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 40px" }}>
        <div
          style={{ display: "flex", width: 16, height: 16, borderRadius: 16, background: DASHLINE }}
        />
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between" }}>{dashes}</div>
        <div
          style={{ display: "flex", width: 16, height: 16, borderRadius: 16, background: DASHLINE }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 64px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: SUBTEXT }}>
            인증
          </div>
          <div style={{ display: "flex", fontSize: 110, fontFamily: "Anton", color: TERRA }}>
            {d.doneCount}일
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          {barcode()}
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, color: SUBTEXT }}>
            from.with
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 컴파일 확인**

Run: `pnpm typecheck`
Expected: PASS. 이 태스크엔 별도 단위 테스트 없음 — Satori 출력은 Task 6 dev 시각 검증으로 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/og/recap-card/templates.tsx
git commit -m "feat(og): 공유 카드 사진형·티켓형 템플릿 추가 (Satori flat)"
```

---

## Task 3: OG 라우트 — template 분기 · 게이팅 수정 · 계좌/실명 제거

**Files:**

- Modify: `src/app/api/og/recap-card/route.tsx` (전면 교체)
- Test: `src/app/api/og/recap-card/route.spec.ts`

핵심: ① `?template=photo|ticket`(기본 photo) ② `if (!recap)` 게이팅(기존 `recap.status !== "closed"` 제거) ③ `fetchChallengePhotos` 대표 사진 ④ 계좌/`BANK_NAMES` import 삭제 ⑤ 1080×1350 ⑥ 기존 Pretendard + 신규 Anton 폰트 등록.

**선행 — 폰트 파일 배치 (OFL 무료):**

```bash
curl --fail --location --output public/fonts/Anton-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf
curl --fail --location --output public/fonts/Anton-OFL.txt \
  https://github.com/google/fonts/raw/main/ofl/anton/OFL.txt
test -s public/fonts/Anton-Regular.ttf
test -s public/fonts/Anton-OFL.txt
```

> `ImageResponse` 문서는 `ttf`/`otf`/`woff` 를 명시하고 `woff2` 는 명시하지 않는다. 다만 현재 라우트가 이미 `PretendardVariable.woff2` 를 읽고 있으므로 이번 PR에서는 Korean text용 기존 자산을 그대로 재사용한다. 신규 자산은 Anton `ttf`만 추가한다. Task 6 렌더 검증에서 Pretendard가 tofu 또는 weight 문제를 보이면 이 PR 안에서 `Pretendard-Bold.ttf`/`.otf`를 커밋하고 `loadFont("Pretendard-Bold.ttf")`로 바꾼다.

**선행 — `src/lib/share/hero-image.ts` (sharp 네이비 듀오톤):**

```ts
// src/lib/share/hero-image.ts
import "server-only";
import sharp from "sharp";

/**
 * 티켓형 사진을 네이비 듀오톤으로 변환해 data URI 로 반환.
 * grayscale → navy tint(그림자=네이비, 하이라이트=옅은 네이비) 근사.
 * 실패(네트워크·디코드)면 null → 호출부에서 플레이스홀더 처리.
 */
export async function duotoneDataUrl(signedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const out = await sharp(input)
      .resize(760, 1924, { fit: "cover" }) // 카드 사진 영역 2x
      .grayscale()
      .tint({ r: 0x2a, g: 0x38, b: 0x55 }) // navy
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
```

> `sharp`(0.34.x)는 이미 의존성에 있다(ffmpeg spike 와 무관). OG 라우트(Node 런타임)에서 동작. 결과 data URI 는 Satori `<img src>` 로 바로 렌더된다. 실패 시 null → 티켓 템플릿이 플레이스홀더(테라코타) 표시.

- [ ] **Step 1: 라우트 테스트 먼저 수정 (실패 상태)**

```ts
// src/app/api/og/recap-card/route.spec.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("@/lib/db/reads/challenge-photos", () => ({
  fetchChallengePhotos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/share/hero-image", () => ({
  duotoneDataUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor() {
      super(new Blob(["png"], { type: "image/png" }), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
  },
}));

const { GET } = await import("./route");
const { createClient } = await import("@/lib/supabase/server");
const { fetchRecap } = await import("@/lib/db/reads/recap");

function authed() {
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  });
}
function buildReq(qs: string): Request {
  return new Request(`http://t/api/og/recap-card?${qs}`);
}
const RECAP = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  status: "closed" as const,
  startAt: "2026-05-16T00:00:00+09:00",
  endAt: "2026-05-28T00:00:00+09:00",
  durationDays: 14,
  viewerDoneCount: 12,
  members: [{ id: "u1", displayName: "민지", isMvp: false, achieved: true }],
  group: {
    id: "g1",
    name: "우리 헬스방",
    ownerId: "u1",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
  },
};

describe("GET /api/og/recap-card", () => {
  it("missing challengeId → 400", async () => {
    authed();
    const res = await GET(buildReq(""));
    expect(res.status).toBe(400);
  });
  it("미인증 → 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(401);
  });
  it("recap 없음 → 404", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(404);
  });
  it("active+만기 recap(status=active) → 200 (게이팅 수정)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue({ ...RECAP, status: "active" });
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });
  it("template=ticket → 200 image/png", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    const res = await GET(buildReq("challengeId=c1&template=ticket"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/app/api/og/recap-card/route.spec.ts`
Expected: FAIL — 현재 라우트는 `status==='active'` 면 404, `fetchChallengePhotos` 미mock 등으로 신규 케이스 실패.

- [ ] **Step 3: 라우트 구현 (전면 교체)**

```tsx
// src/app/api/og/recap-card/route.tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { formatSharePeriod } from "@/lib/share/period";
import { duotoneDataUrl } from "@/lib/share/hero-image";
import { renderPhotoCard, renderTicketCard, type CardData } from "./templates";

const fontCache: Record<string, ArrayBuffer | null> = {};
async function loadFont(file: string): Promise<ArrayBuffer | null> {
  if (file in fontCache) return fontCache[file];
  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts", file));
    fontCache[file] = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    fontCache[file] = null;
  }
  return fontCache[file];
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });
  const template = url.searchParams.get("template") === "ticket" ? "ticket" : "photo";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // fetchRecap 이 이미 'closed' 또는 'active+만기' 만 반환 → 추가 status 체크 불필요(게이팅 정합).
  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap) return NextResponse.json({ error: "not found" }, { status: 404 });

  const photos = await fetchChallengePhotos(challengeId, { client: supabase });
  const latest = photos.length > 0 ? photos[photos.length - 1].signedUrl : null; // 최신 1장
  // 티켓형 사진 = sharp 네이비 듀오톤(data URI), 사진형 = 자연색(signed URL 직접).
  const heroUrl = latest ? (template === "ticket" ? await duotoneDataUrl(latest) : latest) : null;
  const allAchieved = recap.members.length > 0 && recap.members.every((m) => m.achieved);

  const data: CardData = {
    groupName: recap.group?.name ?? "우리 그룹",
    period: formatSharePeriod(recap.startAt, recap.endAt),
    doneCount: recap.viewerDoneCount,
    crew: recap.members.length,
    heroUrl,
    allAchieved,
  };

  const [reg, anton] = await Promise.all([
    loadFont("PretendardVariable.woff2"),
    loadFont("Anton-Regular.ttf"),
  ]);
  const fonts = [
    reg ? { name: "Pretendard", data: reg, weight: 400 as const, style: "normal" as const } : null,
    reg ? { name: "Pretendard", data: reg, weight: 700 as const, style: "normal" as const } : null,
    anton ? { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  return new ImageResponse(template === "ticket" ? renderTicketCard(data) : renderPhotoCard(data), {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/app/api/og/recap-card/route.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add public/fonts/Anton-Regular.ttf public/fonts/Anton-OFL.txt src/lib/share/hero-image.ts src/app/api/og/recap-card/route.tsx src/app/api/og/recap-card/route.spec.ts
git commit -m "fix(og): 공유 카드 2종 분기·게이팅 정합·계좌/실명 제거·티켓 듀오톤 (1080x1350)"
```

---

## Task 4: ShareCardAction — 토글 + 공유 + 로딩/에러

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` (전면 교체)
- Test: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx` (전면 교체)

- [ ] **Step 1: 테스트 먼저 작성 (실패 상태)**

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
    );
  });

  it("기본(사진형) 공유 시 template=photo URL fetch + navigator.share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", { value: share, configurable: true });
    Object.defineProperty(global.navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareCardAction challengeId="c1" shareMessage="msg" />);
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/og/recap-card?challengeId=c1&template=photo"),
    );
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it("티켓형 토글 후 공유 시 template=ticket URL fetch", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:fake";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
    fireEvent.click(screen.getByRole("tab", { name: "티켓형" }));
    fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/og/recap-card?challengeId=c1&template=ticket",
      ),
    );
  });

  it("Web Share files 미지원 시 a[download] 폴백 + revokeObjectURL", async () => {
    Object.defineProperty(global.navigator, "canShare", { value: () => false, configurable: true });
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:fake";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ShareCardAction challengeId="c1" shareMessage="x" />);
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
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"`
Expected: FAIL — 현재 컴포넌트엔 "공유하기" 버튼·"티켓형" 탭 없음.

- [ ] **Step 3: 컴포넌트 구현 (전면 교체)**

```tsx
// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";

type Template = "photo" | "ticket";
type Props = { challengeId: string; shareMessage: string };

async function shareCard(challengeId: string, template: Template, text: string): Promise<void> {
  const qs = new URLSearchParams({ challengeId, template });
  const res = await fetch(`/api/og/recap-card?${qs.toString()}`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `recap-${challengeId}-${template}.png`, { type: "image/png" });

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

export function ShareCardAction({ challengeId, shareMessage }: Props) {
  const [template, setTemplate] = useState<Template>("photo");
  const [pending, setPending] = useState(false);

  async function onShare(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await shareCard(challengeId, template, shareMessage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("공유 카드 생성에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div
        className="bg-muted flex gap-1 rounded-full p-1"
        role="tablist"
        aria-label="공유 카드 종류"
      >
        {(["photo", "ticket"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={template === t}
            onClick={() => setTemplate(t)}
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition ${
              template === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t === "photo" ? "사진형" : "티켓형"}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={pending}
        className="bg-primary text-primary-foreground rounded-full py-3 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? "카드 만드는 중…" : "공유하기"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx" "src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx"
git commit -m "feat(recap): 공유 카드 사진형/티켓형 토글 + 로딩·에러 처리"
```

---

## Task 5: recap 페이지 — shareMessage 문구 정리

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx` (import 줄 + shareMessage 줄)

벌금 단정("종료! 최종 벌금") 제거. `formatKRW` import 도 제거(다른 사용처 없음). `totalPenalty` 계산·`MyPenaltyCard` 전달은 그대로(화면 내부 정산 표시용).

- [ ] **Step 1: import 제거**

`page.tsx` 에서 아래 줄 삭제:

```ts
import { formatKRW } from "@/lib/challenge/penalty";
```

- [ ] **Step 2: shareMessage 교체**

기존:

```ts
const shareMessage = `${recap.title} 종료! 최종 벌금 ${formatKRW(totalPenalty)} · with-key`;
```

교체:

```ts
const shareMessage = `${groupName} · ${recap.title}의 기록 · with-key`;
```

- [ ] **Step 3: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — `formatKRW` 미사용 에러 없음. `totalPenalty` 는 `MyPenaltyCard` 에서 계속 사용되므로 미사용 경고 없음.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/recap/page.tsx"
git commit -m "refactor(recap): 공유 문구에서 벌금 단정 제거"
```

---

## Task 6: 통합 검증 + 시각 확인 + 프라이버시 회귀

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 게이트**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: 전부 PASS.

- [ ] **Step 2: dev 시각 확인 (모바일 뷰포트)**

`pnpm dev` → 종료된 챌린지 recap 진입 → 사진형/티켓형 토글.
브라우저 직접 확인: `http://localhost:3000/api/og/recap-card?challengeId=<실제ID>&template=photo` / `&template=ticket`.
인증 쿠키가 필요한 라우트이므로 shell `curl`보다 로그인된 브라우저에서 직접 열어 확인한다. 두 PNG를 저장하거나 PR 설명에 스크린샷으로 첨부한다.
**Satori 레이아웃은 첫 렌더에서 여백·높이 미세 조정이 필요할 수 있음** — `templates.tsx` height/padding 을 보고 맞춘다(필요 시 새 커밋).

체크:

- [ ] 사진형: 사진 풀블리드 + 하단바(그룹명·기간·N일 인증·M명)
- [ ] 사진형 목업감: warm overlay + `ROUTINE TRACE`/`N DAYS` 빅타이포가 사진 위에 보이고, 하단 데이터바가 카드 아래쪽 18~20%에 정렬
- [ ] 티켓형: 좌 **네이비 듀오톤 사진**(sharp) + ROUTINE/PERIOD/CREW + **양끝 라운드 dash 절취선**(`#C9C0B0`) + 인증 N일(Anton·테라코타) + 우하단 **진한 잉크 바코드**·`from.with`(라벨·from.with `#8E8579`)
- [ ] 전원 달성/미달성 2상태: 전원 달성 시 사진형 우상단 "전원 달성" 배지 · 티켓형 RESULT 라인 노출 / 미달성 시 둘 다 제외
- [ ] 티켓형 목업감: "티켓"처럼 보이는 면 분할(좌 사진/우 필드/하단 스텁)이 명확하고, 카드 외곽과 내부 요소가 서로 겹치지 않음
- [ ] 사진 0장 그룹: 플레이스홀더(테라코타) + 텍스트 정상
- [ ] 기간 표기 `2026.5.16 – 5.28` 형태(en-dash 양쪽 공백)
- [ ] 폰트: 한글 정상(tofu 아님) + 그룹명/값이 충분히 굵게 보임 + 티켓 "12일" **Anton 디스플레이**로 렌더(normal 아님)

- [ ] **Step 3: 프라이버시 회귀 (필수)**

두 템플릿 PNG 어디에도 **계좌·멤버 실명** 없어야 한다. OG 디렉토리에 민감 필드 참조 0건 확인:

```bash
grep -REn "accountHolder|accountNumberLast4|bankCode|BANK_NAMES|displayName" src/app/api/og/recap-card/ || echo "OK: 민감정보 참조 없음"
```

Expected: `OK: 민감정보 참조 없음`

- [ ] **Step 4: 최종 커밋(시각 조정분 있으면)**

```bash
git add -A
git commit -m "fix(og): 공유 카드 레이아웃 시각 조정"
```

---

## Self-Review (작성자 점검 결과)

- **Spec 커버리지(Phase 1a)**: D2 정적 2종 ✔(Task 2·4) · D4 날짜 포맷 ✔(Task 1) · D6 게이팅 정합 ✔(Task 3) · 계좌/실명/벌금 제거 ✔(Task 2·3·5 + Task 6 회귀) · 4:5 ✔(Task 3).
- **Phase 1a 범위 밖(의도적 제외)**: 영상(Phase 1b) · `recap_shared` 계측(PO 승인) · SNS opt-in·멤버 opt-out(Phase 1c, migration+ADR). 키워드 TAG 는 채택 안 함(전원 달성 RESULT/배지로 대체).
- **Satori 제약**: Satori CSS `filter`/`mix-blend` 미사용. **티켓 사진 네이비 듀오톤은 `sharp` 서버 전처리**(`hero-image.ts`)로 처리(영상 spike 와 무관). 타이포는 Pretendard + Anton(`ttf`, OFL) 등록. 색: 라벨·from.with `#8E8579`, 절취선 `#C9C0B0`, 바코드 잉크. Task 6 렌더 검증.
- **조건부 표기**: `allAchieved`(전원 달성)만 사진형 배지 / 티켓형 RESULT 노출. 키워드 TAG 는 미사용(대체).
- **타입 일관성**: `CardData`(templates.tsx, `allAchieved` 포함) ↔ route.tsx 빌드 동일. `Template` 유니온 ↔ route `template`(`photo|ticket`) 일치. `RecapPhotoView.signedUrl` · `RecapMemberView.achieved` 사용 일치. `duotoneDataUrl` 시그니처 ↔ route import 일치.
- **알려진 리스크**: Satori 레이아웃 수치는 Task 6 dev 검증에서 미세 조정 필요.
