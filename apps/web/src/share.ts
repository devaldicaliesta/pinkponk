/** Bagikan lewat Web Share API bila ada; selain itu salin ke clipboard. */
export const shareText = async (
  text: string,
  url: string,
): Promise<"shared" | "copied" | "failed"> => {
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return "shared";
    }
  } catch {
    // Dibatalkan pengguna atau tidak diizinkan; lanjut ke clipboard.
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
};
