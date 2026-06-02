# 정산 공유 영상 클립 구현 계획 — Phase 1b

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정산 공유에 2~3초 MP4 "루틴 흔적" 클립을 추가한다 — 그룹 인증 사진을 Day 순 몽타주로 흐르게 하고, 마지막 정지 프레임은 Phase 1a 사진형 카드(`renderPhotoCard`)와 동일하게 만들어 poster/thumbnail로 재사용한다.

**Architecture:** 외부 영상 API 없이 자체 호스팅한다. Phase 1a 의 `src/app/api/og/recap-card/templates.tsx`(`renderPhotoCard` · `CardData`)와 폰트 로더를 재사용해 PNG **키프레임 N장**을 만들고(`new ImageResponse(el,{width:1080,height:1350,fonts}).arrayBuffer()`), `ffmpeg-static` 바이너리로 H.264 MP4(1080×1350)로 인코딩한다. 새 GET 라우트 `src/app/api/share/recap-clip/route.ts` 가 기존 OG 라우트와 **동일하게 `createClient()`+`getUser()` 인증 + `fetchRecap`(D6 게이팅 내장) + `fetchChallengePhotos`** 로 데이터를 모은다. 실행 위치는 1차 Vercel Node 함수. **Vercel 함수 unzip ≈250MB 한도·인코딩 타임아웃이 빠듯하므로 빌드 전 spike(Task 2~3)로 실현 가능성을 먼저 증명**하고, 못 맞추면 컨테이너 워커로 폴백한다(Task 13).

**Tech Stack:** Next.js 16 Route Handler(`runtime` 미선언 = Node.js 기본) · `ffmpeg-static`(H.264) · `next/og` `ImageResponse`(PNG 프레임, Satori) · `child_process.spawn` · Vitest(unit) · Vercel Preview(spike 실측).

> ⚠️ **인프라 리스크 (필독)**: Phase 1a(정적 카드)는 인프라 리스크가 없었지만 1b 는 다르다. `ffmpeg-static`(~70MB 네이티브 바이너리) + 프레임 적재가 Vercel 함수 unzip 250MB 한도에 들어가는지, 2~3초 인코딩이 함수 타임아웃 내 끝나는지가 **불확실**하다. 스펙 §D3·§Rollout 이 spike 통과를 빌드 전제로 못박았다. Task 2~3 의 게이트를 통과하기 전에는 Stage B(Task 4~12) 코드를 작성하지 않는다.

## 검토 결과 반영 (탐색으로 확정한 사실)

