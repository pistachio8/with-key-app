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
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant: variant,
      universalLinkDomain: variantConfig.universalLinkDomain,
    },
  };
};
