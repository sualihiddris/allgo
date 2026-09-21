import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.DRIVER_GOOGLE_MAPS_ANDROID_API_KEY ?? "",
      },
    },
  },

  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey:
        process.env.DRIVER_GOOGLE_MAPS_IOS_API_KEY ?? "",
    },
  },
});