- **렌더 구조**: `_render/*` 서브디렉터리는 **없다**. 모든 카드 렌더는 단일 `src/app/api/og/recap-card/templates.tsx` — `export type CardData = { groupName; period; doneCount; crew; heroUrl: string|null; allAchieved }`, `export function renderPhotoCard(d: CardData): ReactElement`, `renderTicketCard(d)`. 팔레트 상수(CREAM/INK/TERRA/SUB/SUBTEXT/DASHLINE)는 모듈 내부 비공개 → 프레임에서 쓰려면 export 필요(Task 6).
- **공유 UI**: `recap-share-sheet.tsx` 등은 없다. 유일한 공유 UI 는 `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — `"use client"`, `ShareCardAction({ challengeId, shareMessage })`, 내부 `useState<Template>("photo")` 토글(사진형/티켓형) + `pending` + `shareCard()`. 영상은 **이 컴포넌트의 토글을 3종으로 확장**해서 붙인다(새 시트 신설 아님).
- **데이터**: `fetchRecap(viewerId, { challengeId })`(`src/lib/db/reads/recap.ts`)는 이미 `status='closed' OR (active AND end_at<=now)` 로 게이팅하므로 **D6 게이팅 정합은 fetchRecap 재사용만으로 자동 충족**(OG 라우트도 status 재검사 안 함). `RecapView` 에 사진 없음 → 사진은 `fetchChallengePhotos(challengeId, { client })` → `RecapPhotoView[]`(`signedUrl`, created_at **ASC = Day 순**).
- **폰트**: route.tsx 내부 비공개 `loadFont()` 가 `public/fonts/PretendardVariable.woff2`(400/700)·`Anton-Regular.ttf`(400)를 `node:fs` 로 읽는다. 클립 라우트가 재사용하려면 공유 모듈로 추출(Task 4).
- **ADR 번호**: 최고 0024 → 다음은 **0025**. Phase 1a 의 프라이버시/렌더 결정은 ADR 이 아니라 spec(`2026-05-29-recap-share-redesign.md`)에만 있다. (0029/0030/0031 같은 번호는 존재하지 않음.)
- **의존성**: `ffmpeg-static`·`fluent-ffmpeg`·`satori` 모두 없음. `sharp` 는 `^0.34.5` 이지만 **devDependencies** 에 있는데 서버 런타임(`hero-image.ts`)에서 import 된다(기존 잠재 리스크). → `ffmpeg-static` 은 반드시 **`dependencies`** 로 추가한다. `next.config.ts` 에 `serverExternalPackages`·`outputFileTracingIncludes` 없음(추가 필요), `cacheComponents: true` 존재.

## 데이터 계약 (모든 태스크 공통)

- 인증: 클립 라우트는 OG 라우트와 동일하게 `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();` → `!user` 면 401.
- 게이팅: `await fetchRecap(user.id, { challengeId })` → `null` 이면 404(closed/만기 외 차단 = D6 자동 정합).
- 카드 데이터: OG route.tsx 의 `CardData` 조립 로직을 그대로 따른다.
  - `groupName: recap.group?.name ?? "우리 그룹"`, `period: formatSharePeriod(recap.startAt, recap.endAt)`, `doneCount: recap.viewerDoneCount`, `crew: recap.members.length`, `allAchieved: recap.members.length>0 && recap.members.every(m=>m.achieved)`.
- 사진(몽타주): `await fetchChallengePhotos(challengeId, { client: supabase })` → `RecapPhotoView[]`(created_at ASC). 몽타주는 앞에서부터 Day 순, 엔드카드 `heroUrl` 은 OG 사진형과 동일하게 **마지막 1장**(`photos[photos.length-1].signedUrl`).
- **제외(절대 금지)**: 계좌(bankCode·accountHolder·accountNumberLast4) · 멤버 실명(displayName) · 벌금 금액. 어느 프레임에도 넣지 않는다.

## Decision Gate (가장 중요)

1. **Stage A — Spike (Task 1~3)**: ADR-0025 초안 + ffmpeg-static 적재/인코딩 실현 가능성 실측. **여기서 PASS/FAIL 게이트.**
2. **Stage B — Build (Task 4~12)**: Spike PASS 시에만. FAIL 시 Task 13(워커 폴백)로 분기.

**Spike 통과 기준 (셋 다):** (a) Vercel Node 함수 배포 unzip ≤ 250MB. (b) 2~3초 클립 인코딩이 함수 타임아웃(목표 < 60s) 내 완료. (c) 산출 MP4 가 iOS Safari · 카카오톡 인앱 · 인스타 스토리에서 재생·공유.

## File Structure

**신규**

- **Create** `docs/adr/0025-recap-share-clip-render-infra.md` — 영상 렌더 인프라 결정(자체 호스팅 ffmpeg-static, 외부 API 미사용, Vercel 1차 + 워커 폴백)
- **Create** `scripts/spike/recap-clip-encode.mjs` — spike 전용 로컬 인코딩 스크립트
- **Create** `src/app/api/share/recap-clip/route.ts` — MP4 렌더 GET 라우트(인증·게이팅·프레임·인코딩·에러)
- **Create** `src/app/api/share/recap-clip/storyboard.ts` — 비트 타이밍·프레임 시퀀스 순수 함수
- **Create** `src/app/api/share/recap-clip/storyboard.spec.ts` — storyboard 단위 테스트
- **Create** `src/app/api/share/recap-clip/frames.tsx` — 인트로·몽타주 프레임 컴포넌트(엔드카드는 `renderPhotoCard` 재사용)
- **Create** `src/app/api/share/recap-clip/encode.ts` — PNG 키프레임 → H.264 MP4(`ffmpeg-static` spawn)
- **Create** `src/app/api/share/recap-clip/route.spec.ts` — 라우트 인증·게이팅·에러 테스트(`og/recap-card/route.spec.ts` 패턴 재사용)
- **Create** `src/lib/share/og-fonts.ts` — `loadCardFonts()` 폰트 로더(route.tsx 에서 추출)

**수정**

- **Modify** `package.json` — `ffmpeg-static`(dependencies) 추가
- **Modify** `next.config.ts` — `serverExternalPackages: ["ffmpeg-static"]` + `outputFileTracingIncludes`
- **Modify** `src/app/api/og/recap-card/route.tsx` — 폰트 로딩을 `loadCardFonts()` 로 치환(DRY 추출)
- **Modify** `src/app/api/og/recap-card/templates.tsx` — 팔레트 상수 `export`(프레임 재사용)
- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — 토글 3종(영상/사진형/티켓형) + 영상 생성/공유/로딩/가드/AbortError
- **Modify** `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx` — 영상 분기 테스트
- **Modify** `src/app/(app)/challenge/[id]/recap/page.tsx` — 영상 poster 정합(필요 시), `shareMessage` 확인

**조건부(Phase 1c — PO 승인 후)**: `src/lib/analytics/track.ts` + `src/lib/analytics/schema.ts`(`recap_shared`), `supabase/migrations/*`(멤버 사진 opt-out 컬럼 + ADR).

---

## Stage A — Spike

## Task 1: ADR-0025 초안 (영상 렌더 인프라 결정)

스펙은 "새 렌더 인프라이므로 ADR 동반"을 명시한다. spike 결과 채우기 전 결정 골격을 먼저 만든다(Status: proposed).

**Files:**

- Create: `docs/adr/0025-recap-share-clip-render-infra.md`

- [ ] **Step 1: ADR scaffold 생성**

Run: `pnpm new adr recap-share-clip-render-infra`
Expected: `docs/adr/0025-recap-share-clip-render-infra.md` 생성(최고 0024 → 0025). 다른 번호면 그 번호를 따른다.

- [ ] **Step 2: 본문 작성** (템플릿 섹션에 맞춰)

```markdown
## Context

정산 공유에 "루틴 흔적" 영상(2~3초 MP4)을 추가한다. 외부 영상 API(Shotstack/Creatomate/Cloudinary)는 렌더당 과금 + 멤버 사진 제3자 유출로 프라이버시 원칙(spec 2026-05-29-recap-share-redesign §D1)과 충돌. Remotion 은 headless Chromium 필요로 Vercel 함수 불가 + 상용 라이선스 확인 필요.

## Decision

자체 호스팅. Phase 1a `templates.tsx`(`renderPhotoCard`) 재사용해 PNG 키프레임 → `ffmpeg-static`(H.264) MP4(1080×1350). 1차 Vercel Node 함수(`runtime` 미선언=nodejs). spike 통과를 빌드 전제로 한다.

## Alternatives Considered

1. 외부 영상 API — Pros: 인프라 0. Cons: 렌더당 과금 + 멤버 사진 유출. Why not: POC 프라이버시.
2. Remotion(Lambda/워커) — Pros: React 재사용. Cons: Chromium·AWS·라이선스. Why not: 1차 제외(폴백 후보).
3. 클라이언트 WebCodecs/MediaRecorder — Pros: 서버비 0. Cons: iOS Safari·카톡 인앱 호환 위험. Why not: 비채택.

## Consequences

- 긍정: 외부 과금 0, 멤버 사진 제3자 미유출, 카드 렌더 코드 재사용.
- 부정/비용: Vercel 함수 unzip ≈250MB 한도·인코딩 타임아웃 리스크. `ffmpeg-static` 을 `dependencies` 로 + `outputFileTracingIncludes` 필요.
- 후속: spike(Task 3) 통과 시 accepted. 초과 시 컨테이너 워커 폴백으로 갱신(Task 13).

## Spike 결과 (Task 3 후 채움)

- 배포 unzip 크기: TBD MB / 250MB
- 인코딩 시간(2.5s, N 키프레임): TBD s
- 실기기: iOS Safari ☐ / 카톡 인앱 ☐ / 인스타 스토리 ☐
- 결론: PASS → Vercel / FAIL → 워커 폴백
```

- [ ] **Step 3: 커밋**

```bash
git add docs/adr/0025-recap-share-clip-render-infra.md
git commit -m "docs(adr): 0025 recap 공유 영상 렌더 인프라 결정 초안(spike 전제)"
```

## Task 2: 로컬 인코딩 spike — ffmpeg-static + standalone 스크립트

앱에 손대기 전, 분리된 스크립트로 "PNG 키프레임 → MP4" 와 인코딩 속도를 로컬에서 먼저 확인한다.

**Files:**

- Modify: `package.json`
- Create: `scripts/spike/recap-clip-encode.mjs`

- [ ] **Step 1: ffmpeg-static 설치(dependencies)**

Run: `pnpm add ffmpeg-static`
Expected: `package.json` 의 `dependencies` 에 `ffmpeg-static` 추가(devDependencies 아님 — 서버 런타임 사용).

- [ ] **Step 2: spike 스크립트 작성**

```js
// scripts/spike/recap-clip-encode.mjs
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) =>
      c === 0 ? res() : rej(new Error("ffmpeg " + c + "\n" + err.slice(-1500))),
    );
  });
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "recap-clip-"));
  for (let i = 0; i < 8; i++) {
    const hex = Math.round((i / 8) * 0xffffff)
      .toString(16)
      .padStart(6, "0");
    await runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `color=c=0x${hex}:s=1080x1350`,
      "-frames:v",
      "1",
      "-y",
      join(dir, `frame_${String(i).padStart(4, "0")}.png`),
    ]);
  }
  const out = join(dir, "clip.mp4");
  const t0 = Date.now();
  await runFfmpeg([
    "-framerate",
    "3",
    "-i",
    join(dir, "frame_%04d.png"),
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=1080:1350,fps=30",
    "-movflags",
    "+faststart",
    "-y",
    out,
  ]);
  const ms = Date.now() - t0;
  const { size } = await stat(out);
  console.log(JSON.stringify({ outDir: dir, encodeMs: ms, mp4Bytes: size }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: 실행**

Run: `node scripts/spike/recap-clip-encode.mjs`
Expected: `{ outDir, encodeMs, mp4Bytes }` 출력, `encodeMs` 수백 ms~수 초. `outDir/clip.mp4` 재생 확인.

- [ ] **Step 4: 폰 1차 재생 확인**

`clip.mp4` 를 본인 폰으로 전송 → iOS Safari·카카오톡 인앱 재생. 안 되면 `baseline`/`level 3.0`/`yuv420p` 유지 확인.

- [ ] **Step 5: 커밋**

```bash
git add package.json pnpm-lock.yaml scripts/spike/recap-clip-encode.mjs
git commit -m "chore(spike): ffmpeg-static 로컬 인코딩 spike + 의존 추가"
```

## Task 3: Vercel Preview spike — 배포 크기 + 타임아웃 실측 (게이트)

진짜 리스크는 Vercel 함수 한도다. 임시 라우트로 배포 unzip 크기·실행 시간을 실측한다.

**Files:**

- Create(임시): `src/app/api/share/_spike/route.ts`
- Modify: `next.config.ts`
- Modify(결과): `docs/adr/0025-recap-share-clip-render-infra.md`

- [ ] **Step 1: 임시 spike 라우트**

```ts
// src/app/api/share/_spike/route.ts  ※ spike 검증 후 삭제
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const maxDuration = 60; // Hobby 면 10s 제한 → 그 자체가 FAIL 신호

export async function GET() {
  const t0 = Date.now();
  const dir = await mkdtemp(join(tmpdir(), "spike-"));
  const out = join(dir, "clip.mp4");
  await new Promise<void>((res, rej) => {
    const enc = spawn(ffmpegPath as string, [
      "-f",
      "lavfi",
      "-i",
      "color=c=0xC2683D:s=1080x1350:d=2.5:r=30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      out,
    ]);
    let err = "";
    enc.stderr.on("data", (d) => (err += d));
    enc.on("close", (c) => (c === 0 ? res() : rej(new Error("encode " + c + "\n" + err))));
  });
  const buf = await readFile(out);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "video/mp4", "X-Encode-Ms": String(Date.now() - t0) },
  });
}
```

- [ ] **Step 2: ffmpeg 바이너리 트레이싱 보장**

`next.config.ts` 의 기존 `nextConfig` 객체에 병합한다(기존 키 유지).

```ts
// next.config.ts (발췌 — 기존 cacheComponents/experimental/images 유지)
const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/share/**": ["./node_modules/ffmpeg-static/**"],
  },
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  images: {
    /* 기존 remotePatterns 유지 */
  },
};
```

- [ ] **Step 3: Preview 배포 + 함수 크기 확인**

```bash
git add -A
git commit -m "chore(spike): Vercel preview ffmpeg 인코딩 라우트"
git push
```

Vercel Preview 빌드 로그 또는 `npx vercel inspect` 로 `/api/share/_spike` 함수 unzip 크기 확인.
Expected: ≤ 250MB. 초과 시 게이트 FAIL.

- [ ] **Step 4: Preview 실행 + 실기기 재생**

Preview URL `/api/share/_spike` → MP4 응답·`X-Encode-Ms` 확인 후 iOS Safari·카톡 인앱·인스타 스토리 재생/공유.
Expected: 200 + 재생 성공 + `X-Encode-Ms` < `maxDuration`.

- [ ] **Step 5: ADR-0025 결과 기록 + 게이트 판정**

ADR "Spike 결과" 표에 실측치 채우고 PASS/FAIL 확정. Status 갱신(accepted=Vercel / Vercel 폐기→워커).

- [ ] **Step 6: 임시 라우트 제거 + 커밋**

```bash
git rm src/app/api/share/_spike/route.ts
git add docs/adr/0025-recap-share-clip-render-infra.md
git commit -m "docs(adr): 0025 spike 실측 결과 기록 + 임시 라우트 제거"
git push
```

> **게이트**: PASS → Task 4. FAIL → Task 13(워커 폴백) 직행, Task 7·8 의 "실행 위치"를 워커로 치환.

---

## Stage B — Build (Spike PASS 시에만)

## Task 4: 폰트 로더 추출 `loadCardFonts()` (DRY 준비)

클립 라우트가 OG 라우트와 같은 폰트를 써야 한다. route.tsx 내부 비공개 `loadFont()`+조립을 공유 모듈로 추출한다.

**Files:**

- Create: `src/lib/share/og-fonts.ts`
- Modify: `src/app/api/og/recap-card/route.tsx`

- [ ] **Step 1: 폰트 로더 모듈 작성** (route.tsx 의 로직 그대로 이전)

```ts
// src/lib/share/og-fonts.ts
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

