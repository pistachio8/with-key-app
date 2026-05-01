import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(128),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const notificationPrefsSchema = z.object({
  start: z.boolean(),
  deadline: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const unregisterPushSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
});
export type UnregisterPushInput = z.infer<typeof unregisterPushSchema>;
