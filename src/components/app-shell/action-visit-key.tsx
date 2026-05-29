"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// /challenge/[id]/action 으로 (재)진입한 횟수.
//
// 왜: Next.js 16 `cacheComponents` 가 같은 라우트로 forward soft-nav 재진입할 때
// ActionForm subtree 를 unmount 하지 않고 보존한다 → 작성 중 사진/메모가 그대로 남는다
// (실측 확인, spec 2026-05-29-action-form-reset-on-leave Phase 2). challengeId 가
// 그대로면 ActionForm 의 hydration effect 도 재실행되지 않아 in-place reset 이 안 걸린다.
// 그래서 진입마다 이 값을 1 올려 ActionForm 의 `key` 로 흘려 fresh remount 를 강제한다.
// 이 Provider 는 (app) layout(=/home↔/action 사이에 계속 mount) 에 두어야 usePathname
// 전이를 받는다. 형제 MarkActionStartedOnMount 는 keying 대상이 아니라 remount 되지 않음(H1).
const ActionVisitKeyContext = createContext(0);

const ACTION_ROUTE = /^\/challenge\/[^/]+\/action$/;

export function useActionVisitKey(): number {
  return useContext(ActionVisitKeyContext);
}

export function ActionVisitKeyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visitKey, setVisitKey] = useState(0);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // 렌더 중 파생 상태 업데이트(React 공식 패턴 "Adjusting state when a prop changes"):
  // pathname 이 /action 으로 바뀔 때마다(다른 /action URL 포함) visitKey 증가 →
  // 같은 렌더 패스에서 consumer(ActionFormKeyed)가 새 key 를 받아 remount.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (pathname != null && ACTION_ROUTE.test(pathname)) {
      setVisitKey((k) => k + 1);
    }
  }

  return (
    <ActionVisitKeyContext.Provider value={visitKey}>{children}</ActionVisitKeyContext.Provider>
  );
}
