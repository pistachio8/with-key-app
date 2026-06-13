// 사진 인증 제출 service — BFF `POST /api/action-log` 단일 endpoint (D-7 spec C4 · ADR-0036 §1).
// native 압축 사진 + 입력으로 multipart FormData 를 만들어 bffPostFormData 로 보내고, 응답은
// @withkey/domain submitActionLogResponseSchema(zod 계약)로 parse 한다 — web Server Action 과
// 같은 코어가 만든 같은 봉투를 보므로 web↔RN 패리티가 by construction 으로 보장된다.
//
// FormData 필드는 web parseFormData 와 1:1 (challengeId·activityType·selectedKeywords[JSON]·
// shownKeywords[JSON]·rerollCount·memo?·photo?). secret(OpenAI·service-role)은 서버만 본다.
import { submitActionLogResponseSchema, type SubmitActionLogResponse } from "@withkey/domain";

import { bffPostFormData } from "@/services/api/bff-client";

// RN FormData 파일 파트 — { uri, name, type } 객체(web File 미지원, RN 관례).
// 업로드 정책(1920px/JPEG 0.85/HEIC→JPEG/5MB)은 호출 전 native 압축 단계가 적용한다.
export type NativePhotoPart = { uri: string; name: string; type: string };

export type SubmitActionLogInput = {
  challengeId: string;
  activityType: string;
  selectedKeywords: string[];
  shownKeywords: string[];
  rerollCount: number;
  /** 직접 입력 일기(채워지면 AI 건너뜀). MVP UI 는 AI 경로만 — defer. */
  memo?: string;
  /** 압축 완료된 native 사진. 미첨부(사진 없음) 제출도 허용. */
  photo?: NativePhotoPart | null;
};

export async function submitActionLog(
  input: SubmitActionLogInput,
): Promise<SubmitActionLogResponse> {
  const fd = new FormData();
  fd.append("challengeId", input.challengeId);
  fd.append("activityType", input.activityType);
  fd.append("selectedKeywords", JSON.stringify(input.selectedKeywords));
  fd.append("shownKeywords", JSON.stringify(input.shownKeywords));
  fd.append("rerollCount", String(input.rerollCount));
  if (input.memo) fd.append("memo", input.memo);
  if (input.photo) {
    // RN FormData 는 { uri, name, type } 객체를 파일 파트로 받는다(web File 미지원).
    fd.append("photo", input.photo as unknown as Blob);
  }

  const body = await bffPostFormData("/api/action-log", fd);
  // 계약 위반(필드 누락·error 코드 밖)은 즉시 throw — 깨진 응답이 UI .ok 분기에 닿지 않는다.
  return submitActionLogResponseSchema.parse(body);
}
