// 테스트 전용 — 테이블별 rows 를 돌려주는 chainable thenable supabase mock.
// 실제 supabase-js 빌더는 어느 체인 지점에서도 await 가능하므로 then 으로 resolve 한다.
// apps/web 의 read-contract-parity.spec.ts 와 동일 패턴 — 보존 eval 이 양쪽에서 대칭으로 돈다.
type Row = Record<string, unknown>;

export type MockTables = Record<string, Row[]>;

/** photo_path → signedUrl 매핑 (storage.createSignedUrls mock). */
export type MockSignedUrls = Record<string, string>;

function makeBuilder(rows: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "is", "in", "eq", "or", "not", "gt", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: Row[]; error: null; count: number }) => unknown) =>
    resolve({ data: rows, error: null, count: rows.length });
  return builder;
}

export function makeMockSupabase(tables: MockTables, signedUrls: MockSignedUrls = {}) {
  return {
    from: (table: string) => makeBuilder(tables[table] ?? []),
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((path) => ({ signedUrl: signedUrls[path] ?? null })),
            error: null,
          }),
      }),
    },
  };
}
