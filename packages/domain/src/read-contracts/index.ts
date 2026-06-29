// read-contracts — 화면 read view-model 계약 barrel (EVAL-0016 · ADR-0037).
// web read 모듈(apps/web/src/lib/db/reads/*)이 추출 소스이며, 여기 타입이 SoT 다.
// 순수 타입 + transport 검증 zod 스키마만 — 네트워크/클라이언트 코드 금지 (04 A2 domain 순수성).
export * from "./challenge";
export * from "./group";
export * from "./recap";
export * from "./feed";
export * from "./invite";
export * from "./penalty";
