import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OwnerOpenChallenge = {
  id: string;
};

/**
 * 사용자가 owner 인 그룹 중 `pending|accepted|active` 챌린지를 가진
 * 그룹의 가장 최근(`created_at desc`) 챌린지 1건. 없으면 null.
 *
 * `/challenge/new` 진입 가드(spec C8) 와 후속 라우팅 보강에서 사용.
 */
export const fetchOwnerOpenChallenge = cache(
  async (ownerId: string): Promise<OwnerOpenChallenge | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("challenges")
      .select("id, groups!inner(owner_id)")
      .eq("groups.owner_id", ownerId)
      .in("status", ["pending", "accepted", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { id: data.id as string } : null;
  },
);
