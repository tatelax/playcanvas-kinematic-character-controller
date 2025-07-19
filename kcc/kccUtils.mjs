import { Vec3 } from 'playcanvas';

export const EPS = 1e-8;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function projectOnPlane(v, n) {
    const m = n.lengthSq();
    if (m < EPS) return v.clone();
    const d = v.dot(n) / m;
    return new Vec3(v.x - n.x * d, v.y - n.y * d, v.z - n.z * d);
}