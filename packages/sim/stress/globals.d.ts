// Global yang tersedia saat uji beban berjalan di Node (Vitest). Sengaja hanya untuk folder
// stress: kode di src/ tetap tanpa akses ke Node atau DOM.
declare const process: { env: Record<string, string | undefined> };
declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };
declare function setTimeout(fn: (value?: unknown) => void, ms: number): unknown;
