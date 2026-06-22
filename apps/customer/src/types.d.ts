// Type declarations for Expo packages without types
declare module "expo-router/entry";

// Browser API types for web platform
declare global {
  interface Window {
    localStorage: Storage;
  }
  const localStorage: Storage;
}

export {};
