// write-contracts — 화면 write(mutation) 계약 barrel (D-7 spec · EVAL-0019).
// web Server Action 본문 SoT(apps/web/src/lib/action-log/*)가 추출 소스이며, 여기 zod 계약이
// web client·BFF route·RN service 가 공유하는 응답 SoT 다.
// 순수 타입 + transport 검증 zod 스키마만 — 네트워크/클라이언트 코드 금지 (04 A2 domain 순수성).
export * from "./action-log";
export * from "./penalty";
