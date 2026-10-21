// localStorage bisa melempar error (mode privat, situs diblokir); semua akses lewat sini.
export const readJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Pengaturan tetap berlaku untuk sesi ini walau tidak tersimpan.
  }
};

export const writeRaw = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Abaikan; lihat catatan di atas.
  }
};
