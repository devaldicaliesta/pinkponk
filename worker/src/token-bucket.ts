/** Rate limit sederhana per koneksi: `rate` token per detik, kapasitas sama dengan `rate`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rate: number,
    nowMs: number,
  ) {
    this.tokens = rate;
    this.last = nowMs;
  }

  take(nowMs: number): boolean {
    const elapsed = Math.max(0, nowMs - this.last) / 1000;
    this.last = nowMs;
    this.tokens = Math.min(this.rate, this.tokens + elapsed * this.rate);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
