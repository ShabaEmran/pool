export interface Vector {
  x: number;
  y: number;
}

export interface Ball {
  id: number;
  pos: Vector;
  vel: Vector;
  color: string;
  isCue?: boolean;
  isStriped?: boolean;
  inPocket: boolean;
}

export function distance(v1: Vector, v2: Vector): number {
  return Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
}

export function normalize(v: Vector): Vector {
  const d = Math.sqrt(v.x * v.x + v.y * v.y);
  if (d === 0) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
}

export function dot(v1: Vector, v2: Vector): number {
  return v1.x * v2.x + v1.y * v2.y;
}