/** 공유 카드/영상 프레임 공통 폰트(Pretendard 400/700 + Anton 400). 누락 시 빈 배열. */
export async function loadCardFonts(): Promise<Font[]> {
  const [pretendard, anton] = await Promise.all([
    loadFont("PretendardVariable.woff2"),
    loadFont("Anton-Regular.ttf"),
  ]);
  return [
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 400 as const, style: "normal" as const }
      : null,
    pretendard
      ? { name: "Pretendard", data: pretendard, weight: 700 as const, style: "normal" as const }
      : null,
    anton ? { name: "Anton", data: anton, weight: 400 as const, style: "normal" as const } : null,
  ].filter((f): f is Font => f !== null);
}
```

- [ ] **Step 2: route.tsx 를 추출 함수로 치환**

route.tsx 에서 `fontCache`·`loadFont`·인라인 `const fonts = [...]` 를 제거하고 `import { loadCardFonts } from "@/lib/share/og-fonts";` 후 `const fonts = await loadCardFonts();` 로 교체. `ImageResponse` 의 `fonts: fonts.length ? fonts : undefined` 는 유지.

- [ ] **Step 3: 회귀 확인**

Run: `pnpm typecheck && pnpm test src/app/api/og/recap-card/route.spec.ts`
Expected: PASS — 기존 OG 테스트(400/401/404/200/ticket) 그대로 통과.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/share/og-fonts.ts src/app/api/og/recap-card/route.tsx
git commit -m "refactor(share): OG 폰트 로딩 loadCardFonts 로 추출(영상 재사용 준비)"
```

