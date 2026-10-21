// Uji beban jaringan sungguhan: banyak room + bot WebSocket, antrean cari lawan, dan
// pembaca leaderboard sekaligus. Default menyerang server lokal (`wrangler dev`).
//
//   node scripts/stress-online.mjs --rooms 50 --seconds 30
//   node scripts/stress-online.mjs --url https://pinkponk-dev.panduarah.my.id --yes
//
// Ke server publik wajib --yes: rate limit per IP (10 room/menit, 30 join/menit) memang
// akan menolak sebagian besar bot, dan itu hasil yang diharapkan (perlindungan bekerja).

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--"))
      acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? "1" : (all[i + 1] ?? "1")]);
    return acc;
  }, []),
);
const BASE = new URL(args.url ?? "http://localhost:8787");
const ROOMS = Number(args.rooms ?? 30);
const SECONDS = Number(args.seconds ?? 20);
const QUEUE_PAIRS = Number(args.queue ?? 10);
const LB_READS = Number(args.lb ?? 200);
const INPUT_HZ = Number(args["input-hz"] ?? 30);
const ORIGIN = args.origin ?? BASE.origin;
const PROTOCOL_VERSION = 2;
const local = ["localhost", "127.0.0.1"].includes(BASE.hostname);

if (!local && args.yes !== "1") {
  console.error(
    `Menolak menguji ${BASE.origin} tanpa --yes (server publik, ada pemain sungguhan).`,
  );
  process.exit(2);
}
if (typeof WebSocket !== "function") {
  console.error("Butuh Node 22+ (WebSocket bawaan).");
  process.exit(2);
}

const wsUrl = (path) => `${BASE.protocol === "https:" ? "wss:" : "ws:"}//${BASE.host}${path}`;
const headers = { Origin: ORIGIN };
const randomHex = (n) =>
  [...crypto.getRandomValues(new Uint8Array(n))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const stats = {
  roomsCreated: 0,
  roomCreateFail: {},
  wsOpened: 0,
  wsFail: 0,
  started: 0,
  snapshots: 0,
  closes: {},
  rtt: [],
  serverErrors: {},
  queueMatched: 0,
  queueOther: {},
  lbStatus: {},
  lbLatency: [],
};
const bump = (obj, k) => {
  obj[k] = (obj[k] ?? 0) + 1;
};

const encodeInput = (viewTick, x, power) => {
  const buf = new ArrayBuffer(21);
  const v = new DataView(buf);
  v.setUint8(0, 1);
  v.setUint32(1, Math.max(0, viewTick));
  v.setFloat32(5, x);
  v.setInt8(9, 0);
  v.setInt8(10, 0);
  v.setUint8(11, Math.round(power * 255));
  v.setUint8(12, Math.random() < 0.02 ? 1 : 0);
  v.setFloat64(13, 0);
  return buf;
};

const encodePing = (ms) => {
  const buf = new ArrayBuffer(9);
  const v = new DataView(buf);
  v.setUint8(0, 2);
  v.setFloat64(1, ms);
  return buf;
};

const percentile = (list, p) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const openSocket = (path) =>
  new Promise((resolve) => {
    let ws;
    try {
      // Opsi headers khusus WebSocket Node (undici); browser selalu mengirim Origin sendiri.
      ws = new WebSocket(wsUrl(path), { headers });
    } catch {
      stats.wsFail++;
      resolve(null);
      return;
    }
    ws.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      stats.wsFail++;
      resolve(null);
    }, 10_000);
    ws.onopen = () => {
      clearTimeout(timer);
      stats.wsOpened++;
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      stats.wsFail++;
      resolve(null);
    };
  });

const bot = async (code, nick, create, endAt) => {
  const ws = await openSocket(`/ws/room/${code}`);
  if (!ws) return;
  let tick = 0;
  let playing = false;
  let rally = false;
  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);
      if (msg.t === "start") {
        playing = true;
        stats.started++;
      }
      if (msg.t === "error") bump(stats.serverErrors, msg.code);
      return;
    }
    const v = new DataView(e.data);
    const type = v.getUint8(0);
    if (type === 10) {
      stats.snapshots++;
      tick = v.getUint32(1);
      // Byte 5 = fase pertandingan; 3 = reli.
      rally = v.getUint8(5) === 3;
    } else if (type === 11) {
      stats.rtt.push(performance.now() - v.getFloat64(1));
    }
  };
  ws.onclose = (e) => bump(stats.closes, `${e.code}${e.reason ? ` ${e.reason}` : ""}`);
  ws.send(
    JSON.stringify({
      t: "hello",
      v: PROTOCOL_VERSION,
      nick,
      create,
      config: { mode: "swing", bestOf: 5, gamble: true },
      token: null,
      player: randomHex(32),
    }),
  );
  // Meniru client sungguhan: 30 Hz saat reli (bat bergerak), di luar reli 10 Hz.
  let x = 0;
  let lastSend = 0;
  const input = setInterval(() => {
    if (!INPUT_HZ || !playing || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (!rally && now - lastSend < 100) return;
    if (rally) x = Math.max(-1, Math.min(1, x + (Math.random() - 0.5) * 0.3));
    lastSend = now;
    ws.send(encodeInput(tick, x, Math.random()));
  }, 1000 / Math.max(1, INPUT_HZ));
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodePing(performance.now()));
  }, 1000);
  await new Promise((r) => setTimeout(r, Math.max(0, endAt - Date.now())));
  clearInterval(input);
  clearInterval(ping);
  ws.close(1000, "done");
};

