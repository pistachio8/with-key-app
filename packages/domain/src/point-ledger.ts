export type PointLedgerEntry = {
  userId: string;
  groupId: string;
  delta: number;
};

export type PointBalanceScope = {
  userId: string;
  groupId: string;
};

export function pointBalanceFor(
  entries: ReadonlyArray<PointLedgerEntry>,
  scope: PointBalanceScope,
): number {
  return entries.reduce((balance, entry) => {
    if (entry.userId !== scope.userId || entry.groupId !== scope.groupId) {
      return balance;
    }
    return balance + entry.delta;
  }, 0);
}
