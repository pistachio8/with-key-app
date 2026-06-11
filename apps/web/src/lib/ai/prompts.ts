// Prompt 변경 시 PROMPT_VERSION을 bump하고 ai_generated 이벤트에 기록한다.
// v4 (2026-05-28): meal 활동에 한해 업로드 시각 기반 끼니(아침/점심/저녁/야식)를 soft context 로 주입.
//                   keywords 가 아닌 맥락 힌트라 keywordCoverage 산식·fallback 게이트는 불변.
// v3 (2026-04-30): 키워드 커버리지 검증이 substring match 라 슬랭·띄어쓰기 리라이팅이 fallback 유발.
//                   "원문 글자 그대로 보존" 지시 추가로 keywordCoverage=1.0 성공률 ↑.
// v2 (2026-04-30): 응원 톤 → 1인칭 해요체 일기로 전환.
export const PROMPT_VERSION = "v4";

export const SYSTEM_PROMPT = `너는 2030 직장인이 본인 운동 일기를 방금 쓴 것처럼 3~5줄, 150자 이하로 기록한다.
1인칭 해요체 (예: "오늘 헬스 다녀왔어요", "괜히 뿌듯했어요"). 본인이 본인에게 남기는 톤.

# 필수 키워드 규칙 (가장 중요)
반드시 아래 '필수 키워드'를 각각 **원문 글자 그대로 1회 이상** 포함한다.
- 띄어쓰기·형태·어미 변경 금지. 예: 키워드가 "무거운날"이면 "무거운 날" / "무거운 하루" 로 풀지 말 것. "무거운날" 을 그대로 써라.
- 키워드가 슬랭이면 어색해도 그대로 삽입. 문장 안에서 자연스럽게 감싸되 글자 자체는 보존.
- 위 규칙이 지켜지지 않으면 일기 전체가 폐기된다.

# 금지
- 응원·칭찬 문구 ("수고하셨어요", "화이팅", "대단해요", "잘했어요" 등)
- 이름 호칭 ("○○님", "회원님" 등)
- 헤더·인사말·메타 문구 ("일기:", "오늘의 기록:" 등)
- 과장·훈계·영어·설명

이모지는 최대 1개. 마침표로 자연스럽게 끊어 쓴다.`;

import type { ActivityType } from "@withkey/domain";
import type { MealSlot } from "./meal-time";

export type DiaryPromptInput = {
  activityType: ActivityType;
  keywords: string[]; // 1~3개, 필수
  memo?: string;
  photoCaption?: string;
  // meal 활동에서만 호출부가 주입하는 끼니 맥락. keywords 가 아니라 soft hint 라 coverage 불간섭.
  mealSlot?: MealSlot;
};

export function buildUserPrompt(input: DiaryPromptInput): string {
  const { activityType, keywords, memo, photoCaption, mealSlot } = input;
  const quoted = keywords.map((k) => `"${k}"`).join(", ");
  const lines = [`운동 종류: ${activityType}`, `필수 키워드 (원문 글자 그대로 포함): ${quoted}`];
  // meal 끼니 맥락은 soft hint — 억지 삽입 금지라 필수 키워드 커버리지에 영향 주지 않는다.
  if (mealSlot)
    lines.push(`식사 시간대: ${mealSlot} (자연스러우면 일기에 녹이고, 억지로 넣지 말 것)`);
  if (memo) lines.push(`메모: ${memo}`);
  if (photoCaption) lines.push(`사진 설명: ${photoCaption}`);
  lines.push(
    "",
    "[출력 형식] 내가 오늘 운동한 걸 본인에게 남기듯 3~5줄 일기만 써줘.",
    "인사말/헤더/호칭 금지. '수고하셨어요' 같은 응원 말투 금지.",
    `위 키워드 ${quoted} 는 띄어쓰기·형태 변경 없이 글자 그대로 문장 안에 넣어줘.`,
  );
  return lines.join("\n");
}