## Task 5: storyboard 타이밍 로직 (순수 함수 + 테스트)

스펙 D3 3비트(인트로 0.4s / 몽타주 1.8s / 엔드카드 0.8s = 3.0s). 사진 0~N장 엣지 흡수.

**Files:**

- Create: `src/app/api/share/recap-clip/storyboard.ts`
- Test: `src/app/api/share/recap-clip/storyboard.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/app/api/share/recap-clip/storyboard.spec.ts
import { describe, expect, it } from "vitest";
import { buildStoryboard } from "./storyboard";

describe("buildStoryboard", () => {
  it("사진 3장 → 인트로+사진3+엔드카드", () => {
    const sb = buildStoryboard({ photoCount: 3, fps: 30 });
    expect(sb.beats.map((b) => b.kind)).toEqual(["intro", "photo", "photo", "photo", "endcard"]);
    expect(sb.totalFrames).toBe(sb.beats.reduce((s, b) => s + b.frames, 0));
  });
  it("총 길이 2~3.2초", () => {
    const sb = buildStoryboard({ photoCount: 4, fps: 30 });
    expect(sb.totalSeconds).toBeGreaterThanOrEqual(2);
    expect(sb.totalSeconds).toBeLessThanOrEqual(3.2);
  });
  it("사진 0장 → 인트로+엔드카드(폴백 비트)", () => {
    const sb = buildStoryboard({ photoCount: 0, fps: 30 });
    expect(sb.beats.map((b) => b.kind)).toEqual(["intro", "endcard"]);
  });
  it("사진 과다 → 몽타주 상한 6장", () => {
    const sb = buildStoryboard({ photoCount: 20, fps: 30 });
    expect(sb.beats.filter((b) => b.kind === "photo").length).toBeLessThanOrEqual(6);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/share/recap-clip/storyboard.spec.ts`
Expected: FAIL — `buildStoryboard` 미정의.

- [ ] **Step 3: 최소 구현**

