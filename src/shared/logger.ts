let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

function format(scope: string, level: string, message: string): string {
  return `[${new Date().toISOString()}] [${scope}] [${level}] ${message}`;
}

export function createLogger(scope: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (!debugEnabled) return;
      console.debug(format(scope, "DEBUG", message), ...args);
    },
    info(message: string, ...args: unknown[]) {
      if (!debugEnabled) return;
      console.info(format(scope, "INFO", message), ...args);
    },
    warn(message: string, ...args: unknown[]) {
      if (!debugEnabled) return;
      console.warn(format(scope, "WARN", message), ...args);
    },
    error(message: string, ...args: unknown[]) {
      if (!debugEnabled) return;
      console.error(format(scope, "ERROR", message), ...args);
    },
  };
}
