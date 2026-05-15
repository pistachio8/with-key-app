import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name;
}
