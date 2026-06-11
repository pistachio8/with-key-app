// jest(node CJS) 런타임 전용 타입 보강 — RN tsconfig 에 node 타입이 없어 spec 이 쓰는
// 최소 표면만 선언한다. @types/node 를 devDep 으로 넣으면 RN 전역 타입과 충돌하므로 금지.
// 주의: ambient 선언이라 앱 코드에서도 node:fs/__dirname 이 typecheck 를 통과하지만
// Metro 번들 런타임에는 존재하지 않는다(크래시 경로) — *.spec.* 밖에서 사용 금지.
declare const __dirname: string;

declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
