import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

// React cache → 같은 request scope 안에서 supabase.auth.getUser 를 1회만 호출.
// challenge/[id] layout + 각 탭 page 가 동시에 user 를 필요로 하는 경우 dedupe.
export const getAuthedUser = cache(async (): Promise<{ user: User | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null };
  return { user: data.user };
});
