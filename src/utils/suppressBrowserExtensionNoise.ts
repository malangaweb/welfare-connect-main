const EXTENSION_NOISE_PATTERNS = [
  /channel secret not available yet/i,
  /extendedbroadcastmessage/i,
  /providersmanager/i,
  /inpage\.js/i,
];

const isKnownExtensionNoise = (message: string) =>
  EXTENSION_NOISE_PATTERNS.some((pattern) => pattern.test(message));

export const suppressBrowserExtensionNoise = () => {
  if (typeof window === 'undefined' || typeof console === 'undefined') {
    return;
  }

  const globalWindow = window as Window & {
    __malangaExtensionNoiseSuppressed?: boolean;
  };

  if (globalWindow.__malangaExtensionNoiseSuppressed) {
    return;
  }

  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        if (arg && typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    if (isKnownExtensionNoise(message)) {
      return;
    }

    originalConsoleError(...args);
  };

  globalWindow.__malangaExtensionNoiseSuppressed = true;
};
