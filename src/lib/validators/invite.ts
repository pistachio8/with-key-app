import { z } from "zod";

// BE_SCHEMA §5.4: token은 서버에서 32바이트 랜덤 base64로 생성. 클라이언트는 non-empty만 확인.
export const inviteTokenSchema = z.string().min(1);

export type InviteToken = z.infer<typeof inviteTokenSchema>;
