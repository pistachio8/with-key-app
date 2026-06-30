// 전역 native 모듈 mock (EVAL-0052). 앱 라우터를 렌더하는 spec(read-only-screens·router-skeleton·
// invite-deep-link 등)이 push-notification capability 를 transitive import 할 때, expo-notifications 의
// import-time 부작용(Expo Go 경고 · device push token auto 등록)과 native bridge 접근을 차단한다.
// capability 전용 spec(register-token·unregister-token)은 자체 jest.mock 으로 이 기본값을 덮어쓴다.
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "" }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { DEFAULT: 5 },
}));
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-0000-0000-000000000000" }));
