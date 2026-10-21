import { BAT_MAX_X, clamp, emptyInput, MS_PER_TICK, type PlayerInput } from "@pinkponk/sim";
import { type PointerSample, readSwing, screenToBatX, tapAim } from "./swing";

/** Sumber input satu pemain manusia. `tapAt` dalam waktu dinding (performance.now). */
export interface HumanInput {
  /** Bentuk input untuk tick ini. `wallToSimMs` mengubah waktu dinding ke ms simulasi. */
  read(viewTick: number, wallToSimMs: (wall: number) => number): PlayerInput;
  /** Tap buatan (hook E2E). */
  injectTap?(wallMs: number): void;
  /** Tombol kemampuan Gamble dari tombol di layar. */
  pressAbility(): void;
  dispose(): void;
}

interface KeyMap {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  action: string[];
  ability: string[];
}

export const KEYS_SOLO: KeyMap = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  action: ["Space"],
  ability: ["KeyE", "KeyQ"],
};
export const KEYS_P1: KeyMap = {
  left: ["KeyA"],
  right: ["KeyD"],
  up: ["KeyW"],
  down: ["KeyS"],
  action: ["Space"],
  ability: ["KeyE"],
};
export const KEYS_P2: KeyMap = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  action: ["Enter", "NumpadEnter"],
  ability: ["ShiftRight"],
};

const KEY_MOVE_SPEED = 3.2;

interface Options {
  element: HTMLElement;
  keys: KeyMap;
  pointer: boolean;
  gamepad: boolean;
}

/** Gabungan pointer, keyboard, dan gamepad untuk satu pemain. Yang terakhir dipakai menang. */
export class CombinedInput implements HumanInput {
  private x = 0;
  private samples: PointerSample[] = [];
  private pointerHeld = false;
  private keysDown = new Set<string>();
  private pendingTaps: number[] = [];
  private servePressed = false;
  private abilityPressed = false;
  private lastPadAbility = false;
  private tapAimValue = 0;
  private lastKeyTime = 0;
  private lastPadButton = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly opts: Options) {
    const el = opts.element;
    if (opts.pointer) {
      this.listen(el, "pointermove", (e) => this.onPointerMove(e as PointerEvent));
      this.listen(el, "pointerdown", (e) => this.onPointerDown(e as PointerEvent));
      this.listen(window, "pointerup", () => {
        this.pointerHeld = false;
      });
    }
    this.listen(window, "keydown", (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, "keyup", (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(window, "blur", () => this.keysDown.clear());
  }

  /** Dipakai hook E2E dan kalibrasi: suntikkan tap pada waktu dinding tertentu. */
  injectTap(wallMs: number, aim = 0): void {
    this.pendingTaps.push(wallMs);
    this.tapAimValue = aim;
    this.servePressed = true;
  }

  read(viewTick: number, wallToSimMs: (wall: number) => number): PlayerInput {
    const now = performance.now();
    this.applyKeyboard(now);
    this.applyGamepad();
    const keyActive = now - this.lastKeyTime < 400;
    let swing = readSwing(this.samples, now, this.pointerHeld);
    if (keyActive) swing = this.keySwing();
    // Tap yang waktunya belum tiba di tick ini ditahan untuk tick berikutnya.
    const next = this.pendingTaps[0];
    let tapMs: number | null = null;
    if (next !== undefined) {
      const ms = wallToSimMs(next);
      if (ms <= (viewTick + 1) * MS_PER_TICK) {
        this.pendingTaps.shift();
        tapMs = ms;
      }
    }
    const input: PlayerInput = {
      ...emptyInput(viewTick),
      // Semua kamera memetakan kanan layar ke +x dunia.
      x: this.x,
      aim: swing.aim,
      lift: swing.lift,
      power: swing.power,
      serve: this.servePressed,
      tapMs,
      ability: this.abilityPressed,
    };
    if (tapMs !== null) input.aim = this.tapAimValue;
    this.servePressed = false;
    this.abilityPressed = false;
    if (this.samples.length > 32) this.samples = this.samples.slice(-16);
    return input;
  }

  pressAbility(): void {
    this.abilityPressed = true;
  }

  dispose(): void {
    for (const c of this.cleanup) c();
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: !type.startsWith("key") });
    this.cleanup.push(() => target.removeEventListener(type, fn));
  }

  private normalized(e: PointerEvent): { nx: number; ny: number } {
    const r = this.opts.element.getBoundingClientRect();
    return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  }

  private onPointerMove(e: PointerEvent): void {
    const { nx, ny } = this.normalized(e);
    this.x = screenToBatX(nx);
    this.samples.push({ t: e.timeStamp || performance.now(), x: nx, y: ny * 0.6 });
  }

  private onPointerDown(e: PointerEvent): void {
    // Tombol HUD (jeda, kamera, emoji) bukan tap permainan.
    if ((e.target as Element | null)?.closest?.("button, a, input")) return;
    const { nx } = this.normalized(e);
    this.pointerHeld = true;
    if (e.pointerType !== "mouse") this.x = screenToBatX(nx);
    this.pendingTaps.push(e.timeStamp || performance.now());
    this.tapAimValue = tapAim(nx);
    this.servePressed = true;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = this.opts.keys;
    const all = [...k.left, ...k.right, ...k.up, ...k.down, ...k.action, ...k.ability];
    if (!all.includes(e.code)) return;
    e.preventDefault();
    if (down && !this.keysDown.has(e.code) && k.ability.includes(e.code))
      this.abilityPressed = true;
    if (down && !this.keysDown.has(e.code) && k.action.includes(e.code)) {
      this.pendingTaps.push(e.timeStamp || performance.now());
      this.tapAimValue = this.keyDir() * 0.7;
      this.servePressed = true;
    }
    if (down) this.keysDown.add(e.code);
    else this.keysDown.delete(e.code);
    this.lastKeyTime = performance.now();
  }

  private pressed(codes: string[]): boolean {
    return codes.some((c) => this.keysDown.has(c));
  }

  private keyDir(): number {
    const k = this.opts.keys;
    return (this.pressed(k.right) ? 1 : 0) - (this.pressed(k.left) ? 1 : 0);
  }

  private lastFrame = 0;

  private applyKeyboard(now: number): void {
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const dir = this.keyDir();
    if (dir !== 0) {
      this.x = clamp(this.x + dir * KEY_MOVE_SPEED * dt, -BAT_MAX_X, BAT_MAX_X);
      this.lastKeyTime = now;
    }
  }

  private keySwing() {
    const k = this.opts.keys;
    const lift = (this.pressed(k.up) ? 1 : 0) - (this.pressed(k.down) ? 1 : 0);
    return {
      aim: this.keyDir() * 0.7,
      lift,
      power: this.pressed(k.action) ? 0.9 : 0.4,
    };
  }

  private applyGamepad(): void {
    if (!this.opts.gamepad || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find((p) => p?.connected);
    if (!pad) return;
    const ax = pad.axes[0] ?? 0;
    if (Math.abs(ax) > 0.15) {
      this.x = clamp(ax * BAT_MAX_X, -BAT_MAX_X, BAT_MAX_X);
      this.lastKeyTime = performance.now();
    }
    const button = pad.buttons[0]?.pressed ?? false;
    if (button && !this.lastPadButton) {
      this.pendingTaps.push(performance.now());
      this.tapAimValue = ax;
      this.servePressed = true;
    }
    this.lastPadButton = button;
    const ability = pad.buttons[3]?.pressed ?? false;
    if (ability && !this.lastPadAbility) this.abilityPressed = true;
    this.lastPadAbility = ability;
  }
}
