// 모킹업 §3-A "인증 빈도" stepper / §6-A 정보 카드 라벨 변환.
// goalCount(1~7) = 주 N회. 7회는 모킹업의 "매일" 별명.

export type FrequencyLabel = {
  /** stepper 가운데 표시되는 주 라벨 — "매일" 또는 "주 N번". */
  primary: string;
  /** 보조 헬퍼 — "한 주에 N번 인증". */
  helper: string;
  /** challenge 상세/홈 카드의 짧은 표기 — "매일 1회" / "주 N회". */
  detail: string;
};

export function goalCountLabel(goalCount: number): FrequencyLabel {
  if (!Number.isInteger(goalCount) || goalCount < 1 || goalCount > 7) {
    throw new RangeError(`goalCount must be 1..7, got ${goalCount}`);
  }
  if (goalCount === 7) {
    return { primary: "매일", helper: "한 주에 7번 인증", detail: "매일 1회" };
  }
  return {
    primary: `주 ${goalCount}번`,
    helper: `한 주에 ${goalCount}번 인증`,
    detail: `주 ${goalCount}회`,
  };
}
