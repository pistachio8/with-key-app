// 주 단위 벌금 누적 모델의 SoT (spec 2026-06-02-weekly-penalty-accrual).
// goalCount(1~7) = "주 N회"(주간 빈도). 주차별로 목표를 평가·누적한다.
// 시간 의존(confirmedPenalty·currentWeekStatus)은 호출처가 now 를 1회 계산해 ctx 로 내려보낸다.
import { toKstDayKey, dayIndexOf } from "./done-days";

// dayIndex 1-based(시작일=1). week 1-based.
export function weekIndexOf(dayIndex: number): number {
  return Math.floor((dayIndex - 1) / 7) + 1;
}

export function totalWeeks(durationDays: number): number {
  return Math.ceil(durationDays / 7);
}

// 마지막 자투리 주만 일수 비례(올림), 그 외 full week 는 goalCount 그대로.
export function weekGoal(
  week: number,
  total: number,
  goalCount: number,
  durationDays: number,
): number {
  if (week < total || durationDays % 7 === 0) return goalCount;
  const remDays = durationDays - (total - 1) * 7; // 1..6
  return Math.ceil((goalCount * remDays) / 7);
}

// 한 주가 끝나는 일차 — 자투리(마지막) 주는 durationDays 로 클램프. week*7 직접 사용 금지.
export function weekEndDayIndex(week: number, durationDays: number): number {
  return Math.min(week * 7, durationDays);
}

export type CutoffPhase = "running" | "over" | "closed";

// 시간 의존 계산용 컨텍스트. 호출처(RSC)가 now 로 todayDayIndex 를 계산해 채운다.
export type CutoffContext = {
  phase: CutoffPhase;
  durationDays: number;
  todayDayIndex: number; // running 전용 (over/closed 면 무시)
  closedAt: string | null; // closed 전용
  startKey: string; // closed_at → dayIndex 변환 (KST day key)
};

// 정산 기준 마지막 일차 = "챌린지가 실제 진행된 마지막 날".
export function cutoffDayIndex(ctx: CutoffContext): number {
  if (ctx.phase === "running") return ctx.todayDayIndex - 1;
  if (ctx.phase === "over") return ctx.durationDays;
  // closed
  if (!ctx.closedAt) return ctx.durationDays;
  return Math.min(ctx.durationDays, dayIndexOf(toKstDayKey(ctx.closedAt), ctx.startKey));
}

// cutoff 안에 완전히 들어온(끝까지 진행된) 주 번호들. 부분 잘린 주·미발생 주 제외.
export function elapsedWeeks(ctx: CutoffContext): number[] {
  const total = totalWeeks(ctx.durationDays);
  const cutoff = cutoffDayIndex(ctx);
  const out: number[] = [];
  for (let w = 1; w <= total; w++) {
    if (weekEndDayIndex(w, ctx.durationDays) <= cutoff) out.push(w);
  }
  return out;
}

// KST day key 들을 주차 버킷(week → count)으로 분배. stray(범위 밖) 제외.
export function weekBucketsFromDayKeys(
  dayKeys: Iterable<string>,
  startKey: string,
  durationDays: number,
): Map<number, number> {
  const byWeek = new Map<number, number>();
  for (const dayKey of dayKeys) {
    const di = dayIndexOf(dayKey, startKey);
    if (di < 1 || di > durationDays) continue; // 시작 전·종료 후 stray 가드
    const week = weekIndexOf(di);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }
  return byWeek;
}

// 하루 N개 인증도 1회(KST distinct day) 후 주차 버킷에 분배.
export function countDoneDaysByUserByWeek(
  logs: ReadonlyArray<{ user_id: string; created_at: string }>,
  startKey: string,
  durationDays: number,
): Map<string, Map<number, number>> {
  const daySetByUser = new Map<string, Set<string>>();
  for (const l of logs) {
    let s = daySetByUser.get(l.user_id);
    if (!s) {
      s = new Set<string>();
      daySetByUser.set(l.user_id, s);
    }
    s.add(toKstDayKey(l.created_at));
  }
  const out = new Map<string, Map<number, number>>();
  for (const [user, days] of daySetByUser) {
    out.set(user, weekBucketsFromDayKeys(days, startKey, durationDays));
  }
  return out;
}

export type WeeklyParams = { goalCount: number; penaltyAmount: number };

// 끝난 주만 합산 → 단조 증가(현재 주·미발생 주 미포함이라 변동 없음).
export function confirmedPenalty(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): number {
  if (!Number.isFinite(params.penaltyAmount) || params.penaltyAmount <= 0) return 0;
  const total = totalWeeks(ctx.durationDays);
  let sum = 0;
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    const done = doneByWeek.get(week) ?? 0;
    if (done < goal) sum += params.penaltyAmount;
  }
  return sum;
}

