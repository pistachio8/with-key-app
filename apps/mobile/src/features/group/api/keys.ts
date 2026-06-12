// 그룹 query key factory (03 §12 · ADR-0037).
//
// invalidation 기대값:
// - renameGroup / updateGroupAccount / deleteGroup 후 → groupKeys.detail(groupId), groupKeys.my()
// - acceptInvite(멤버 증가) 후 → groupKeys.detail(groupId), groupKeys.my()
// - createGroup 후 → groupKeys.my()
// - 로그아웃/계정 전환 → queryClient.clear()
export const groupKeys = {
  all: ["group"] as const,
  detail: (groupId: string) => [...groupKeys.all, "detail", groupId] as const,
  my: () => [...groupKeys.all, "my"] as const,
};
