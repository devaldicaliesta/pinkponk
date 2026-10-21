import {
  PROTOCOL_VERSION,
  parseQueueClient,
  QUEUE_TIMEOUT_MS,
  type QueueServer,
} from "@pinkponk/protocol";
import type { PlayMode } from "@pinkponk/sim";

export interface Ticket {
  id: string;
  key: string;
  joinedAt: number;
}

export interface MatchmakerDeps {
  now(): number;
  newRoomCode(): string;
  send(id: string, msg: QueueServer): void;
  /** Tutup koneksi setelah pesan terakhir terkirim. */
  close(id: string): void;
  /** Simpan tiket di koneksi agar antrean bisa dibangun ulang setelah hibernasi. */
  remember(id: string, ticket: Ticket): void;
}

// Batas atas antrean: di atas ini permintaan baru ditolak "busy" agar satu objek tidak
// kehabisan memori atau CPU saat lonjakan (misalnya serangan atau uji beban).
export const MAX_QUEUE = 2000;
/** Socket yang belum mengirim permintaan antrean ditutup setelah ini. */
export const QUEUE_HELLO_TIMEOUT_MS = 10_000;

export const queueKey = (mode: PlayMode, gamble: boolean): string =>
  `${mode}:${gamble ? "g" : "n"}`;

/** Antrean FIFO per kombinasi mode; dua tiket dengan kunci sama dipasangkan ke room baru. */
export class MatchmakerCore {
  private readonly waiting = new Map<string, Ticket[]>();
  private readonly byId = new Map<string, Ticket>();

  constructor(private readonly deps: MatchmakerDeps) {}

  get size(): number {
    return this.byId.size;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Bangun ulang dari tiket yang tersimpan di koneksi (setelah objek bangun dari hibernasi). */
  restore(tickets: Ticket[]): void {
    for (const t of [...tickets].sort((a, b) => a.joinedAt - b.joinedAt)) this.enqueue(t);
  }

  message(id: string, text: string): void {
    if (this.byId.has(id)) return;
    const msg = parseQueueClient(text);
    if (!msg) {
      this.fail(id, "bad-message");
      return;
    }
    if (msg.v !== PROTOCOL_VERSION) {
      this.fail(id, "outdated");
      return;
    }
    if (this.byId.size >= MAX_QUEUE) {
      this.fail(id, "busy");
      return;
    }
    const ticket: Ticket = { id, key: queueKey(msg.mode, msg.gamble), joinedAt: this.deps.now() };
    const partner = this.waiting.get(ticket.key)?.[0];
    if (partner) {
      this.remove(partner.id);
      const code = this.deps.newRoomCode();
      for (const t of [partner.id, id]) {
        this.deps.send(t, { t: "matched", code });
        this.deps.close(t);
      }
      return;
    }
    this.enqueue(ticket);
    this.deps.remember(id, ticket);
    this.deps.send(id, { t: "queued", waiting: this.waiting.get(ticket.key)?.length ?? 1 });
  }

  leave(id: string): void {
    this.remove(id);
  }

  /** Batalkan tiket yang terlalu lama menunggu. Mengembalikan waktu kedaluwarsa berikutnya. */
  sweep(): number | null {
    const now = this.deps.now();
    let next: number | null = null;
    for (const t of [...this.byId.values()]) {
      const expires = t.joinedAt + QUEUE_TIMEOUT_MS;
      if (expires <= now) {
        this.remove(t.id);
        this.deps.send(t.id, { t: "timeout" });
        this.deps.close(t.id);
      } else if (next === null || expires < next) {
        next = expires;
      }
    }
    return next;
  }

  private enqueue(t: Ticket): void {
    if (this.byId.has(t.id)) return;
    const list = this.waiting.get(t.key) ?? [];
    list.push(t);
    this.waiting.set(t.key, list);
    this.byId.set(t.id, t);
  }

  private remove(id: string): void {
    const t = this.byId.get(id);
    if (!t) return;
    this.byId.delete(id);
    const list = this.waiting.get(t.key)?.filter((x) => x.id !== id) ?? [];
    if (list.length) this.waiting.set(t.key, list);
    else this.waiting.delete(t.key);
  }

  private fail(id: string, code: "outdated" | "busy" | "bad-message"): void {
    this.deps.send(id, { t: "error", code });
    this.deps.close(id);
  }
}
