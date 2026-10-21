import { FLOOR_Y, NET_H, NET_HALF_W, TABLE_HALF_L, TABLE_HALF_W } from "@pinkponk/sim";
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from "three";

export interface ThemeColors {
  bg: string;
  table: string;
  tableLine: string;
  ball: string;
  pink: string;
  lime: string;
  cyan: string;
  floor: string;
  dark: boolean;
}

export const readThemeColors = (): ThemeColors => {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || "#ff00ff";
  const bg = v("--bg");
  const dark = new Color(bg).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
  return {
    bg,
    table: v("--table"),
    tableLine: v("--table-line"),
    ball: v("--ball"),
    pink: v("--pink"),
    lime: v("--lime"),
    cyan: v("--cyan"),
    floor: dark ? "#140c1c" : "#f6dfeb",
    dark,
  };
};

const radialTexture = (inner: string, outer: string, size = 128): CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(c);
};

export interface SceneParts {
  scene: Scene;
  tableTop: MeshBasicMaterial;
  lines: MeshBasicMaterial;
  floor: MeshBasicMaterial;
  floorGlow: Mesh;
  ball: Mesh;
  ballMat: MeshBasicMaterial;
  ballGlow: Sprite;
  shadow: Mesh;
  bats: [Group, Group];
  ring: Mesh;
  ringTarget: Mesh;
  ringMat: MeshBasicMaterial;
  dispose(): void;
}

// Bola digambar lebih besar dari aslinya (r 2 cm) agar terlihat di layar HP.
const BALL_VISUAL_R = 0.042;

const makeBat = (color: string): Group => {
  const g = new Group();
  const head = new Mesh(
    new CylinderGeometry(0.085, 0.085, 0.012, 24),
    new MeshBasicMaterial({ color }),
  );
  head.rotation.x = Math.PI / 2;
  const rim = new Mesh(
    new CylinderGeometry(0.09, 0.09, 0.008, 24),
    new MeshBasicMaterial({ color: "#111111" }),
  );
  rim.rotation.x = Math.PI / 2;
  const handle = new Mesh(
    new BoxGeometry(0.028, 0.1, 0.022),
    new MeshBasicMaterial({ color: "#d9a066" }),
  );
  handle.position.y = -0.12;
  g.add(rim, head, handle);
  return g;
};

export const buildScene = (colors: ThemeColors): SceneParts => {
  const scene = new Scene();
  scene.background = new Color(colors.bg);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const floor = track(new MeshBasicMaterial({ color: colors.floor }));
  const floorMesh = new Mesh(track(new PlaneGeometry(40, 40)), floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = FLOOR_Y;
  scene.add(floorMesh);

  const glowTex = track(radialTexture("rgba(255,46,154,0.45)", "rgba(255,46,154,0)"));
  const floorGlow = new Mesh(
    track(new PlaneGeometry(7, 9)),
    track(new MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })),
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = FLOOR_Y + 0.002;
  scene.add(floorGlow);

  const tableTop = track(new MeshBasicMaterial({ color: colors.table }));
  const top = new Mesh(track(new BoxGeometry(TABLE_HALF_W * 2, 0.03, TABLE_HALF_L * 2)), tableTop);
  top.position.y = -0.015;
  scene.add(top);
  const edge = new Mesh(
    track(new BoxGeometry(TABLE_HALF_W * 2 + 0.01, 0.012, TABLE_HALF_L * 2 + 0.01)),
    track(new MeshBasicMaterial({ color: "#111111" })),
  );
  edge.position.y = -0.036;
  scene.add(edge);

  const lines = track(new MeshBasicMaterial({ color: colors.tableLine }));
  const lineGeoms: [number, number, number, number][] = [
    [TABLE_HALF_W * 2, 0.02, 0, TABLE_HALF_L - 0.01],
    [TABLE_HALF_W * 2, 0.02, 0, -TABLE_HALF_L + 0.01],
    [0.02, TABLE_HALF_L * 2, TABLE_HALF_W - 0.01, 0],
    [0.02, TABLE_HALF_L * 2, -TABLE_HALF_W + 0.01, 0],
    [0.004, TABLE_HALF_L * 2, 0, 0],
  ];
  for (const [w, l, x, z] of lineGeoms) {
    const m = new Mesh(track(new BoxGeometry(w, 0.002, l)), lines);
    m.position.set(x, 0.001, z);
    scene.add(m);
  }

  const legMat = track(new MeshBasicMaterial({ color: "#2a2a2a" }));
  const legGeo = track(new BoxGeometry(0.05, -FLOOR_Y - 0.04, 0.05));
  for (const [x, z] of [
    [0.6, 1.1],
    [-0.6, 1.1],
    [0.6, -1.1],
    [-0.6, -1.1],
  ] as const) {
    const leg = new Mesh(legGeo, legMat);
    leg.position.set(x, (FLOOR_Y - 0.04) / 2, z);
    scene.add(leg);
  }

  const net = new Mesh(
    track(new PlaneGeometry(NET_HALF_W * 2, NET_H)),
    track(
      new MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.28,
        side: DoubleSide,
      }),
    ),
  );
  net.position.y = NET_H / 2;
  scene.add(net);
  const tape = new Mesh(
    track(new BoxGeometry(NET_HALF_W * 2, 0.012, 0.006)),
    track(new MeshBasicMaterial({ color: "#ffffff" })),
  );
  tape.position.y = NET_H;
  scene.add(tape);
  const postMat = track(new MeshBasicMaterial({ color: "#111111" }));
  for (const x of [NET_HALF_W, -NET_HALF_W]) {
    const post = new Mesh(track(new BoxGeometry(0.02, NET_H + 0.02, 0.02)), postMat);
    post.position.set(x, NET_H / 2, 0);
    scene.add(post);
  }

  const ballMat = track(new MeshBasicMaterial({ color: colors.ball }));
  const ball = new Mesh(track(new SphereGeometry(BALL_VISUAL_R, 16, 12)), ballMat);
  scene.add(ball);
  const ballGlow = new Sprite(
    track(
      new SpriteMaterial({
        map: track(radialTexture("rgba(255,255,255,0.9)", "rgba(255,255,255,0)", 64)),
        color: colors.lime,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  ballGlow.scale.set(0.16, 0.16, 1);
  scene.add(ballGlow);

  const shadow = new Mesh(
    track(new CircleGeometry(BALL_VISUAL_R * 1.2, 16)),
    track(
      new MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    ),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const bats: [Group, Group] = [makeBat("#e5174f"), makeBat("#111111")];
  scene.add(bats[0], bats[1]);

  const ringMat = track(
    new MeshBasicMaterial({
      color: colors.lime,
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthTest: false,
    }),
  );
  const ring = new Mesh(track(new RingGeometry(0.9, 1, 48)), ringMat);
  ring.renderOrder = 10;
  const ringTarget = new Mesh(
    track(new RingGeometry(0.93, 1, 48)),
    track(
      new MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.7,
        side: DoubleSide,
        depthTest: false,
      }),
    ),
  );
  ringTarget.renderOrder = 10;
  ring.visible = false;
  ringTarget.visible = false;
  scene.add(ring, ringTarget);

  return {
    scene,
    tableTop,
    lines,
    floor,
    floorGlow,
    ball,
    ballMat,
    ballGlow,
    shadow,
    bats,
    ring,
    ringTarget,
    ringMat,
    dispose: () => {
      for (const d of disposables) d.dispose();
      for (const b of bats) {
        b.traverse((o) => {
          if (o instanceof Mesh) {
            o.geometry.dispose();
            (o.material as MeshBasicMaterial).dispose();
          }
        });
      }
    },
  };
};
