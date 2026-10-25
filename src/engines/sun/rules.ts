import type { Box, Facade, Obstacle, Season, SunConstraint, SunRoom } from './types.ts';

const RAD = Math.PI / 180;
/** Sun declination at the solstices and equinoxes, in degrees. */
export const DECLINATION: Record<Season, number> = { winter: -23.44, equinox: 0, summer: 23.44 };
/** Below this height the sun is too low and too dim to count, in degrees. */
export const MIN_ALTITUDE = 3;
/** Sun rays hitting a wall at a grazing angle don't really light the room: maximum angle from the wall's normal. */
export const MAX_INCIDENCE = 80;
/** Height of the middle of a window above the ground, in metres. */
export const WINDOW_HEIGHT = 1.5;
/** Time step used to count sunny hours. */
export const TIME_STEP = 0.25;

export type SunPosition = { altitude: number; azimuth: number };

/**
 * Simplified sun position for a latitude, a season and a solar hour (12 = solar noon).
 * Azimuth is measured from the north, clockwise (east 90, south 180, west 270).
 */
export function sunPosition(latitude: number, season: Season, hour: number): SunPosition {
  const phi = latitude * RAD, delta = DECLINATION[season] * RAD, h = 15 * (hour - 12) * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h);
  const altitude = Math.asin(sinAlt);
  const cosAz = (Math.sin(delta) - sinAlt * Math.sin(phi)) / (Math.cos(altitude) * Math.cos(phi));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD;
  if (h > 0) azimuth = 360 - azimuth;
  return { altitude: altitude / RAD, azimuth };
}

const FACADE_AZIMUTH: Record<Facade, number> = { north: 0, east: 90, south: 180, west: 270 };

/** Direction a façade faces once the house is turned clockwise by `rotation` degrees. */
export function facadeAzimuth(facade: Facade, rotation: number): number {
  return (((FACADE_AZIMUTH[facade] + rotation) % 360) + 360) % 360;
}

export function angleBetween(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Horizontal unit vector pointing towards the sun, in site coordinates (x east, y south). */
export function towardsSun(azimuth: number): [number, number] {
  return [Math.sin(azimuth * RAD), -Math.cos(azimuth * RAD)];
}

/** Turns a point of the house frame (origin at the house centre) into site coordinates. */
export function toSite(point: [number, number], rotation: number, at: { x: number; y: number }): [number, number] {
  const a = rotation * RAD, [x, y] = point;
  return [at.x + x * Math.cos(a) - y * Math.sin(a), at.y + x * Math.sin(a) + y * Math.cos(a)];
}

/** Middle of a window on its wall, in the house frame centred on the house. */
export function windowCentre(room: SunRoom, w: { facade: Facade; from: number; to: number }, house: { width: number; depth: number }): [number, number] {
  const b = room.box, mid = (w.from + w.to) / 2;
  const local: [number, number] =
    w.facade === 'north' ? [mid, b.y] : w.facade === 'south' ? [mid, b.y + b.depth] : w.facade === 'west' ? [b.x, mid] : [b.x + b.width, mid];
  return [local[0] - house.width / 2, local[1] - house.depth / 2];
}

/** Distance along a horizontal ray at which it enters a box (null if it misses). */
export function rayEntry(origin: [number, number], dir: [number, number], box: Box): number | null {
  let tMin = 0, tMax = Infinity;
  const lo = [box.x, box.y], hi = [box.x + box.width, box.y + box.depth];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] < lo[i] || origin[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - origin[i]) / dir[i], t2 = (hi[i] - origin[i]) / dir[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** True when an obstacle stands between the window and the sun, tall enough to hide it. */
export function shaded(point: [number, number], sun: SunPosition, obstacles: Obstacle[]): boolean {
  const dir = towardsSun(sun.azimuth);
  const rise = Math.tan(sun.altitude * RAD);
  return obstacles.some(o => {
    const s = rayEntry(point, dir, o.box);
    return s !== null && WINDOW_HEIGHT + s * rise < o.height;
  });
}

export type WindowLight = 'sun' | 'shade' | 'none';

export type Scene = {
  latitude: number;
  rotation: number;
  houseAt: { x: number; y: number };
  house: { width: number; depth: number; rooms: SunRoom[] };
  obstacles: Obstacle[];
};

/** Light on one window: direct sun, sun hidden by an obstacle, or no sun on this side. */
export function windowLight(scene: Scene, room: SunRoom, w: SunRoom['windows'][number], sun: SunPosition): WindowLight {
  if (sun.altitude < MIN_ALTITUDE || angleBetween(sun.azimuth, facadeAzimuth(w.facade, scene.rotation)) > MAX_INCIDENCE) return 'none';
  const point = toSite(windowCentre(room, w, scene.house), scene.rotation, scene.houseAt);
  return shaded(point, sun, scene.obstacles) ? 'shade' : 'sun';
}

/** Light in a room: direct sun if at least one window gets it. */
export function roomLight(scene: Scene, room: SunRoom, sun: SunPosition): WindowLight {
  const lights = room.windows.map(w => windowLight(scene, room, w, sun));
  return lights.includes('sun') ? 'sun' : lights.includes('shade') ? 'shade' : 'none';
}

/** Times of the day sampled every TIME_STEP, from `from` (included) to `to` (excluded). */
export function times(from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t < to - 1e-9; t += TIME_STEP) out.push(Number(t.toFixed(2)));
  return out;
}

/** Hours of direct sun in a room between two times of a given season. */
export function sunHours(scene: Scene, room: SunRoom, season: Season, from: number, to: number): number {
  return times(from, to).filter(t => roomLight(scene, room, sunPosition(scene.latitude, season, t + TIME_STEP / 2)) === 'sun').length * TIME_STEP;
}

export function checkSun(c: SunConstraint, scene: Scene): boolean {
  return c.rooms.every(id => {
    const room = scene.house.rooms.find(r => r.id === id);
    if (!room) return false;
    const hours = sunHours(scene, room, c.season, c.from, c.to);
    return c.type === 'min_sun_hours' ? hours >= c.value - 1e-9 : hours <= c.value + 1e-9;
  });
}

export function evaluateSun(constraints: SunConstraint[], scene: Scene) {
  const results = constraints.map(c => checkSun(c, scene));
  return { constraints: results, solved: results.every(Boolean) };
}

/** Shadow of a box on the ground for a given sun: the box swept away from the sun by height / tan(altitude). */
export function shadowPolygon(o: Obstacle, sun: SunPosition): [number, number][] | null {
  if (sun.altitude < MIN_ALTITUDE) return null;
  const [dx, dy] = towardsSun(sun.azimuth);
  const len = Math.min(o.height / Math.tan(sun.altitude * RAD), 200);
  const { x, y, width, depth } = o.box;
  const corners: [number, number][] = [[x, y], [x + width, y], [x + width, y + depth], [x, y + depth]];
  const moved = corners.map(([cx, cy]) => [cx - dx * len, cy - dy * len] as [number, number]);
  return convexHull([...corners, ...moved]);
}

function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
