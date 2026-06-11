// jest(node CJS) 런타임 전용 타입 보강 — RN tsconfig 에 node 타입이 없어 spec 이 쓰는
// 최소 표면만 선언한다. @types/node 를 devDep 으로 넣으면 RN 전역 타입과 충돌하므로 금지.
// (런타임 __dirname 은 jest 가, 앱 번들에서는 Metro 가 모듈별로 제공한다.)
declare const __dirname: string;

declare module "node:fs" {
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}
