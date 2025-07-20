/**
 * Convex Cast
 * https://forum.playcanvas.com/t/playcanvas-physics-extension/13737
 * 
 * Change log:
 *  
 *      2.0 -   Move initialization to first use instead of at parse time to
 *              support latest version of Ammo and PlayCanvas. Fixed bug where rotation
 *              was being set on wrong transform.
 * 
 *      1.3 -   Fixed a bug in convex shape lifecycle. Not all created shapes were
 *              destroying.
 *      
 *      1.2 -   Changed filename, to avoid naming conflict with the yaustar's 
 *              raycastByTag extension.
 * 
 *      1.1 -   Fixed bug with memory leak. It appears most of the shapes
 *              don't have native methods to changes them after creatiion. And
 *              Those that do, Ammo doesn't have a binding for them. The shape is 
 *              now destoyed after the convex sweep test completes.
 *          -   Added ability to change Sphere Shape collision margin.
 * 
 *      1.0 -   Initial release
 */
(function () {
    /* global pc, Ammo */

    // ---------------------------------------------------------------------
    // Scratch-pad allocation
    // ---------------------------------------------------------------------
    const data = { initialised: false };
    pc.RigidBodyComponentSystem._convexShapesData = data;

    function initScratch() {
        if (data.initialised) return;

        // Ammo objects we re-use every cast
        data.ammoHalfExtents = new Ammo.btVector3();
        data.ammoRotFrom = new Ammo.btQuaternion();
        data.ammoRotTo = new Ammo.btQuaternion();
        data.ammoPosFrom = new Ammo.btVector3();
        data.ammoPosTo = new Ammo.btVector3();
        data.ammoTransformFrom = new Ammo.btTransform();
        data.ammoTransformTo = new Ammo.btTransform();

        // PlayCanvas helpers
        data.pcMat4 = new pc.Mat4();
        data.pcStartRot = new pc.Quat();
        data.pcEndRot = new pc.Quat();

        data.initialised = true;
    }

    /**
     * @class
     * @name ConvexCastResult
     * @classdesc Object holding the result of a successful raycast hit.
     * @description Create a new ConvexCastResult.
     * @param {pc.Entity} entity - The entity that was hit.
     * @param {number} hitFraction - A number in range from 0 to 1 along the sweep path, where hit occured.
     * @param {pc.Vec3} point - The point at which the collision occured in world space.
     * @param {pc.Vec3} normal - The normal vector of the surface where the ray hit in world space.
     * @property {pc.Entity} entity - The entity that was hit.
     * @property {number} hitFraction - A number in range from 0 to 1 along the sweep path, where hit occured.
     * @property {pc.Vec3} point - The point at which the collision occured in world space.
     * @property {pc.Vec3} normal - The normal vector of the surface where the ray hit in world space.
     */
    function ConvexCastResult(entity, hitFraction, point, normal) {
        this.entity = entity;
        this.hitFraction = hitFraction;
        this.point = point;
        this.normal = normal;
    }

    /**
     * @function
     * @name pc.RigidBodyComponentSystem#convexCast
     * @description Casts a convex shape along the linear path from startPos to endPos. Returns ConvexCastResult if 
     * there is a hit, otherewise null.
     * @param {Ammo shape} shape - Convex shape used for sweep test.
     * @param {pc.Vec3} startPos - The world space point where the hit test starts.
     * @param {pc.Vec3} endPos - The world space point where the test ends.
     * @param {pc.Quat} [startRot] - Initial rotation of the shape.
     * @param {pc.Quat} [endRot] - Final rotation of the shape.
     * @param {number} [allowedPenetration] - CCD allowance margin.
     * @returns {ConvexCastResult} object holding the hit result or null.
     */
    pc.RigidBodyComponentSystem.prototype.convexCast = function (
        shape, startPos, endPos, startRot, endRot, allowedPenetration = 0
    ) {
        initScratch();

        const d = pc.RigidBodyComponentSystem._convexShapesData;

        // If caller didn’t supply rotations, face the shape toward endPos
        if (!startRot || !endRot) {
            const look = d.pcMat4.setLookAt(startPos, endPos, pc.Vec3.UP);
            if (!startRot) startRot = d.pcStartRot.setFromMat4(look);
            if (!endRot) endRot = d.pcEndRot.setFromMat4(look);
        }

        // Fill the Ammo transforms
        d.ammoPosFrom.setValue(startPos.x, startPos.y, startPos.z);
        d.ammoPosTo.setValue(endPos.x, endPos.y, endPos.z);

        d.ammoTransformFrom.setOrigin(d.ammoPosFrom);
        d.ammoTransformTo.setOrigin(d.ammoPosTo);

        d.ammoRotFrom.setValue(startRot.x, startRot.y, startRot.z, startRot.w);
        d.ammoRotTo.setValue(endRot.x, endRot.y, endRot.z, endRot.w);

        d.ammoTransformFrom.setRotation(d.ammoRotFrom);
        d.ammoTransformTo.setRotation(d.ammoRotTo);

        const cb = new Ammo.ClosestConvexResultCallback(d.ammoPosFrom,
            d.ammoPosTo);

        this.dynamicsWorld.convexSweepTest(
            shape, d.ammoTransformFrom, d.ammoTransformTo, cb,
            allowedPenetration
        );

        let result = null;
        if (cb.hasHit()) {
            const body = Ammo.castObject(cb.get_m_hitCollisionObject(),
                Ammo.btRigidBody);
            if (body && body.entity) {
                const p = cb.get_m_hitPointWorld();
                const n = cb.get_m_hitNormalWorld();
                result = new ConvexCastResult(
                    body.entity,
                    cb.get_m_closestHitFraction(),
                    new pc.Vec3(p.x(), p.y(), p.z()),
                    new pc.Vec3(n.x(), n.y(), n.z())
                );
            }
        }

        // clean up temporary Ammo objects created _inside this call only_
        Ammo.destroy(shape);
        Ammo.destroy(cb);
        return result;
    };

    // ---------------------------------------------------------------------
    // Convenience wrappers
    // ---------------------------------------------------------------------
    const HALF = pc.RigidBodyComponentSystem.prototype;
    HALF.sphereCast = function (r, a, b, margin, sr, er, pen) { return this.convexCast(_sphere(r, margin), a, b, sr, er, pen); };
    HALF.boxCast = function (h, a, b, margin, sr, er, pen) { return this.convexCast(_box(h, margin), a, b, sr, er, pen); };
    HALF.capsuleCast = function (r, h, a, b, margin, sr, er, pen) { return this.convexCast(_capsule(r, h, margin), a, b, sr, er, pen); };
    HALF.cylinderCast = function (hExt, a, b, axis, sr, er, pen) { return this.convexCast(_cylinder(hExt, axis), a, b, sr, er, pen); };
    HALF.coneCast = function (r, h, a, b, axis, sr, er, pen) { return this.convexCast(_cone(r, h, axis), a, b, sr, er, pen); };
    HALF.shapeCast = function (verts, a, b, margin, sr, er, pen) { return this.convexCast(_hull(verts, margin), a, b, sr, er, pen); };

    // ---------------------------------------------------------------------
    // Shape builders
    // ---------------------------------------------------------------------
    function _sphere(r, margin) {
        const s = new Ammo.btSphereShape(r);
        if (margin !== undefined) s.setMargin(margin);
        return s;
    }

    function _box(halfExtents, margin) {
        initScratch();
        const he = data.ammoHalfExtents;
        he.setValue(halfExtents.x, halfExtents.y, halfExtents.z);
        const s = new Ammo.btBoxShape(he);
        if (margin !== undefined) s.setMargin(margin);
        return s;
    }

    function _capsule(r, h, margin) {
        const s = new Ammo.btCapsuleShape(r, h);
        if (margin !== undefined) s.setMargin(margin);
        return s;
    }

    function _cylinder(halfExtents, axis) {
        initScratch();
        const he = data.ammoHalfExtents;
        he.setValue(halfExtents.x, halfExtents.y, halfExtents.z);
        if (axis === pc.Vec3.RIGHT) return new Ammo.btCylinderShapeX(he);
        if (axis === pc.Vec3.BACK) return new Ammo.btCylinderShapeZ(he);
        return new Ammo.btCylinderShape(he); // default Y-axis
    }

    function _cone(r, h, axis) {
        if (axis === pc.Vec3.RIGHT) return new Ammo.btConeShapeX(r, h);
        if (axis === pc.Vec3.BACK) return new Ammo.btConeShapeZ(r, h);
        return new Ammo.btConeShape(r, h);   // default Y-axis
    }

    function _hull(verts, margin) {
        const s = new Ammo.btConvexHullShape(verts, verts.length, 3);
        if (margin !== undefined) s.setMargin(margin);
        return s;
    }
})();