const createRoom = async () => {
  try {
    const res = await fetch(new URL("/api/room", BASE), { method: "POST", headers });
    if (!res.ok) {
      bump(stats.roomCreateFail, res.status);
      return null;
    }
    stats.roomsCreated++;
    return (await res.json()).code;
  } catch {
    bump(stats.roomCreateFail, "network");
    return null;
  }
};

const queueBot = async () => {
  const ws = await openSocket("/ws/queue");
  if (!ws) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      bump(stats.queueOther, "no-match-10s");
      ws.close();
      resolve();
    }, 10_000);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === "queued") return;
      clearTimeout(timer);
      if (msg.t === "matched") stats.queueMatched++;
      else bump(stats.queueOther, msg.code ?? msg.t);
      resolve();
    };
    ws.onclose = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.send(JSON.stringify({ t: "queue", v: PROTOCOL_VERSION, mode: "swing", gamble: false }));
  });
};

const leaderboardRead = async () => {
  const t0 = performance.now();
  try {
    const res = await fetch(new URL("/api/leaderboard", BASE));
    await res.arrayBuffer();
    bump(stats.lbStatus, res.status);
  } catch {
    bump(stats.lbStatus, "network");
  }
  stats.lbLatency.push(performance.now() - t0);
};

console.log(
  `Uji beban ${BASE.origin}: ${ROOMS} room (${ROOMS * 2} bot) × ${SECONDS} dtk, ` +
    `${QUEUE_PAIRS * 2} bot antrean, ${LB_READS} baca leaderboard`,
);
const t0 = Date.now();
const endAt = t0 + SECONDS * 1000 + 3000;
const codes = await Promise.all(Array.from({ length: ROOMS }, createRoom));
const bots = [];
codes.forEach((code, i) => {
  if (!code) return;
  bots.push(bot(code, `Bot${i}A`, true, endAt));
  // Pemain kedua masuk sedikit belakangan, seperti teman yang membuka link.
  bots.push(new Promise((r) => setTimeout(r, 300)).then(() => bot(code, `Bot${i}B`, false, endAt)));
});
const extras = [
  ...Array.from({ length: QUEUE_PAIRS * 2 }, queueBot),
  ...Array.from({ length: LB_READS }, leaderboardRead),
];
await Promise.all([...bots, ...extras]);
// Beri waktu event close terakhir sampai.
await new Promise((r) => setTimeout(r, 500));

const played = Math.max(1, SECONDS);
const startedBots = Math.max(1, stats.started);
const report = {
  "room dibuat": `${stats.roomsCreated}/${ROOMS}`,
  "gagal buat room": JSON.stringify(stats.roomCreateFail),
  "WebSocket terbuka / gagal": `${stats.wsOpened} / ${stats.wsFail}`,
  "bot mulai bermain": stats.started,
  "snapshot per bot per detik": (stats.snapshots / startedBots / played).toFixed(1),
  "RTT p50 / p95 (ms)": `${percentile(stats.rtt, 50)?.toFixed(1)} / ${percentile(stats.rtt, 95)?.toFixed(1)}`,
  "error dari server": JSON.stringify(stats.serverErrors),
  "kode penutupan": JSON.stringify(stats.closes),
  "antrean dipasangkan": `${stats.queueMatched}/${QUEUE_PAIRS * 2}`,
  "antrean lainnya": JSON.stringify(stats.queueOther),
  "leaderboard status": JSON.stringify(stats.lbStatus),
  "leaderboard p50 / p95 (ms)": `${percentile(stats.lbLatency, 50)?.toFixed(1)} / ${percentile(stats.lbLatency, 95)?.toFixed(1)}`,
  "durasi total (dtk)": ((Date.now() - t0) / 1000).toFixed(1),
};
console.table(report);

// Di server lokal (tanpa rate limit) semua harus lancar; di server publik hanya dilaporkan.
if (local) {
  const problems = [];
  if (stats.roomsCreated < ROOMS) problems.push("sebagian room gagal dibuat");
  if (stats.started < stats.roomsCreated * 2) problems.push("sebagian bot tidak mulai bermain");
  if (stats.snapshots / startedBots / played < 20) problems.push("snapshot terlalu jarang");
  if (stats.queueMatched < QUEUE_PAIRS * 2) problems.push("antrean tidak memasangkan semua bot");
  if ((stats.lbStatus[200] ?? 0) < LB_READS) problems.push("leaderboard gagal dibaca");
  if (problems.length) {
    console.error(`GAGAL: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("LULUS");
}
// Koneksi keep-alive HTTP bisa menahan proses; hasil sudah dicetak.
process.exit(0);
