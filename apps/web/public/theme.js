// Dimuat sinkron di <head> agar tema terpasang sebelum halaman digambar (tanpa kedip).
(() => {
  try {
    const t = localStorage.getItem("pp.theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  } catch {
    // Penyimpanan diblokir: pakai tema sistem.
  }
})();
