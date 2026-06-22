declare module "expo-router/entry";
declare module "expo-router" {
  export const Stack: any;
  export const Tabs: any;
  export const router: any;
  export function useRouter(): any;
  export function useLocalSearchParams<T = any>(): T;
  export const useSegments: any;
  export const Redirect: any;
}

export {};
