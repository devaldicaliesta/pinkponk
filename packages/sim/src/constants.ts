// Satuan meter dan detik. Permukaan meja di y = 0, net di z = 0.
// Pemain 0 di sisi z > 0, pemain 1 di sisi z < 0.

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;
export const MS_PER_TICK = 1000 / TICK_RATE;
// Bola sengaja diperlambat untuk layar HP: waktu fisika bola berjalan sekian kali waktu nyata.
// Bentuk lintasan tetap seperti fisika asli, hanya durasinya lebih panjang; bat tetap waktu nyata.
export const BALL_TIME_SCALE = 0.72;
export const BALL_DT = DT * BALL_TIME_SCALE;

export const TABLE_HALF_W = 0.7625;
export const TABLE_HALF_L = 1.37;
export const NET_H = 0.1525;
export const NET_HALF_W = TABLE_HALF_W + 0.1525;
export const FLOOR_Y = -0.76;
export const BALL_R = 0.02;

export const GRAVITY = 9.81;
// k = 0.5 * rho * Cd * A / m untuk bola 2,7 g berdiameter 40 mm.
export const DRAG_K = 0.14;
export const MAGNUS_K = 0.004;
export const TABLE_RESTITUTION = 0.89;
// Bagian slip permukaan yang dihapus saat memantul (maks 0,4 = menggelinding penuh).
export const TABLE_FRICTION = 0.22;
export const SPIN_DECAY_PER_TICK = 0.9995 ** BALL_TIME_SCALE;

// Titik pukul berada sedikit di belakang ujung meja.
export const HIT_PLANE_Z = TABLE_HALF_L + 0.22;
// Bola pendek bisa dipukul begitu turun di bawah tinggi ini setelah memantul.
export const LOW_HIT_Y = 0.16;
export const REACH = 0.38;
export const BAT_MAX_X = 1.1;
export const BAT_SPEED = 7;

export const MAX_SPIN = 180;

export const POINT_PAUSE_TICKS = Math.round(1.1 * TICK_RATE);
export const COUNTDOWN_TICKS = 3 * TICK_RATE;
export const SERVE_TOSS_VY = 2.4;
export const SERVE_AUTO_TICKS = 6 * TICK_RATE;
export const RALLY_TIMEOUT_TICKS = 8 * TICK_RATE;

// Batas waktu menunggu input pemain online untuk tick yang sudah lewat.
export const MAX_LAG_TICKS = Math.round(0.3 * TICK_RATE);
