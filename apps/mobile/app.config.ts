import type { ConfigContext, ExpoConfig } from "expo/config";

const appVariants = {
  dev: {
    displayName: "fromwith (dev)",
    bundleIdentifier: "app.fromwith.dev",
    scheme: "fromwith-dev",
    universalLinkDomain: "dev.fromwith.app",
  },
  staging: {
    displayName: "fromwith (stg)",
    bundleIdentifier: "app.fromwith.staging",
    scheme: "fromwith-staging",
    universalLinkDomain: "staging.fromwith.app",
  },
  prod: {
    displayName: "fromwith",
    bundleIdentifier: "app.fromwith",
    scheme: "fromwith",
    universalLinkDomain: "fromwith.app",
  },
} as const;

type AppVariant = keyof typeof appVariants;
type ExpoConfigWithNewArchitecture = ExpoConfig & {
  newArchEnabled: true;
};

function resolveAppVariant(value: string | undefined): AppVariant {
  if (value === "dev" || value === "staging" || value === "prod") {
    return value;
  }

  return "dev";
}

export default ({ config }: ConfigContext): ExpoConfigWithNewArchitecture => {
  const variant = resolveAppVariant(process.env.APP_VARIANT);
  const variantConfig = appVariants[variant];

  return {
    ...config,
    name: variantConfig.displayName,
    slug: "fromwith",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: variantConfig.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      bundleIdentifier: variantConfig.bundleIdentifier,
      icon: "./assets/expo.icon",
      supportsTablet: false,
      associatedDomains: [`applinks:${variantConfig.universalLinkDomain}`],
    },
    android: {
      package: variantConfig.bundleIdentifier,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: variantConfig.universalLinkDomain,
              pathPrefix: "/",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-dev-client",
        {
          addGeneratedScheme: variant === "dev",
        },
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          android: {
            image: "./assets/images/splash-icon.png",
            imageWidth: 76,
          },
        },
      ],
      "expo-secure-store",
      // 사진 인증(EVAL-0019) — 촬영/보관함 권한 안내 문구. 권한 거부 시 화면이 재시도 UI 를 띄운다.
      [
        "expo-image-picker",
        {
          photosPermission: "사진 인증을 위해 사진 보관함 접근이 필요해요.",
          cameraPermission: "사진 인증을 위해 카메라 사용이 필요해요.",
        },
      ],
      // Kakao 네이티브 SDK (ADR-0034 결정 1) — native app key 는 공개 가능 키
      // (카카오 콘솔에서 Android keyhash·iOS bundle id 로 사용처 제한).
      // plugin 이 빈 키를 거부하므로 env 가 있을 때만 포함 — 키 없는 빌드는 Kakao
      // 로그인이 비활성(런타임 가드 동일)이고 magic link 만 동작한다.
      [
        "expo-build-properties",
        {
          android: {
            extraMavenRepos: ["https://devrepo.kakao.com/nexus/content/groups/public/"],
          },
        },
      ],
      ...(process.env.EXPO_PUBLIC_KAKAO_NATIVE_KEY
        ? [
            [
              "@react-native-kakao/core",
              { nativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_KEY },
            ] satisfies [string, unknown],
          ]
        : []),
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant: variant,
      universalLinkDomain: variantConfig.universalLinkDomain,
      // BFF(Bearer) base URL 명시 override (ADR-0036 — transport-중립 계약).
      // 미지정 시 런타임은 `https://${universalLinkDomain}` 폴백(web = PWA + BFF 겸임).
      bffBaseUrl: process.env.EXPO_PUBLIC_BFF_BASE_URL,
    },
  };
};