```ts
// src/app/api/share/recap-clip/storyboard.ts
export type BeatKind = "intro" | "photo" | "endcard";

export interface Beat {
  kind: BeatKind;
  photoIndex?: number; // photo 비트만
  frames: number; // hold 프레임 수
}

export interface Storyboard {
  beats: Beat[];
  fps: number;
  totalFrames: number;
  totalSeconds: number;
}

const MAX_MONTAGE = 6; // 멤버 사진 노출 상한(프라이버시 + 인코딩 비용)
const INTRO_SEC = 0.4;
const ENDCARD_SEC = 0.8;
const MONTAGE_SEC = 1.8;

export function buildStoryboard(input: { photoCount: number; fps: number }): Storyboard {
  const { fps } = input;
  const photoCount = Math.min(Math.max(input.photoCount, 0), MAX_MONTAGE);
  const beats: Beat[] = [{ kind: "intro", frames: Math.round(INTRO_SEC * fps) }];
  if (photoCount > 0) {
    const per = MONTAGE_SEC / photoCount;
    for (let i = 0; i < photoCount; i++) {
      beats.push({ kind: "photo", photoIndex: i, frames: Math.round(per * fps) });
    }
  }
  beats.push({ kind: "endcard", frames: Math.round(ENDCARD_SEC * fps) });
  const totalFrames = beats.reduce((s, b) => s + b.frames, 0);
  return { beats, fps, totalFrames, totalSeconds: totalFrames / fps };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/app/api/share/recap-clip/storyboard.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/share/recap-clip/storyboard.ts src/app/api/share/recap-clip/storyboard.spec.ts
git commit -m "feat(recap-clip): storyboard 타이밍 순수 함수 + 테스트"
```

## Task 6: 프레임 컴포넌트 (인트로·몽타주) + 엔드카드 재사용

엔드카드 = `renderPhotoCard(data)`(poster 동일성). 인트로/몽타주는 새 컴포넌트. 팔레트는 templates.tsx 에서 export.

**Files:**

- Modify: `src/app/api/og/recap-card/templates.tsx`
- Create: `src/app/api/share/recap-clip/frames.tsx`

- [ ] **Step 1: templates.tsx 팔레트 export**

`templates.tsx` 의 색 상수 4개에 `export` 추가(나머지는 그대로):

```ts
// src/app/api/og/recap-card/templates.tsx (상수 선언부)
export const CREAM = "#FAF6EF";
export const INK = "#2A221C";
export const TERRA = "#C2683D";
export const SUBTEXT = "#8E8579";
```

- [ ] **Step 2: 프레임 컴포넌트 작성**

```tsx
// src/app/api/share/recap-clip/frames.tsx
/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import { CREAM, INK, TERRA, SUBTEXT } from "@/app/api/og/recap-card/templates";

const W = 1080;
const H = 1350;

/** 인트로: 크림 배경 + from.with + 그룹명. */
export function renderIntroFrame(groupName: string): ReactElement {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: CREAM,
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 4, color: SUBTEXT }}>
        from.with
      </div>
      <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: INK, marginTop: 24 }}>
        {groupName}
      </div>
    </div>
  );
}

/** 몽타주: 사진 1장 풀블리드 + 하단 그라데이션 + from.with. heroUrl null 이면 TERRA 폴백. */
export function renderMontageFrame(photoUrl: string | null): ReactElement {
  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", background: CREAM }}>
      {photoUrl ? (
        <img alt="" src={photoUrl} width={W} height={H} style={{ objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", width: W, height: H, background: TERRA }} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "linear-gradient(180deg, rgba(42,34,28,0.10) 0%, rgba(42,34,28,0.34) 100%)",
        }}
      />
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
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/og/recap-card/templates.tsx src/app/api/share/recap-clip/frames.tsx
git commit -m "feat(recap-clip): 인트로·몽타주 프레임 + 팔레트 export(엔드카드는 renderPhotoCard 재사용)"
```

## Task 7: ffmpeg 인코딩 헬퍼 (PNG 키프레임 → MP4)

키프레임을 hold 시간만큼 이어붙여 H.264 MP4 로 합친다(concat demuxer).

**Files:**

- Create: `src/app/api/share/recap-clip/encode.ts`

- [ ] **Step 1: 인코딩 헬퍼 작성**

```ts
// src/app/api/share/recap-clip/encode.ts
import "server-only";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Beat } from "./storyboard";

export interface EncodeInput {
  beats: Beat[]; // beats[i] ↔ pngs[i]
  pngs: Buffer[];
  fps: number;
}

export async function encodeClip(input: EncodeInput): Promise<Buffer> {
  if (ffmpegPath == null) throw new Error("ffmpeg-static binary not found");
  const dir = await mkdtemp(join(tmpdir(), "recap-clip-"));
  try {
    const lines: string[] = [];
    for (let i = 0; i < input.pngs.length; i++) {
      const p = join(dir, `k_${String(i).padStart(3, "0")}.png`);
      await writeFile(p, input.pngs[i]);
      lines.push(`file '${p}'`, `duration ${(input.beats[i].frames / input.fps).toFixed(3)}`);
    }
    // concat 은 마지막 duration 무시 → 마지막 파일 한 번 더 명시
    lines.push(`file '${join(dir, `k_${String(input.pngs.length - 1).padStart(3, "0")}.png`)}'`);
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, lines.join("\n"));
    const out = join(dir, "clip.mp4");
    await runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vsync",
      "vfr",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.0",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale=1080:1350,fps=${input.fps}`,
      "-movflags",
      "+faststart",
      "-y",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const proc = spawn(ffmpegPath as string, args);
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`)),
    );
  });
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/share/recap-clip/encode.ts
git commit -m "feat(recap-clip): ffmpeg-static 키프레임 concat 인코딩 헬퍼"
```

