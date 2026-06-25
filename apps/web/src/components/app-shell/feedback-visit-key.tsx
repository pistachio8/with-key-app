"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// /me/feedback 으로 (재)진입한 횟수.
//
// 왜: Next.js 16 `cacheComponents` 가 같은 라우트로 forward soft-nav 재진입할 때
// FeedbackForm subtree 를 unmount 하지 않고 <Activity hidden> 으로 보존한다 →
// 제출 완료(done) 상태가 그대로 남아 재진입해도 입력 폼 대신 완료 화면이 보인다
// (EVAL-0048 / QA feedback ec828571). subtree 가 보존되면 컴포넌트 내부 effect 도
// 재실행되지 않아 in-place reset 이 안 걸린다 — action-visit-key.tsx 와 동일한 증상.
// 그래서 진입마다 이 값을 1 올려 FeedbackForm 의 `key` 로 흘려 fresh remount 를 강제한다.
// 이 Provider 는 (app) layout(=/me↔/me/feedback 사이에 계속 mount) 에 두어야 usePathname
// 전이를 받는다 — feedback subtree 안에 두면 그 자체가 hidden 되어 전이를 못 본다.
const FeedbackVisitKeyContext = createContext(0);

const FEEDBACK_ROUTE = /^\/me\/feedback$/;

export function useFeedbackVisitKey(): number {
  return useContext(FeedbackVisitKeyContext);
}

export function FeedbackVisitKeyProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visitKey, setVisitKey] = useState(0);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // 렌더 중 파생 상태 업데이트(React 공식 패턴 "Adjusting state when a prop changes"):
  // pathname 이 /me/feedback 으로 바뀔 때마다 visitKey 증가 → 같은 렌더 패스에서
  // consumer(FeedbackFormKeyed)가 새 key 를 받아 remount.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (pathname != null && FEEDBACK_ROUTE.test(pathname)) {
      setVisitKey((k) => k + 1);
    }
  }

  return (
    <FeedbackVisitKeyContext.Provider value={visitKey}>{children}</FeedbackVisitKeyContext.Provider>
  );
}
