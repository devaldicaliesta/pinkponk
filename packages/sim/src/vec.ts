export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const copyVec = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export const lengthOf = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;
