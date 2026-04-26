// src/logger.ts
// Central logging control — import this once in main.ts
// To disable logs:  window.__LOGS__ = false
// To re-enable:     window.__LOGS__ = true   (or just open console and type it)

const IS_DEV = import.meta.env.DEV; // true on localhost, false on prod build

// Default: on in dev, off in prod
(window as any).__LOGS__ = IS_DEV;

const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log = (...args: any[]) => {
  if ((window as any).__LOGS__) _log(...args);
};

console.warn = (...args: any[]) => {
  if ((window as any).__LOGS__) _warn(...args);
};

// Always keep errors — comment this out if you want to silence those too
console.error = (...args: any[]) => {
  _error(...args);
};

export {};
