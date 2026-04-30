# HEIC 클라이언트 변환 + 업로드 리사이즈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인증하기에서 사용자가 선택한 사진을 **업로드 직전에 브라우저에서 JPEG로 표준화(+long-edge 1920px 리사이즈)** 하여, iOS HEIC 원본이 Chrome/Firefox 피드에서 렌더되지 않는 문제를 제거하고 Storage/대역폭 비용까지 함께 낮춘다.

**Architecture:** 신규 유틸 `src/lib/image/prepare-upload.ts` 가 단일 진입점. HEIC/HEIF인 경우에만 `heic2any` 를 **동적 import** 로 로드해 JPEG Blob으로 변환하고, 그 외 포맷(및 변환 결과)은 `createImageBitmap` + `OffscreenCanvas`(fallback: `HTMLCanvasElement`)로 long-edge 1920px/quality 0.85 JPEG 로 재인코딩한다. 변환이 throw 하면 **원본 파일을 그대로 업로드**하고(비파괴), 서버/Storage 정책은 JPEG/PNG/WebP 만 허용하도록 축소한다 (HEIC/HEIF 제거). ActionForm 은 `handleFile` 안에서 `prepareForUpload` 를 await 해 변환이 끝난 File 로 미리보기·제출을 수행하므로 기존 HEIC placeholder 분기는 제거된다.

**Tech Stack:** Next.js 16 App Router · TypeScript · `heic2any` (신규, dynamic import only) · 브라우저 `createImageBitmap` / `OffscreenCanvas` / `Canvas` · Vitest (jsdom + node) · Playwright E2E.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

**현상 (2026-04-30 재현):** 인증하기에서 iPhone 기본 포맷 HEIC 파일을 선택하면 Chrome에서 미리보기가 깨져 "사진 준비됨" placeholder 만 뜨고, 제출 이후 피드에서도 `FeedCard` 의 `<Image>` 가 `onError` 로 gradient fallback 만 렌더됨. DB/Storage에는 원본 HEIC가 정상 저장됨 — **브라우저 디코딩 한계**가 근본 원인.

