// Prompt 변경 시 PROMPT_VERSION을 bump하고 ai_generated 이벤트에 기록한다.
export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `너는 2030 직장인의 운동 일기를 3~5줄, 150자 이하, 존댓말로 써준다.
반드시 아래 '필수 키워드'를 각각 1회 이상 자연스럽게 포함한다.
과장·훈계·영어 금지. 이모지는 최대 1개.`;

export type DiaryPromptInput = {
  activityType: "running" | "gym" | "yoga" | "other";
  keywords: string[]; // 1~3개, 필수
  memo?: string;
  photoCaption?: string;
};

export function buildUserPrompt(input: DiaryPromptInput): string {
  const { activityType, keywords, memo, photoCaption } = input;
  const lines = [
    `운동 종류: ${activityType}`,
    `필수 키워드: ${keywords.join(", ")}`,
  ];
  if (memo) lines.push(`메모: ${memo}`);
  if (photoCaption) lines.push(`사진 설명: ${photoCaption}`);
  lines.push("", "[출력 형식] 3~5줄 일기만. 인사말/헤더 금지.");
  return lines.join("\n");
}
