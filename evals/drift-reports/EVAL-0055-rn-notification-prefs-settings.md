# Drift Report — EVAL-0055 RN 알림 설정 화면

- Task: **EVAL-0055** (Track: port · Kind: migration)
- Branch: `feat/rn-phase6-notifications`
- Date: 2026-07-01
- Trigger: PWA `/me` push-settings(notification_prefs 3종 토글 + 권한 요청)를 RN `(app)/(tabs)/me.tsx` 알림 설정 섹션으로 포팅. POC PRD §6.3 AC-6(종류별 on/off)·AC-7(권한 요청/거부 안내) 충족.

## Harness Impact Questions — 답변

1. **New folder structure? NO** — `apps/mobile/src/features/profile/` 기존 경로 확장.
2. **New naming convention? YES(경미)** — 신규 파일을 feature **루트**(`features/profile/notification-prefs.ts`·`NotificationSettingsSection.tsx`)에 두었다. 기존 profile feature 는 read service 를 `api/`(`profile-reads.ts`)에 두는데, 이번엔 task Target Files + AC 검증 경로 패턴(`pnpm test -- "src/features/profile/notification-prefs"` / `.../NotificationSettingsSection`)이 feature-root 경로를 요구해 그 위치에 맞췄다. 다른 feature 는 `api/`·`components/` 서브디렉토리 컨벤션이라 경미한 혼재. 후속 re-skin 슬라이스에서 정리 여부 판단.
3. **New dependency? NO** — 기존 deps 만(expo-notifications 는 push-notification capability 경유, react-native `Linking`·`Switch` 내장). 신규 패키지 없음.
4. **Verification commands changed? NO** — task 명시 커맨드 그대로.
5. **Harness instructions outdated? NO.**
6. **`.agents/` 문서 갱신? NO** — 경로/컨벤션 SoT 변경 없음(위 Q2 는 이 task 국소 결정).

## 재사용 · 경계 노트

- **prefs write**: `notification-prefs.ts` 가 domain `notificationPrefsSchema` 를 재사용(신규 스키마 정의 없음)해 `users.notification_prefs` 를 RLS self-row(`.eq("id", userId)`)로 update — web `updateNotificationPrefs`(#24 RN direct) 계약과 동일.
- **권한·토큰**: 토글 ON 시 `registerPushToken`(EVAL-0052 capability)을 재사용해 권한 확보(`requestPermissionsAsync` 내부 처리) + device_push_token 등록. 전체 OFF 시 `unregisterPushToken` 로 soft-delete. 컴포넌트는 expo-notifications 를 직접 import 하지 않아 capability 경계(04 §5.1)를 보존.
- **거부 안내(AC-7)**: `registerPushToken` 이 `permission_denied` 반환 시 토글을 되돌리고 `Linking.openSettings()` 안내만 노출(재요청 강요 없음).
- **PWA 경로 보존**: `push_subscriptions`(register/unregister) write 는 변경하지 않음(device_push_tokens 모델과 분리).
