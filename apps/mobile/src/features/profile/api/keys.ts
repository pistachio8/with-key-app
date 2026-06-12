// 프로필(me) query key factory (03 §12 · ADR-0037).
//
// invalidation 기대값:
// - 프로필 이름 변경(후속 기능) 후 → profileKeys.displayName()
// - updateNotificationPrefs 후 → profileKeys.notificationPrefs()
// - createChallenge 첫 생성 후 → profileKeys.hasCreated()
// - 로그아웃/계정 전환 → queryClient.clear()
export const profileKeys = {
  all: ["profile"] as const,
  displayName: () => [...profileKeys.all, "display-name"] as const,
  hasCreated: () => [...profileKeys.all, "has-created"] as const,
  notificationPrefs: () => [...profileKeys.all, "notification-prefs"] as const,
};
