export interface ClockSample {
  rtt: number;
  offset: number;
}

const MAX_SAMPLES = 8;

/**
 * Estimasi selisih jam lokal ke waktu simulasi server (gaya NTP).
 * Sampel dengan RTT terkecil paling akurat karena jalur pergi-pulangnya paling simetris.
 */
export class ClockSync {
  private samples: ClockSample[] = [];

  add(clientSentMs: number, serverMs: number, clientRecvMs: number): void {
    const rtt = clientRecvMs - clientSentMs;
    if (rtt < 0) return;
    this.samples.push({ rtt, offset: serverMs + rtt / 2 - clientRecvMs });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  get ready(): boolean {
    return this.samples.length > 0;
  }

  get rtt(): number | null {
    if (!this.samples.length) return null;
    const sorted = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? null;
  }

  get offset(): number {
    let best: ClockSample | null = null;
    for (const s of this.samples) if (!best || s.rtt < best.rtt) best = s;
    return best?.offset ?? 0;
  }

  serverNow(localMs: number): number {
    return localMs + this.offset;
  }

  reset(): void {
    this.samples = [];
  }
}