## Task 8: recap-clip 라우트 (인증·게이팅·프레임·인코딩)

OG 라우트와 동일한 인증/게이팅. `fetchRecap`(D6 내장) + `fetchChallengePhotos` → storyboard → 프레임 PNG → encode → MP4.

**Files:**

- Create: `src/app/api/share/recap-clip/route.ts`
- Test: `src/app/api/share/recap-clip/route.spec.ts`

- [ ] **Step 1: 라우트 테스트 작성** (`og/recap-card/route.spec.ts` 패턴 재사용 — 같은 mock 세트)

```ts
// src/app/api/share/recap-clip/route.spec.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })) },
  })),
}));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("@/lib/db/reads/challenge-photos", () => ({
  fetchChallengePhotos: vi.fn(async () => []),
}));
vi.mock("@/lib/share/og-fonts", () => ({ loadCardFonts: vi.fn(async () => []) }));
vi.mock("./encode", () => ({ encodeClip: vi.fn(async () => Buffer.from("mp4")) }));
// next/og ImageResponse 를 arrayBuffer 가능한 Response 로 mock
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor() {
      super(new Blob([new Uint8Array([1, 2, 3])]));
    }
  },
}));

import { GET } from "./route";
import { fetchRecap } from "@/lib/db/reads/recap";

const RECAP = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  goalCount: 12,
  status: "closed",
  startAt: "2026-05-16T00:00:00+09:00",
  endAt: "2026-05-28T00:00:00+09:00",
  durationDays: 14,
  penaltyAmount: 1000,
  viewerId: "u1",
  viewerAchieved: true,
  viewerDoneCount: 12,
  viewerPerHeadPenalty: 0,
  anyoneAchieved: true,
  members: [{ id: "u1", achieved: true }],
  group: { id: "g1", name: "우리 헬스방", ownerId: "u1" },
};

afterEach(() => vi.clearAllMocks());

function req() {
  return new Request("http://localhost/api/share/recap-clip?challengeId=c1");
}

describe("GET /api/share/recap-clip", () => {
  it("challengeId 없으면 400", async () => {
    const res = await GET(new Request("http://localhost/api/share/recap-clip"));
    expect(res.status).toBe(400);
  });
  it("recap null 이면 404(게이팅 정합)", async () => {
    vi.mocked(fetchRecap).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });
  it("recap 있으면 200 video/mp4", async () => {
    vi.mocked(fetchRecap).mockResolvedValue(RECAP as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/share/recap-clip/route.spec.ts`
Expected: FAIL — `./route` 의 `GET` 미정의.

- [ ] **Step 3: 라우트 구현**

```ts
// src/app/api/share/recap-clip/route.ts
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { fetchChallengePhotos } from "@/lib/db/reads/challenge-photos";
import { formatSharePeriod } from "@/lib/share/period";
import { loadCardFonts } from "@/lib/share/og-fonts";
import { renderPhotoCard, type CardData } from "@/app/api/og/recap-card/templates";
import { renderIntroFrame, renderMontageFrame } from "./frames";
import { buildStoryboard, type Beat } from "./storyboard";
import { encodeClip } from "./encode";

export const maxDuration = 60; // ADR-0025 spike 실측에 맞춰 조정
const FPS = 30;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });
  const channel = url.searchParams.get("channel") === "sns" ? "sns" : "friend";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // fetchRecap 은 closed 또는 active+만기만 반환 → D6 게이팅 자동 정합(OG 라우트와 동일).
  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const allPhotos = await fetchChallengePhotos(challengeId, { client: supabase });
    // Phase 1c 에서 optedOut 컬럼 추가 시 sns 일 때 제외(현재 컬럼 부재 → 전체 포함).
    const photos =
      channel === "sns"
        ? allPhotos.filter((p) => !("optedOut" in p && (p as { optedOut?: boolean }).optedOut))
        : allPhotos;

    const data: CardData = {
      groupName: recap.group?.name ?? "우리 그룹",
      period: formatSharePeriod(recap.startAt, recap.endAt),
      doneCount: recap.viewerDoneCount,
      crew: recap.members.length,
      heroUrl: photos.length > 0 ? photos[photos.length - 1].signedUrl : null,
      allAchieved: recap.members.length > 0 && recap.members.every((m) => m.achieved),
    };

    const sb = buildStoryboard({ photoCount: photos.length, fps: FPS });
    const fonts = await loadCardFonts();
    const pngs = await Promise.all(sb.beats.map((b) => renderBeatPng(b, data, photos, fonts)));
    const mp4 = await encodeClip({ beats: sb.beats, pngs, fps: FPS });

    return new Response(new Uint8Array(mp4), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'inline; filename="recap-clip.mp4"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[recap-clip] encode failed", { challengeId, message: (e as Error).message });
    return NextResponse.json({ error: "clip render failed" }, { status: 500 });
  }
}

async function renderBeatPng(
  beat: Beat,
  data: CardData,
  photos: ReadonlyArray<{ signedUrl: string }>,
  fonts: Awaited<ReturnType<typeof loadCardFonts>>,
): Promise<Buffer> {
  const el =
    beat.kind === "endcard"
      ? renderPhotoCard(data)
      : beat.kind === "intro"
        ? renderIntroFrame(data.groupName)
        : renderMontageFrame(photos[beat.photoIndex ?? 0]?.signedUrl ?? null);
  const res = new ImageResponse(el, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
  });
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 4: 통과 + typecheck**

Run: `pnpm test src/app/api/share/recap-clip/route.spec.ts && pnpm typecheck`
Expected: PASS (3 tests) + 타입 통과.

- [ ] **Step 5: 로컬 수동 확인**

`pnpm dev` → `http://localhost:3000/api/share/recap-clip?challengeId=<closed id>` → MP4 재생. active+만기 챌린지도 200(404 회귀 없음). 사진 0장 챌린지도 인트로+엔드카드로 생성.

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/share/recap-clip/route.ts src/app/api/share/recap-clip/route.spec.ts
git commit -m "feat(recap-clip): MP4 렌더 라우트(인증·fetchRecap 게이팅·프레임·인코딩) + 테스트"
```

## Task 9: 공유 UI — 토글 3종 + 영상 생성/공유 플로우

`share-card-action.tsx` 의 사진형/티켓형 토글을 **영상/사진형/티켓형 3종**으로 확장하고, 영상은 `/api/share/recap-clip` 을 호출해 MP4 로 공유한다.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx`
- Modify: `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`

