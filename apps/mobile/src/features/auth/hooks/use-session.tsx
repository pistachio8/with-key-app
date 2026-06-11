// 세션 상태 단일 구독점 — 부팅 시 SecureStore 에서 세션을 복원하는 동안 isLoading 을
// 유지해 미인증 화면 flash 를 막는다 (EVAL-0012 AC: session restore, flash 금지).
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getSupabaseClient } from "@/services/supabase/client";

type SessionState = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, isLoading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState({ session: data.session, isLoading: false });
      })
      // 복원 실패(스토리지 예외 등)를 미인증으로 흡수 — isLoading 고착 방지
      .catch(() => {
        if (active) setState({ session: null, isLoading: false });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ session, isLoading: false });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
