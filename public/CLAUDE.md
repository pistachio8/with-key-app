# public/

Next.js의 정적 자산 디렉터리. 빌드 산출물이 **아님** — 모든 파일이 hand-authored.

## Owns / What's here

- `service-worker.js` — Web Push SW (hand-written). 본체 로직은 [`../src/lib/push/`](../src/lib/push/) 참조.
- `manifest.json` — PWA manifest. 브랜드 변경 시 `theme_color` · `icons` · `name` 등 직접 갱신.
- `icons/` — PWA 아이콘 (192 · 512).
- `file.svg` `globe.svg` `next.svg` `vercel.svg` `window.svg` — **Next.js scaffold dead asset** (참조 0건, 삭제 후보).

## Patterns / 자주 하는 변경

- 브랜드 변경 시: `manifest.json`의 `theme_color` · `name` 갱신 + `icons/` 교체.
- 푸시 동작 변경 시: `service-worker.js` 와 [`../src/lib/push/`](../src/lib/push/) 동시 PR.

## Gotcha

- import path는 `/foo.svg` (절대) — `public/` prefix는 들어가지 **않음**.
- `service-worker.js`는 빌드 산출물처럼 보여도 hand-written이니 손대기 전 [`../src/lib/push/`](../src/lib/push/) 와 한 번 정렬해서 보세요.

## See also / Cross-module dependencies

- Web Push 본체: [`../src/lib/push/`](../src/lib/push/) (구독 · dispatch · 스케줄러)
- 키 체계 ADR: [`../docs/adr/0001-supabase-publishable-secret-keys.md`](../docs/adr/0001-supabase-publishable-secret-keys.md)
