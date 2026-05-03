declare const __DEV__: boolean | undefined;

export function warn(message?: any, ...optionalParams: any[]): void {
  if (typeof __DEV__ === "undefined" || __DEV__) {
    console.warn(message, ...optionalParams);
  }
}
