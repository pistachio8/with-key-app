// 화면 read 로딩 최소 훅 — TanStack Query 채택은 spec 확정 대상(03 §0.3 권장→spec)이라
// 라이브러리 비의존 구현만 둔다. 채택 spec 이 확정되면 features/*/api/keys.ts 의
// query key factory 와 함께 useQuery 로 교체한다 (ADR-0037 §4 — 결정 필요).
// read 함수는 호출자가 useCallback 으로 안정화해야 한다 — identity 변경 시 재로드.
import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncReadState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "success"; data: T };

export function useAsyncRead<T>(read: () => Promise<T>) {
  const [state, setState] = useState<AsyncReadState<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  // 늦게 도착한 이전 read 응답이 최신 상태를 덮지 않도록 epoch 로 race 차단.
  const epochRef = useRef(0);

  const run = useCallback(
    async (mode: "initial" | "refresh") => {
      const epoch = ++epochRef.current;
      if (mode === "initial") setState({ status: "loading" });
      else setRefreshing(true);
      try {
        const data = await read();
        if (epoch === epochRef.current) setState({ status: "success", data });
      } catch (error) {
        // 메타만 로그 — 프롬프트/일기 본문 같은 내용물은 read 결과라 error 에 없음.
        console.error("[useAsyncRead] read failed", error);
        if (epoch === epochRef.current) {
          // refresh 실패는 기존 success 데이터를 보존 — 에러 화면으로 전환하지 않는다.
          setState((prev) =>
            mode === "refresh" && prev.status === "success" ? prev : { status: "error", error },
          );
        }
      } finally {
        if (epoch === epochRef.current && mode === "refresh") setRefreshing(false);
      }
    },
    [read],
  );

  useEffect(() => {
    void run("initial");
  }, [run]);

  /** 전체 로딩 상태로 재시도 (에러 화면의 "다시 시도"). */
  const reload = useCallback(() => {
    void run("initial");
  }, [run]);

  /** pull-to-refresh — 기존 데이터를 유지한 채 재조회. */
  const refresh = useCallback(() => run("refresh"), [run]);

  return { state, refreshing, reload, refresh };
}
