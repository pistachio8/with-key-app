// Metro 는 expo 내장 babel 설정을 쓰지만, jest(babel-jest) 는 이 파일이 있어야
// TS/JSX 를 변환할 수 있다 (pnpm isolated node_modules 라 babel-preset-expo 는 직접 devDep).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