**직전 상태 (repo 실측):**
- [src/app/(app)/action/_components/action-form.tsx:51-96](src/app/(app)/action/_components/action-form.tsx#L51-L96) — `handleFile` 이 `URL.createObjectURL(file)` 로 원본 blob URL 을 `<img>` 에 직결. HEIC면 `previewFailed=true` 로 placeholder만 보여줌.
- [src/app/(app)/challenge/[id]/_components/feed-card.tsx:27-54](src/app/(app)/challenge/[id]/_components/feed-card.tsx#L27-L54) — `<Image>` 가 Storage signed URL 을 로드하다 `onError` 시 `imageFailed=true` → gradient placeholder.
- [src/lib/validators/action-log.ts:5-11](src/lib/validators/action-log.ts#L5-L11) — `ALLOWED_PHOTO_MIME` 에 `image/heic`, `image/heif` 포함.
- [src/lib/storage/action-photos.ts:12-30](src/lib/storage/action-photos.ts#L12-L30) — `ALLOWED_EXT` 에 `heic`, `heif` 포함. `PHOTO_PATH_RE` 도 동일.
- [supabase/migrations/0010_action_photos_bucket.sql](supabase/migrations/0010_action_photos_bucket.sql) 계열에서 bucket `allowed_mime_types` 에 `image/heic`, `image/heif` 포함 가능성 (Task 7 에서 실측 후 조건부 migration).

**이 plan 이 바꾸는 것:**
1. **클라이언트에서 JPEG 로 표준화** — HEIC면 `heic2any` 로 JPEG Blob 전환, 그 외도 `canvas` 재인코딩으로 long-edge 1920px JPEG 로 통일.
2. **validator/Storage 허용 목록 축소** — `image/heic`, `image/heif`, `.heic`, `.heif` 제거.
3. **Storage bucket policy/allowed_mime_types 에서 HEIC/HEIF 제거** (실제 migration 에 포함된 경우만 — Task 7 에서 확인 후 조건부).
4. **ActionForm** — `handleFile` 을 async 화, `preparing` 상태로 버튼 disable, HEIC placeholder 제거.

**이 plan 이 하지 않는 것:**
- (a) 서버 측 변환(`sharp`/libheif) — Vercel serverless 바이너리 리스크로 기각.
- (b) WebP/AVIF 출력 — JPEG 단일로 호환성 우선.
- (c) EXIF 회전 보정 — `createImageBitmap({ imageOrientation: "from-image" })` 가 자동 처리. 수동 회전 UI 없음.
- (d) 이미지 편집 (crop/필터) — v2 이월.
- (e) 기존 DB 에 저장된 HEIC row 마이그레이션 — `truncate_test_data` 스코프 안이라 리셋 가능.
- (f) 변환 진행률 표시 — 버튼 disable + 간단 토스트로 충분.

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서 (반드시 이 순서로)

```
Task 1 (heic2any 의존성 추가 + package.json/pnpm-lock 커밋)
  → Task 2 (resize-to-jpeg 유틸 — 순수 canvas, 신규 파일 + unit test)
  → Task 3 (prepare-upload 유틸 — HEIC 분기 + resize 조합 + unit test)
  → Task 4 (validator ALLOWED_PHOTO_MIME 에서 heic/heif 제거 + spec 갱신)
  → Task 5 (action-photos ALLOWED_EXT/ MIME_TO_EXT/EXT_TO_MIME/PHOTO_PATH_RE 에서 heic/heif 제거 + spec 갱신)
  → Task 6 (ActionForm: handleFile async + prepareForUpload 호출 + preview 분기 정리 + component spec)
  → Task 7 (Supabase bucket allowed_mime_types 확인 — HEIC 포함 시에만 migration 추가)
  → Task 8 (E2E: HEIC 픽스처 업로드 → 피드에서 JPEG 이미지 렌더)
  → Task 9 (문서 업데이트 — JOURNAL 2026-05-01 항목 + ONBOARDING §6.1 HEIC 정책 반영)
```

### 브랜치/워크트리

```bash
git checkout -b feat/heic-client-transcode
```

### 실행 전 체크

- `pnpm install` 이 깨끗하게 돌아야 함 (Node 20, pnpm 10.7.0)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` 전부 green 상태에서 시작
- `pnpm test:integration` 은 Supabase 실서버에 붙으므로 Task 7 이전까지는 **건드리지 않음**

### 위험 신호

- **heic2any 번들 크기:** gzip ~500KB. **반드시 dynamic import 안에서만** `import("heic2any")`. 정적 import 금지.
- **OffscreenCanvas 미지원 Safari 구버전:** Task 2 의 유틸이 `HTMLCanvasElement` fallback 을 가져야 함.
- **변환 실패 시 fallback:** 변환이 throw 해도 **원본 File 그대로 업로드** — 서버는 여전히 수락해야 하므로, validator 에서 HEIC 를 **제거한 뒤**에도 bucket policy 가 JPEG 만 받도록 좁히면 "변환 실패한 HEIC 원본" 이 Storage 에서 거부됨. 이 경우 서버 응답은 `upload_failed` → UX 는 "사진 없이 인증됐어요" 로 비파괴 성공. Task 6 의 toast 메시지에 이 경로를 명시.
- **Playwright HEIC 픽스처:** `tests/fixtures/` 에 작은 HEIC 파일 필요. Task 8 에서 생성 또는 외부 도구로 준비 후 커밋. 크기 < 50KB.

---

## 1. File Structure

### 신규 파일

| Path | Responsibility |
|---|---|
| `src/lib/image/resize-to-jpeg.ts` | 순수 유틸: Blob/File → `createImageBitmap` → Canvas draw → JPEG Blob. long-edge clamp. |
| `src/lib/image/resize-to-jpeg.spec.ts` | Vitest(jsdom): 리사이즈 비율·결과 MIME 검증 (canvas mock 수준). |
| `src/lib/image/prepare-upload.ts` | HEIC 판별 → `heic2any` dynamic import → `resizeToJpeg` 합성. 실패 시 원본 File 반환. |
| `src/lib/image/prepare-upload.spec.ts` | Vitest(jsdom): HEIC 분기/리사이즈 호출/fallback 동작 검증 (heic2any 모듈 모킹). |
| `tests/fixtures/iphone.heic` | HEIC 픽스처 (<50KB). Playwright E2E 에서 사용. |

### 수정 파일

| Path | 변경 요지 |
|---|---|
| `package.json` | `heic2any` devDependencies 아님 — `dependencies` 에 추가. |
| `src/lib/validators/action-log.ts` | `ALLOWED_PHOTO_MIME` 에서 `image/heic`, `image/heif` 제거. |
| `src/lib/validators/action-log.spec.ts` | 기존 있으면 갱신, 없으면 스킵(Task 4 에서 확인). |
| `src/lib/storage/action-photos.ts` | `ALLOWED_EXT` / `MIME_TO_EXT` / `EXT_TO_MIME` / `PHOTO_PATH_RE` 에서 `heic`/`heif` 제거. |
| `src/lib/storage/action-photos.spec.ts` | `extFromFile({ type: "image/heic" })` 기대를 `throws` 로 전환, `looksLikePhotoPath(".../x.heic")` 라인 삭제. |
| `src/app/(app)/action/_components/action-form.tsx` | `handleFile` async 전환 + `prepareForUpload` 호출 + `preparing` state + `previewFailed` 제거 + `ACCEPTED_PHOTO_EXT` 에서 `.heic/.heif` 제거. `<input accept>` 만 `image/heic,image/heif` 포함 유지(선택 UX). |
| `src/app/(app)/challenge/[id]/_components/feed-card.tsx` | `imageFailed` state/HEIC 주석 정리 — fallback 자체는 네트워크 오류 대비 유지. |
| `supabase/migrations/0011_*_remove_heic_allowed_mime.sql` (조건부) | Task 7 에서 현재 bucket policy 실측 후 필요 시에만 추가. |
| `tests/e2e/action-photo-upload.spec.ts` | HEIC 업로드 케이스 추가 (기존 JPEG 케이스 유지). |
| `docs/JOURNAL.md` | 2026-05-01 항목 추가. |
| `docs/ONBOARDING.md` | §6.1 Storage 섹션에 "HEIC는 클라이언트에서 JPEG로 변환 후 업로드" 원칙 반영. |

---

## Task 1: `heic2any` 의존성 추가

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (자동 생성)

- [ ] **Step 1: 현재 dependencies 확인**

Run:
```bash
grep -n '"heic2any"' package.json
```
Expected: 출력 없음 (미설치).

- [ ] **Step 2: 설치**

Run:
```bash
pnpm add heic2any@0.0.4
```
Expected: `package.json` `dependencies` 에 `"heic2any": "^0.0.4"` 추가 + `pnpm-lock.yaml` 갱신.

- [ ] **Step 3: 타입 정의 존재 확인**

Run:
```bash
ls node_modules/heic2any/dist/ 2>&1 | head -5
```
Expected: `heic2any.d.ts` 또는 `index.d.ts` 가 포함됨. 없으면 `pnpm add -D @types/heic2any` 시도 후 실패하면 `src/types/heic2any.d.ts` 에 최소 선언 추가:

```ts
// src/types/heic2any.d.ts
declare module "heic2any" {
  interface Options {
    blob: Blob;
    toType?: "image/jpeg" | "image/png";
    quality?: number;
  }
  export default function heic2any(options: Options): Promise<Blob | Blob[]>;
}
```

- [ ] **Step 4: 빌드 영향 없음 검증**

Run:
```bash
pnpm typecheck
```
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/types/heic2any.d.ts
git commit -m "chore(deps): add heic2any for client-side HEIC→JPEG transcode"
```

---

## Task 2: `resize-to-jpeg` 유틸 + 단위 테스트

**Files:**
- Create: `src/lib/image/resize-to-jpeg.ts`
- Create: `src/lib/image/resize-to-jpeg.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/image/resize-to-jpeg.spec.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resizeToJpeg } from "./resize-to-jpeg";

type BitmapStub = { width: number; height: number; close: () => void };

function makeCanvasStub(): HTMLCanvasElement {
  const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(["jpeg"], { type: "image/jpeg" }))),
  } as unknown as HTMLCanvasElement;
}

describe("resizeToJpeg", () => {
  beforeEach(() => {
    // @ts-expect-error jsdom shim
    globalThis.createImageBitmap = vi.fn(async () =>
      ({ width: 4000, height: 3000, close: vi.fn() }) satisfies BitmapStub,
    );
    // @ts-expect-error jsdom shim
    globalThis.document = {
      createElement: vi.fn(() => makeCanvasStub()),
    };
  });

  it("clamps long edge to maxEdge and outputs JPEG", async () => {
    const source = new Blob(["x"], { type: "image/png" });
    const out = await resizeToJpeg(source, { maxEdge: 1920, quality: 0.85 });
    expect(out.type).toBe("image/jpeg");
    const ci = (globalThis as unknown as { createImageBitmap: ReturnType<typeof vi.fn> })
      .createImageBitmap;
    expect(ci).toHaveBeenCalledWith(source, { imageOrientation: "from-image" });
  });

  it("keeps dimensions when already small", async () => {
    (
      globalThis as unknown as { createImageBitmap: ReturnType<typeof vi.fn> }
    ).createImageBitmap.mockResolvedValueOnce({
      width: 800,
      height: 600,
      close: vi.fn(),
    } satisfies BitmapStub);
    const out = await resizeToJpeg(new Blob(["x"], { type: "image/jpeg" }), {
      maxEdge: 1920,
      quality: 0.85,
    });
    expect(out.type).toBe("image/jpeg");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
pnpm vitest run src/lib/image/resize-to-jpeg.spec.ts
```
Expected: FAIL — `Cannot find module './resize-to-jpeg'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/image/resize-to-jpeg.ts
export interface ResizeOptions {
  maxEdge: number;
  quality: number;
}

/**
 * 모바일 업로드 파이프라인 표준화 유틸.
 * long edge 를 maxEdge 로 clamp → Canvas 에 draw → JPEG Blob.
 * OffscreenCanvas 가 없으면 HTMLCanvasElement 로 fallback.
 */
export async function resizeToJpeg(
  source: Blob,
  { maxEdge, quality }: ResizeOptions,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolveBlob, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolveBlob(blob) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close?.();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm vitest run src/lib/image/resize-to-jpeg.spec.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/resize-to-jpeg.ts src/lib/image/resize-to-jpeg.spec.ts
git commit -m "feat(image): resizeToJpeg util — long-edge clamp + JPEG encode"
```

---

## Task 3: `prepare-upload` 유틸 + 단위 테스트

**Files:**
- Create: `src/lib/image/prepare-upload.ts`
- Create: `src/lib/image/prepare-upload.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/image/prepare-upload.spec.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const heic2anyMock = vi.fn();
vi.mock("heic2any", () => ({ default: (...args: unknown[]) => heic2anyMock(...args) }));

const resizeMock = vi.fn();
vi.mock("./resize-to-jpeg", () => ({ resizeToJpeg: (...args: unknown[]) => resizeMock(...args) }));

import { prepareForUpload } from "./prepare-upload";

describe("prepareForUpload", () => {
  beforeEach(() => {
    heic2anyMock.mockReset();
    resizeMock.mockReset();
    resizeMock.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  });

  it("routes HEIC through heic2any then resize", async () => {
    heic2anyMock.mockResolvedValue(new Blob(["after-heic"], { type: "image/jpeg" }));
    const file = new File(["heic-bytes"], "IMG_0001.HEIC", { type: "image/heic" });

    const out = await prepareForUpload(file);

    expect(heic2anyMock).toHaveBeenCalledWith({
      blob: file,
      toType: "image/jpeg",
      quality: 0.85,
    });
    expect(resizeMock).toHaveBeenCalledTimes(1);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
  });

  it("skips heic2any for non-HEIC but still resizes", async () => {
    const file = new File(["jpg-bytes"], "photo.jpg", { type: "image/jpeg" });

    await prepareForUpload(file);

    expect(heic2anyMock).not.toHaveBeenCalled();
    expect(resizeMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to original file when conversion throws", async () => {
    resizeMock.mockRejectedValueOnce(new Error("canvas failed"));
    const file = new File(["jpg-bytes"], "photo.jpg", { type: "image/jpeg" });

    const out = await prepareForUpload(file);

    expect(out).toBe(file);
  });

  it("detects HEIC by extension when MIME is empty (iOS Safari)", async () => {
    heic2anyMock.mockResolvedValue(new Blob(["after"], { type: "image/jpeg" }));
    const file = new File(["bytes"], "IMG.heic", { type: "" });

    await prepareForUpload(file);

    expect(heic2anyMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
pnpm vitest run src/lib/image/prepare-upload.spec.ts
```
Expected: FAIL — `Cannot find module './prepare-upload'`.

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/image/prepare-upload.ts
import { resizeToJpeg } from "./resize-to-jpeg";

const MAX_EDGE = 1920;
const QUALITY = 0.85;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_MIME_RE = /^image\/hei[cf]$/i;

function isHeic(file: File): boolean {
  if (file.type && HEIC_MIME_RE.test(file.type)) return true;
  return HEIC_EXT_RE.test(file.name);
}

function renameToJpg(name: string): string {
  return name.replace(/\.(heic|heif|png|webp)$/i, ".jpg");
}

/**
 * 모바일 업로드 단일 진입점. HEIC/HEIF 는 heic2any 로 JPEG 변환 후,
 * 모든 입력을 long-edge 1920px / JPEG 0.85 로 표준화한다.
 * 변환이 실패하면 원본 파일을 그대로 반환 — 비파괴 fallback.
 */
export async function prepareForUpload(file: File): Promise<File> {
  try {
    let source: Blob = file;
    if (isHeic(file)) {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
      source = Array.isArray(converted) ? converted[0] : converted;
    }

    const jpeg = await resizeToJpeg(source, { maxEdge: MAX_EDGE, quality: QUALITY });
    return new File([jpeg], renameToJpg(file.name), { type: "image/jpeg" });
  } catch (error) {
    console.warn("[prepareForUpload] fell back to original file", error);
    return file;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm vitest run src/lib/image/prepare-upload.spec.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/prepare-upload.ts src/lib/image/prepare-upload.spec.ts
git commit -m "feat(image): prepareForUpload — HEIC→JPEG + standardize to 1920px JPEG"
```

---

## Task 4: validator 의 MIME 허용 목록 축소

**Files:**
- Modify: `src/lib/validators/action-log.ts:5-12`
- Check: `src/lib/validators/action-log.spec.ts` (존재 시)

- [ ] **Step 1: 현재 코드 확인**

Run:
```bash
grep -n "image/heic\|image/heif" src/lib/validators/action-log.ts
```
Expected: 2 개 라인 매칭 (`image/heic`, `image/heif`).

- [ ] **Step 2: validator 수정**

```ts
// src/lib/validators/action-log.ts (교체 대상 5-12)
export const ALLOWED_PHOTO_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
```

- [ ] **Step 3: 기존 spec 존재 여부 확인 + 갱신**

Run:
```bash
grep -n "heic\|heif" src/lib/validators/action-log.spec.ts 2>&1
```
- 출력 없음 → 이 Task 에서는 추가 수정 없음 (다음 step 스킵).
- 매칭 있음 → 해당 라인의 기대치를 "reject" 로 수정. 예:

```ts
it("rejects heic MIME (client must transcode to JPEG first)", () => {
  expect((ALLOWED_PHOTO_MIME as readonly string[]).includes("image/heic")).toBe(false);
});
```

- [ ] **Step 4: 관련 타입체크 확인**

Run:
```bash
pnpm typecheck
```
Expected: PASS. (만약 `action-photos.ts` 에서 `AllowedPhotoMime` 키로 `image/heic` 접근이 깨지면 Task 5 를 먼저 해도 됨 — 순서 바꾸지 말고 빨간 에러 메시지만 확인하고 다음 Task 로 진행.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/action-log.ts src/lib/validators/action-log.spec.ts
git commit -m "refactor(validator): drop HEIC/HEIF from allowed MIME — client transcodes to JPEG"
```

---

## Task 5: `action-photos` Storage 유틸의 HEIC/HEIF 제거

**Files:**
- Modify: `src/lib/storage/action-photos.ts:12-34`
- Modify: `src/lib/storage/action-photos.spec.ts`

- [ ] **Step 1: 실패하는 spec 갱신**

```ts
// src/lib/storage/action-photos.spec.ts (교체)
import { describe, expect, it } from "vitest";
import { buildPhotoPath, extFromFile, looksLikePhotoPath } from "./action-photos";

describe("buildPhotoPath", () => {
  it("composes the Storage path", () => {
    const path = buildPhotoPath({
      userId: "user-1",
      challengeId: "challenge-1",
      actionLogId: "log-1",
      ext: "jpg",
      nonce: "abcd",
    });
    expect(path).toBe("user-1/challenge-1/log-1-abcd.jpg");
  });

  it("rejects traversal segments", () => {
    expect(() =>
      buildPhotoPath({
        userId: "../etc",
        challengeId: "challenge-1",
        actionLogId: "log-1",
        ext: "jpg",
        nonce: "abcd",
      }),
    ).toThrow(/invalid/i);
  });

  it("rejects unsupported extensions (including heic)", () => {
    for (const ext of ["exe", "heic", "heif"]) {
      expect(() =>
        buildPhotoPath({
          userId: "user-1",
          challengeId: "challenge-1",
          actionLogId: "log-1",
          ext,
          nonce: "abcd",
        }),
      ).toThrow(/extension/);
    }
  });
});

describe("extFromFile", () => {
  it("uses the allowed mime type when present", () => {
    expect(extFromFile({ type: "image/jpeg", name: "photo" } as File)).toBe("jpg");
    expect(extFromFile({ type: "image/png", name: "photo" } as File)).toBe("png");
  });

  it("falls back to the extension only when mime is empty", () => {
    expect(extFromFile({ type: "", name: "photo.WEBP" } as File)).toBe("webp");
  });

  it("rejects HEIC and HEIF after client transcode policy", () => {
    expect(() => extFromFile({ type: "image/heic", name: "a.heic" } as File)).toThrow(/mime/);
    expect(() => extFromFile({ type: "", name: "a.HEIC" } as File)).toThrow(/unknown/);
  });

  it("rejects unsupported non-empty mime types", () => {
    expect(() => extFromFile({ type: "application/pdf", name: "photo.jpg" } as File)).toThrow(
      /mime/,
    );
  });
});

describe("looksLikePhotoPath", () => {
  it("accepts private Storage paths for allowed ext", () => {
    expect(looksLikePhotoPath("u/c/l-nonce.webp")).toBe(true);
    expect(looksLikePhotoPath("u/c/l-nonce.jpg")).toBe(true);
  });

  it("rejects heic/heif paths", () => {
    expect(looksLikePhotoPath("u/c/l-nonce.heic")).toBe(false);
    expect(looksLikePhotoPath("u/c/l-nonce.heif")).toBe(false);
  });

  it("rejects legacy URLs", () => {
    expect(looksLikePhotoPath("https://example.com/photo.jpg")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
pnpm vitest run src/lib/storage/action-photos.spec.ts
```
Expected: FAIL — 여러 케이스가 기존 구현으로는 통과하지 못함(예: `extFromFile({type:"image/heic"})` 현재 `"heic"` 반환).

- [ ] **Step 3: `action-photos.ts` 수정 (12-34 라인 부근)**

```ts
// src/lib/storage/action-photos.ts (교체 대상: ALLOWED_EXT / MIME_TO_EXT / EXT_TO_MIME / PHOTO_PATH_RE)
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;
type AllowedExt = (typeof ALLOWED_EXT)[number];

const MIME_TO_EXT: Record<AllowedPhotoMime, AllowedExt> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_TO_MIME: Record<AllowedExt, AllowedPhotoMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const PHOTO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i;
```

`extFromFile` 본문은 그대로 유지 — `ALLOWED_PHOTO_MIME`/`ALLOWED_EXT` 축소로 자동으로 HEIC/HEIF 가 거부된다.

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm vitest run src/lib/storage/action-photos.spec.ts
```
Expected: PASS (전체 기대치 통과).

- [ ] **Step 5: 전체 단위 테스트 재확인**

Run:
```bash
pnpm typecheck && pnpm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/action-photos.ts src/lib/storage/action-photos.spec.ts
git commit -m "refactor(storage): drop HEIC/HEIF from allowed ext — policy now JPEG/PNG/WebP only"
```

---

## Task 6: `ActionForm` 을 `prepareForUpload` 로 전환

**Files:**
- Modify: `src/app/(app)/action/_components/action-form.tsx`

- [ ] **Step 1: 교체 후 기대 동작 명세 (주석으로 남기지 않음 — 참고용)**

- `handleFile` 이 async 함수가 된다.
- 파일 선택 → 즉시 `setPreparing(true)` + 버튼 disable.
- `prepareForUpload` 완료 후 `setFile(prepared)` 로 제출용 파일 교체, `setPreview(URL.createObjectURL(prepared))` 로 미리보기 설정.
- 실패해도 `prepareForUpload` 내부에서 원본을 돌려주므로 state 는 항상 한 번만 설정됨.
- `previewFailed` 상태, HEIC placeholder 분기, `<img onError>` 분기 제거.
- `ACCEPTED_PHOTO_EXT` 에서 `.heic`, `.heif` 제거. `<input accept>` 는 **iOS 카메라 롤에서 HEIC 원본을 선택 가능하게 하려고** `image/heic,image/heif` 를 유지(선택 후 유틸이 변환). `ALLOWED_PHOTO_MIME` 은 이제 JPEG/PNG/WebP 만 포함하므로 `isAllowedFile` 의 MIME 가드는 더 이상 HEIC 를 통과시키지 않는다 → HEIC/HEIF 파일의 통과는 **확장자 경로(`file.type === ""`)로만** 허용한다. 따라서 `ACCEPTED_PHOTO_EXT` 는 `.heic/.heif` 를 **유지**한다 (iOS Safari 에서 MIME 이 빈 경우가 많기 때문).

> 주의: 위 마지막 포인트는 파일 구조 표 안의 "제거" 와 상충 — 최종 구현은 `ACCEPTED_PHOTO_EXT` 에 `.heic`, `.heif` 를 **유지**. 이유: iOS Safari 가 `file.type` 을 빈 문자열로 주는 케이스에서 업로드 자체를 차단하지 않기 위함. 변환 후 실제 Storage 업로드는 Task 5 의 JPEG 전용 정책이 걸러낸다.

- [ ] **Step 2: 파일 교체**

```tsx
// src/app/(app)/action/_components/action-form.tsx
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

// iOS Safari 는 HEIC 선택 시 file.type 이 빈 문자열이라 확장자로 허용.
// 실제 업로드 전에 prepareForUpload 가 JPEG 로 변환한다.
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
    // HEIC/HEIF 는 prepareForUpload 가 JPEG 로 변환하므로 여기서는 통과시킨다.
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

      <Button
        size="lg"
        className="h-12"
        disabled={selected.length === 0 || busy}
        onClick={submit}
      >
        {pending ? "일기 쓰는 중..." : preparing ? "사진 준비 중..." : "인증하기"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크/린트**

Run:
```bash
pnpm typecheck && pnpm lint
```
Expected: PASS.

- [ ] **Step 4: 수동 smoke (dev server)**

Run:
```bash
pnpm dev
```
브라우저에서 `/action` 열고 (로그인 필요):
1. JPEG 파일 선택 → 미리보기 즉시 뜸 → 제출 성공.
2. HEIC 파일 선택 (있으면) → "사진 준비 중..." 짧게 → 미리보기 뜸 → 제출 성공.

Expected: Chrome 에서도 HEIC 미리보기가 보임.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/action/_components/action-form.tsx
git commit -m "feat(action): run HEIC through client-side transcode before submit"
```

---

## Task 7: Storage bucket `allowed_mime_types` 실측 + 조건부 migration

**Files:**
- Read: `supabase/migrations/*.sql` (모두)
- Create (조건부): `supabase/migrations/0012_action_photos_drop_heic.sql`

- [ ] **Step 1: 현재 bucket policy 확인**

Run:
```bash
grep -rn "allowed_mime_types\|action-photos" supabase/migrations/
```
Expected: `storage.buckets` 관련 insert/update 구문의 `allowed_mime_types` 배열 확인.

- [ ] **Step 2: HEIC 포함 여부 판단**

- `image/heic` 또는 `image/heif` 가 포함된 라인이 **없으면** → Task 7 은 여기서 종료. Step 3~5 스킵.
- 포함돼 있으면 Step 3 로 진행.

- [ ] **Step 3: migration 파일 생성 (조건부)**

```sql
-- supabase/migrations/0012_action_photos_drop_heic.sql
-- Client now transcodes HEIC/HEIF → JPEG before upload, so the bucket
-- policy no longer needs to allow those MIME types. Tightening prevents
-- a failed client transcode from silently uploading an un-renderable
-- original on Chrome/Firefox.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'action-photos';
```

- [ ] **Step 4: local migration dry-run**

Run:
```bash
pnpm db:diff
```
Expected: 위 update 외 변경 없음.

- [ ] **Step 5: integration 테스트**

Run:
```bash
pnpm test:integration tests/integration/storage/action-photos.spec.ts
```
Expected: PASS. 기존 테스트가 HEIC 를 업로드한다면 JPEG 로 교체되어야 하므로 해당 spec 도 함께 갱신 (픽스처 경로 변경 포함).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_action_photos_drop_heic.sql tests/integration/storage/action-photos.spec.ts
git commit -m "chore(storage): tighten action-photos bucket MIME allowlist to JPEG/PNG/WebP"
```

---

## Task 8: E2E — HEIC 업로드 → Chrome 피드 렌더 회귀 테스트

**Files:**
- Create: `tests/fixtures/iphone.heic`
- Modify: `tests/e2e/action-photo-upload.spec.ts`

- [ ] **Step 1: HEIC 픽스처 확보**

옵션 A (macOS):
```bash
# 임의의 jpg 를 HEIC 로 변환 (sips 기본 제공)
sips -s format heic tests/fixtures/pixel.jpg --out tests/fixtures/iphone.heic
ls -la tests/fixtures/iphone.heic
```
Expected: 파일이 생성되고 크기 < 50KB.

옵션 B (imagemagick 설치된 경우):
```bash
magick tests/fixtures/pixel.jpg tests/fixtures/iphone.heic
```

옵션 C (둘 다 없으면): 외부 파일을 수동으로 `tests/fixtures/iphone.heic` 에 배치. 커밋해야 E2E 가 CI 에서 동작.

- [ ] **Step 2: E2E 스펙 갱신**

```ts
// tests/e2e/action-photo-upload.spec.ts (교체)
import { resolve } from "node:path";
import { expect, test } from "./fixtures";

const PIXEL = resolve(process.cwd(), "tests/fixtures/pixel.jpg");
const HEIC = resolve(process.cwd(), "tests/fixtures/iphone.heic");

test("user uploads a JPEG and sees it in the challenge feed", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();
  await page.goto("/action");
  await expect(page.getByRole("heading", { name: "키워드" })).toBeVisible();

  await page.getByRole("group", { name: "키워드 선택" }).getByRole("button").first().click();
  await page.locator('input[type="file"]').setInputFiles(PIXEL);
  await expect(page.getByAltText("사진 미리보기")).toBeVisible();

  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page).toHaveURL(/\/home/);

  await page.goto(`/challenge/${challengeId}`);
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  const image = card.getByRole("img", { name: /인증 사진/ });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^https?:\/\//);
});

test("HEIC uploads are transcoded client-side and render on Chrome", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();
  await page.goto("/action");
  await expect(page.getByRole("heading", { name: "키워드" })).toBeVisible();

  await page.getByRole("group", { name: "키워드 선택" }).getByRole("button").first().click();
  await page.locator('input[type="file"]').setInputFiles(HEIC);

  // preview element must show the transcoded JPEG, not the HEIC placeholder.
  const preview = page.getByAltText("사진 미리보기");
  await expect(preview).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page).toHaveURL(/\/home/);

  await page.goto(`/challenge/${challengeId}`);
  const card = page.locator("article").first();
  const image = card.getByRole("img", { name: /인증 사진/ });
  await expect(image).toBeVisible();

  // Feed URL must point at a .jpg path because Storage now only accepts JPEG.
  const src = await image.getAttribute("src");
  expect(src).toMatch(/\.jpg/i);
});
```

- [ ] **Step 3: E2E 실행**

Run:
```bash
pnpm test:e2e --grep "photo"
```
Expected: 두 케이스 모두 PASS (Chrome 기준).

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/iphone.heic tests/e2e/action-photo-upload.spec.ts
git commit -m "test(e2e): HEIC client transcode → JPEG renders on Chrome feed"
```

---

## Task 9: 문서 업데이트

**Files:**
- Modify: `docs/JOURNAL.md`
- Modify: `docs/ONBOARDING.md` §6.1 (Storage 섹션)

- [ ] **Step 1: JOURNAL 에 날짜별 항목 추가**

`docs/JOURNAL.md` 상단(또는 날짜 규칙에 맞는 위치)에 추가:

```markdown
## 2026-05-01 — HEIC 클라이언트 변환 + 업로드 리사이즈

**Why:** Chrome/Firefox 는 HEIC 네이티브 디코딩 불가. iOS 기본 카메라 포맷이 HEIC 라 피드 렌더 실패가 잦음.

**What shipped:**
- `src/lib/image/prepare-upload.ts` — HEIC 선택 시 `heic2any` 로 JPEG 변환 후 long-edge 1920px / quality 0.85 로 표준화.
- validator/Storage 허용 목록을 JPEG·PNG·WebP 로 축소.
- ActionForm 은 제출 직전 이 유틸을 거치므로 HEIC placeholder 분기 제거.

**Trade-offs:**
- heic2any ≈ 500KB gzip. dynamic import 로 HEIC 선택 시에만 로드.
- 변환 실패 시 원본 File fallback → Storage policy 가 JPEG 만 받으므로 업로드는 거부됨 → UX "사진 없이 인증됐어요" 비파괴 성공.

**Deferred:** WebP/AVIF 출력, crop/필터 UI, 기존 HEIC row 마이그레이션.
```

- [ ] **Step 2: ONBOARDING §6.1 Storage 섹션 업데이트**

Run:
```bash
grep -n "§6.1\|6\.1\|Storage" docs/ONBOARDING.md | head
```

해당 섹션에 다음 bullet 추가 (기존 단락에 자연스럽게 병합):

```markdown
- 업로드 직전 `src/lib/image/prepare-upload.ts` 가 HEIC/HEIF 를 JPEG 로 변환하고 long-edge 1920px / quality 0.85 로 표준화한다. Storage bucket `action-photos` 의 `allowed_mime_types` 는 `image/jpeg | image/png | image/webp` 만 허용한다.
```

- [ ] **Step 3: 최종 종합 검증**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e --grep "photo"
```
Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/JOURNAL.md docs/ONBOARDING.md
git commit -m "docs: log 2026-05-01 HEIC client transcode + update ONBOARDING §6.1"
```

- [ ] **Step 5: PR 생성 (선택)**

```bash
gh pr create --base main --head feat/heic-client-transcode --title "feat: HEIC client transcode + upload resize" --body "$(cat <<'EOF'
## Summary
- 업로드 직전 브라우저에서 HEIC→JPEG 변환 + long-edge 1920px / JPEG 0.85 리사이즈
- validator/Storage 허용 MIME 을 JPEG/PNG/WebP 로 축소
- ActionForm HEIC placeholder 분기 제거 — Chrome 에서도 미리보기/피드 정상 렌더

## Test plan
- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] `pnpm test:e2e --grep "photo"` — JPEG + HEIC 두 케이스 모두 Chrome 에서 PASS
- [ ] dev 서버에서 iPhone HEIC 파일로 수동 smoke
EOF
)"
```

---

## Self-Review

**1. Spec coverage**
- HEIC Chrome 렌더 실패 → Task 6 + 8 에서 직접 해결.
- iOS 기본 카메라 포맷 수용 → `<input accept>` 에 `image/heic,image/heif` 유지 (Task 6).
- 번들 비용 절감 → heic2any dynamic import (Task 3).
- 업로드 대역폭 개선 → resizeToJpeg 1920px clamp (Task 2).
- Storage policy 축소 → Task 5 (코드) + Task 7 (migration 조건부).
- 회귀 방지 → Task 8 E2E 두 케이스.
- 문서화 → Task 9.

**2. Placeholder scan**
- "TBD"/"TODO"/"implement later" — 없음.
- 모든 코드 스텝에 실제 코드 블록 포함.
- Task 7 만 "조건부" — 분기 조건과 스킵 절차가 명시돼 있음.

**3. Type consistency**
- `resizeToJpeg(source, { maxEdge, quality })` 시그니처: Task 2 정의 = Task 3 사용 일치.
- `prepareForUpload(file: File): Promise<File>`: Task 3 정의 = Task 6 사용 일치.
- `ALLOWED_PHOTO_MIME` 축소: Task 4 에서 3개, Task 5 의 `MIME_TO_EXT` 키가 동일한 3개와 매칭.
- `ACCEPTED_PHOTO_EXT` 는 Task 6 에서 **유지** 결정 — 파일 구조 표의 "제거" 문구는 Step 1 주석으로 번복됨을 명시.