// 끝난 모든 주의 목표를 빠짐없이 달성했는가 (penalty 무관 — 0원 챌린지 판정용).
export function achievedAllElapsedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: { goalCount: number },
): boolean {
  const total = totalWeeks(ctx.durationDays);
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    if ((doneByWeek.get(week) ?? 0) < goal) return false;
  }
  return true;
}

// 끝난 주의 done 합 (MVP 총 인증일·영수증 "나의 인증" 용).
export function doneInElapsedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
): number {
  let sum = 0;
  for (const week of elapsedWeeks(ctx)) sum += doneByWeek.get(week) ?? 0;
  return sum;
}

// 끝난 주 중 목표를 달성한 주 수 (영수증 "N주 중 M주 달성" 표시용).
export function countAchievedWeeks(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: { goalCount: number },
): number {
  const total = totalWeeks(ctx.durationDays);
  let n = 0;
  for (const week of elapsedWeeks(ctx)) {
    const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
    if ((doneByWeek.get(week) ?? 0) >= goal) n += 1;
  }
  return n;
}

// 그룹 누적 = Σ member confirmedPenalty (끝난 주만). status 가드는 호출처가 담당.
export function computeAccruedPot(
  members: ReadonlyArray<{ doneByWeek: ReadonlyMap<number, number> }>,
  ctx: CutoffContext,
  params: WeeklyParams,
): number {
  return members.reduce((sum, m) => sum + confirmedPenalty(m.doneByWeek, ctx, params), 0);
}

// 끝난 모든 주 달성자 중 총 인증일 최다 (동률 공동). POC 표시용.
export function pickMvpIds(
  members: ReadonlyArray<{ id: string; doneByWeek: ReadonlyMap<number, number> }>,
  ctx: CutoffContext,
  params: { goalCount: number },
): ReadonlyArray<string> {
  const achievers = members.filter((m) =>
    achievedAllElapsedWeeks(m.doneByWeek, ctx, { goalCount: params.goalCount }),
  );
  if (achievers.length === 0) return [];
  const totals = achievers.map((m) => doneInElapsedWeeks(m.doneByWeek, ctx));
  const max = Math.max(...totals);
  return achievers.filter((_, i) => totals[i] === max).map((m) => m.id);
}

export type CurrentWeekStatus = {
  week: number;
  goal: number;
  done: number;
  daysLeftInWeek: number; // 오늘 포함, 자투리 클램프 적용
  shortfall: number;
  atRiskAmount: number; // 이대로 끝나면 물 금액 (회복 가능). 0원 챌린지·달성 시 0
  imminent: boolean; // 무여유: 남은 가능일 <= 부족분
};

// 진행 중인 주 상태 — phase==='running' 일 때만. over/closed 면 null.
export function currentWeekStatus(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): CurrentWeekStatus | null {
  if (ctx.phase !== "running") return null;
  const total = totalWeeks(ctx.durationDays);
  const week = weekIndexOf(ctx.todayDayIndex);
  const goal = weekGoal(week, total, params.goalCount, ctx.durationDays);
  const done = doneByWeek.get(week) ?? 0;
  const daysLeftInWeek = weekEndDayIndex(week, ctx.durationDays) - ctx.todayDayIndex + 1;
  const shortfall = Math.max(0, goal - done);
  const hasPenalty = Number.isFinite(params.penaltyAmount) && params.penaltyAmount > 0;
  const atRiskAmount = hasPenalty && done < goal ? params.penaltyAmount : 0;
  const imminent = hasPenalty && shortfall > 0 && daysLeftInWeek <= shortfall;
  return { week, goal, done, daysLeftInWeek, shortfall, atRiskAmount, imminent };
}

export type WeekChipState = "achieved" | "missed" | "current" | "future";
export type WeekChip = { week: number; goal: number; done: number; state: WeekChipState };

// 모든 주의 칩 — 끝난 주(elapsed)는 달성/미달, 진행 주는 current, 나머지 future.
export function buildWeekChips(
  doneByWeek: ReadonlyMap<number, number>,
  ctx: CutoffContext,
  params: WeeklyParams,
): WeekChip[] {
  const total = totalWeeks(ctx.durationDays);
  const elapsed = new Set(elapsedWeeks(ctx));
  const currentWeek = ctx.phase === "running" ? weekIndexOf(ctx.todayDayIndex) : null;
  const chips: WeekChip[] = [];
  for (let w = 1; w <= total; w++) {
    const goal = weekGoal(w, total, params.goalCount, ctx.durationDays);
    const done = doneByWeek.get(w) ?? 0;
    let state: WeekChipState;
    if (elapsed.has(w)) state = done >= goal ? "achieved" : "missed";
    else if (w === currentWeek) state = "current";
    else state = "future";
    chips.push({ week: w, goal, done, state });
  }
  return chips;
}
