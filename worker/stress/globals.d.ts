// Global Node yang dipakai uji beban (Vitest), tidak tersedia di runtime Worker.
declare const process: { env: Record<string, string | undefined> };
