import { Vec3 } from 'playcanvas';

export const EPS = 1e-8;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function projectOnPlane(v, n) {
    const m = n.lengthSq();
    if (m < EPS) return v.clone();
    const d = v.dot(n) / m;
    return new Vec3(v.x - n.x * d, v.y - n.y * d, v.z - n.z * d);
}

/**
 * Collide-and-slide sweep used by the KCC.
 * @param {KCC}      kcc              – the character-controller instance (`this` from KCC)
 * @param {Vec3}     pos              – mutable start position (will be returned)
 * @param {Vec3}     disp             – desired displacement this step
 * @param {boolean}  isVerticalPass   – true = gravity pass, false = horizontal pass
 * @returns {Vec3} new position
 */
export function sweep(kcc, pos, disp, isVerticalPass) {
    let remaining = disp.clone();

    /* record up to two distinct wall normals (horizontal pass) */
    let wallN1 = null;
    let wallN2 = null;

    for (let i = 0; i < kcc.maxIterations; ++i) {
        if (remaining.lengthSq() < EPS) break;

        const end = pos.clone().add(remaining);
        const hit = kcc.app.systems.rigidbody.sphereCast(kcc.radius, pos, end);

        if (kcc.debug) kcc.app.drawLine(pos, end, kcc.castDebugColor, false);

        /* ▸ no hit – move fully */
        if (!hit || !hit.entity) {
            pos.add(remaining);
            break;
        }

        /* ▸ step to just before impact */
        const dir = remaining.clone().normalize();
        const totalDist = remaining.length();
        const hitDist = clamp(hit.hitFraction * totalDist, 0, totalDist);
        const stepDist = Math.max(hitDist - kcc.skin, 0);
        if (stepDist > EPS) pos.add(dir.clone().mulScalar(stepDist));

        /* slope metrics */
        const cosθ = clamp(hit.normal.dot(Vec3.UP), -1, 1);
        const slopeDeg = Math.acos(cosθ) * 180 / Math.PI;
        const walkable = slopeDeg < kcc.slopeLimitDeg;

        /* ───── vertical (gravity) pass ───── */
        if (isVerticalPass) {
            const movingDown = remaining.y < 0;
            const movingUp = remaining.y > 0;

            /* ▸ ceiling */
            if (movingUp) { kcc._velY = 0; break; }

            if (movingDown) {
                if (walkable) {
                    /* landing */
                    kcc._grounded = true;
                    kcc._groundCandidate = hit.entity;
                    kcc._velY = 0;

                    remaining = projectOnPlane(
                        remaining.mulScalar(1 - hit.hitFraction),
                        hit.normal
                    );
                    if (Math.abs(remaining.y) < EPS) remaining.y = 0;
                } else {
                    /* steep – slide along slope with sinθ scaling */
                    const sinθ = Math.sqrt(Math.max(1 - cosθ * cosθ, 0));
                    const slideDir = projectOnPlane(Vec3.DOWN, hit.normal).normalize();
                    const slideMag = Math.abs(remaining.y) * sinθ * (1 - hit.hitFraction);

                    remaining = slideDir.mulScalar(slideMag);
                    remaining.add(hit.normal.clone().mulScalar(kcc.skin));

                    /* remember steep normal for uphill-clamp */
                    kcc._steepNormal = hit.normal.clone();
                }
                continue;
            }

            /* ───── horizontal (player) pass ───── */
        } else {
            if (walkable) {
                kcc._grounded = true;
                kcc._groundCandidate = hit.entity;
                remaining = projectOnPlane(
                    remaining.mulScalar(1 - hit.hitFraction),
                    hit.normal
                );
            } else {
                /* wall */
                const wallN = new Vec3(hit.normal.x, 0, hit.normal.z);
                if (wallN.lengthSq() > EPS) wallN.normalize();

                if (!wallN1) {
                    wallN1 = wallN.clone();
                } else if (wallN.dot(wallN1) < 0.99) {
                    wallN2 = wallN.clone();
                }

                /* if two distinct walls ⇒ corner lock */
                if (wallN1 && wallN2) {
                    remaining.set(0, 0, 0);
                } else {
                    const lockN = wallN1 || wallN;
                    remaining = projectOnPlane(
                        remaining.mulScalar(1 - hit.hitFraction),
                        lockN
                    );
                    remaining.add(lockN.clone().mulScalar(kcc.skin));
                }
            }
        }
    }
    return pos;
}