- [ ] **Step 1: 영상 분기 테스트 추가** (기존 spec 의 fetch/share mock 재사용)

```tsx
// share-card-action.spec.tsx 에 추가 (기존 navigator.share mock 패턴 사용)
it("영상 선택 시 recap-clip 을 mp4 로 공유", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Blob([new Uint8Array([1])], { type: "video/mp4" })));
  const shareSpy = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { canShare: () => true, share: shareSpy });

  render(<ShareCardAction challengeId="c1" shareMessage="m" />);
  fireEvent.click(screen.getByRole("tab", { name: "영상" }));
  fireEvent.click(screen.getByRole("button", { name: /공유/ }));

  await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  expect(fetchSpy.mock.calls[0][0]).toContain("/api/share/recap-clip?challengeId=c1");
  await waitFor(() => expect(shareSpy).toHaveBeenCalled());
});
```

- [ ] **Step 2: 컴포넌트 확장**

`Template` 유니온에 `"clip"` 추가, 토글 배열을 `["clip","photo","ticket"]`(스펙 D2 순서 ▶영상·🖼사진·🎟티켓)로 바꾼다. `shareCard()` 에서 `template==="clip"` 이면 엔드포인트·파일명·MIME 을 영상용으로 분기:

```tsx
// share-card-action.tsx (발췌 — 기존 shareCard 분기 추가)
type Template = "clip" | "photo" | "ticket";

async function shareCard(challengeId: string, template: Template, text: string): Promise<void> {
  const isClip = template === "clip";
  const endpoint = isClip
    ? `/api/share/recap-clip?challengeId=${encodeURIComponent(challengeId)}`
    : `/api/og/recap-card?${new URLSearchParams({ challengeId, template }).toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const ext = isClip ? "mp4" : "png";
  const mime = isClip ? "video/mp4" : "image/png";
  const file = new File([blob], `recap-${challengeId}-${template}.${ext}`, { type: mime });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({ files: [file], text });
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
```

토글 렌더 배열·라벨도 갱신(`{ clip: "영상", photo: "사진형", ticket: "티켓형" }`). 영상은 서버 인코딩이라 수 초 걸리므로 `pending` 라벨을 영상일 때 `"영상 만드는 중..."` 로 구분(`template==="clip" ? "영상 만드는 중..." : "카드 만드는 중..."`). 기존 `pending` 가드·`AbortError` 무시·`toast.error` 는 그대로(영상에도 적용).

- [ ] **Step 3: typecheck + lint + test**

Run: `pnpm typecheck && pnpm lint && pnpm test src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`
Expected: PASS — 기존 사진/티켓 케이스 + 영상 케이스 통과.

- [ ] **Step 4: 수동 확인 (모바일 viewport)**

`pnpm dev` → 정산 → 공유 → 영상 선택 → 생성·공유(데스크톱은 다운로드 폴백), 취소(AbortError) 무토스트, 실패 주입 시 토스트 1회.

- [ ] **Step 5: 커밋**

```bash
git add src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx
git commit -m "feat(recap-share): 공유 토글 영상 3종 확장 + recap-clip 생성/공유/로딩"
```

## Task 10: page.tsx — poster 정합 확인

영상 poster/thumbnail 은 별도 엔드포인트가 필요 없다 — 엔드카드 = `renderPhotoCard` = 기존 `/api/og/recap-card?template=photo`. `shareMessage` 는 Phase 1a 에서 이미 벌금 단정 없이 `${groupName} · ${recap.title}의 기록 · with-key` 로 정리됨.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/recap/page.tsx`(필요 시)

- [ ] **Step 1: 확인**

`page.tsx` 의 `<ShareCardAction challengeId shareMessage />` props 는 그대로 충분(영상도 challengeId 만 있으면 됨). 영상 미리보기 `<video>` 를 추후 붙일 때 `poster={/api/og/recap-card?challengeId=...&template=photo}` 를 쓰면 엔드카드와 일치. **이번 단계 코드 변경 없음이면 스킵.**

- [ ] **Step 2: 전체 게이트**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: 전부 PASS(`build` 는 라우트 번들 + ffmpeg 트레이싱 포함 확인).

- [ ] **Step 3: 커밋(변경 있을 때만)**

```bash
git add src/app/(app)/challenge/[id]/recap/page.tsx
git commit -m "chore(recap-share): 영상 poster 정합 메모/배선"
```

## Task 11: 프라이버시 회귀 + 엣지 수동 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 프라이버시 회귀 (필수)**

Run: `grep -REn "accountHolder|accountNumber|bankCode|displayName" src/app/api/share/recap-clip/`
Expected: `OK: 민감정보 참조 없음`(매칭 0). 영상 프레임 데이터(`CardData`·`renderMontageFrame`)에 계좌·실명 없음.

- [ ] **Step 2: 엣지 수동 확인**

dev 에서: 사진 0장(인트로+엔드카드), 사진 1장, 솔로(1명), 긴 그룹명, allAchieved=false → 깨짐 없음. 7장 이상이면 몽타주 6장으로 제한.

- [ ] **Step 3: 실기기 재생/공유**

`recap-clip` MP4 를 iOS Safari · 카카오톡 인앱 · 인스타 스토리에서 재생/공유. poster(`?template=photo`)가 엔드카드와 동일한지 시각 비교.

## Task 12: (조건부) 워커 폴백 — Spike FAIL 시에만

Task 3 게이트 FAIL(크기/타임아웃 초과)이면 인코딩을 Vercel 함수에서 분리한다.

- [ ] **Step 1: 결정 기록** — ADR-0025 Status 를 "Vercel 폐기 → 컨테이너 워커" 로 갱신, 실측 근거 기록.
- [ ] **Step 2: 워커 분리 스펙 작성** — `docs/superpowers/specs/` 에 추가. 범위: Railway/Fly 컨테이너로 `frames.tsx`+`encode.ts` 이식, Vercel 라우트는 워커 프록시로 축소, 워커 엔드포인트 인증·타임아웃, 멤버 사진은 signed URL 로만 전달. 실제 워커 구현은 별도 plan(이 plan 범위 밖).

> 워커 폴백 시 Task 7·8 의 실행 위치만 워커로 옮기고 storyboard/frames/UI(Task 5·6·9)는 재사용.

---

## Conditional — Phase 1c (PO 승인 후에만)

> 이 plan 필수 범위 아님. 스펙 D7·§Rollout 1c. PO 승인 전 코드 미추가(가드레일 — 임의 AnalyticsEvent 금지).

### Task C1: `recap_shared` 계측 (spec-required)

- [ ] PRD §9.1 에 `recap_shared { challengeId, kind: "clip"|"photo"|"ticket", channel: "friend"|"sns" }` 추가 + PO 승인.
- [ ] `src/lib/analytics/track.ts` `AnalyticsEvent` 유니온 **그리고** `src/lib/analytics/schema.ts` Zod 스키마 **둘 다**에 동일 shape 추가(track 은 schema.safeParse 로 검증 → 한쪽만 추가하면 silently drop). spec(`docs/superpowers/specs/`)에 근거 기록.
- [ ] union ↔ Zod parity 테스트 후 `pnpm test`.
- [ ] `share-card-action.tsx` 의 공유 성공 지점(clip/photo/ticket 모두)에서 `track({ name: "recap_shared", props: {...} }, { userId })` 호출(현재 이 컴포넌트는 계측 0).

### Task C2: 멤버 사진 opt-out 영속화 (ADR + migration)

- [ ] 별도 ADR(다음 번호) — `challenge_participants`(또는 `users`)에 boolean 컬럼 1개.
- [ ] `supabase/migrations/00NN_member_photo_optout.sql`(단방향) + RLS 검증(anon/authenticated).
- [ ] Task 8 의 no-op 필터(`"optedOut" in p ...`)를 실제 컬럼 기반 제외로 치환.

---

## Self-Review (작성자 점검 결과)

- **Spec 커버리지(Phase 1b)**: D3 영상 파이프라인 ✔(Task 5~8) · 엔드카드=사진형 poster ✔(Task 6·8 `renderPhotoCard` 재사용) · D4 날짜 포맷 ✔(`formatSharePeriod` 재사용) · D5 친구/SNS·navigator.share·AbortError ✔(Task 9) + opt-out 경계 ✔(Task 8, 컬럼은 1c) · D6 게이팅 ✔(Task 8, `fetchRecap` 자동 정합) · spike ✔(Task 2·3) · ADR ✔(Task 1·3) · 워커 폴백 ✔(Task 12) · D7 측정 → Task C1(조건부, PO 승인).
- **Phase 1b 범위 밖(의도적 제외)**: `recap_shared` 계측·SNS opt-in·멤버 opt-out 컬럼(Phase 1c) · 영상 내 미리보기 `<video>` 위젯·사용자 직접 사진 선택(후속) · 외부 영상 API·Remotion(폴백 후보).
- **타입 일관성**: `Beat`·`Storyboard`(Task 5) → `encode.ts`(Task 7)·`route.ts`(Task 8) 동일 import. `CardData`(templates.tsx) ↔ route 조립 동일(Phase 1a 와 같은 필드). `Template` 유니온(`clip|photo|ticket`, Task 9) ↔ 엔드포인트 분기 일치. `loadCardFonts()`(Task 4) ↔ OG route + clip route 공용. 팔레트 export(Task 6) ↔ frames import 일치.
- **재사용/DRY**: 폰트(Task 4 추출), 카드 렌더(`renderPhotoCard`/팔레트), 데이터 read(`fetchRecap`/`fetchChallengePhotos`/`formatSharePeriod`), 라우트 테스트 mock 세트(`og/recap-card/route.spec.ts` 패턴)를 모두 재사용 — 신규 코드는 storyboard·frames(인트로/몽타주)·encode·clip route 로 최소화.
- **알려진 리스크**: (1) Vercel 함수 250MB/타임아웃 — Task 3 게이트로 선검증. (2) `sharp` 가 devDependency 인데 서버 import(기존 리스크) — `ffmpeg-static` 은 dependencies 로 추가해 같은 함정 회피. (3) `next/og` 의 `ImageResponse(...).arrayBuffer()` 가 PNG 를 주는지 spike 에서 1프레임으로 우선 확인(프레임 N장 satori 비용이 타임아웃 주범 후보 — 키프레임 수를 MAX_MONTAGE 로 제한). (4) 카톡 인앱 H.264 호환 위해 `baseline/level 3.0 + yuv420p + faststart` 고정.
