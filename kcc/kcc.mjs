import { Vec3, Quat, Script, Color } from 'playcanvas';
import { clamp, EPS, projectOnPlane, sweep } from './kccUtils.mjs';

/* ───────── controller ───────── */
export class KCC extends Script {
    static scriptName = 'kcc';

    /** Walk speed (m s⁻¹)             @attribute */ speed = 6;
    /** Gravity (m s⁻², − = down)      @attribute */ gravity = -9.81;
    /** Jump speed (m s⁻¹)             @attribute */ jumpSpeed = 6;
    /** Scale speed in-air             @attribute
     * @range [0, 1] */                              airControl = 1;
    /** Controller radius (m)          @attribute */ radius = 0.5;
    /** Sweeps / pass                  @attribute */ maxIterations = 5;
    /** Walkable slope (°)             @attribute */ slopeLimitDeg = 50;
    /** Skin gap (m)                   @attribute */ skin = 0.01;
    /** Down-snap distance (m)         @attribute */ groundSnap = 0.3;
    /** Hover gap when grounded (m)    @attribute */ hover = 0.2;

    /** Draw debug helpers? @attribute          */ debug = false;
    /** Color to show for casting @attribute
     * @enabledif {debug}    */                    castDebugColor = new Color(1, 0, 0, 1);
    /** Color to show for sphere @attribute
     * @enabledif {debug}    */                    sphereDebugColor = new Color(0, 0, 1, 1);
    /** Color to show for hit @attribute
     * @enabledif {debug}    */                    hitDebugColor = new Color(1, 1, 0, 1);
    /** Color to show for normal @attribute
     * @enabledif {debug}    */                    normalDebugColor = new Color(0, 1, 0, 1);

    initialize() {
        this._velY = 0;
        this._horizontal = 0;
        this._vertical = 0;
        this._jumpPressed = false;
        this._yawDelta = 0;

        this._grounded = false;
        this._wasGrounded = false;
        this._groundEntity = null;
        this._groundPrevPos = new Vec3();
        this._groundPrevRot = new Quat();
        this._groundCandidate = null;

        this._steepNormal = null;
    }

    /* Called each frame by input script */
    setInput(h = 0, v = 0, jump = false, yaw = 0) {
        this._horizontal = h;
        this._vertical = v;
        this._jumpPressed = jump;
        this._yawDelta = yaw;
    }

    /* ───────── main update ───────── */
    update(dt) {

        /* 1. apply player yaw from input */
        if (Math.abs(this._yawDelta) > EPS) {
            this.entity.rotateLocal(0, this._yawDelta, 0);
            this._yawDelta = 0;
        }

        /* 2. follow moving ground – position + **Y-only rotation** */
        if (this._wasGrounded && this._groundEntity) {
            const gp = this._groundEntity.getPosition();
            const gr = this._groundEntity.getRotation();

            /* Δrotation of the platform since last frame */
            const deltaRot = gr.clone().mul(this._groundPrevRot.clone().invert());

            /* extract yaw (degrees) from Δrotation */
            const e = new Vec3();
            deltaRot.getEulerAngles(e);
            const yawDeg = e.y;

            /* make yaw-only quaternion */
            const yawQuat = new Quat().setFromEulerAngles(0, yawDeg, 0);

            /* rotate relative offset around platform pivot */
            const rel = this.entity.getPosition().clone().sub(this._groundPrevPos);
            yawQuat.transformVector(rel, rel);

            /* apply yaw to character orientation */
            this.entity.setRotation(
                yawQuat.clone().mul(this.entity.getRotation())
            );

            /* final world position */
            this.entity.setPosition(gp.clone().add(rel));
        }

        /* 3. jump */
        if (this._grounded && this._jumpPressed) {
            this._velY = this.jumpSpeed;
            this._grounded = false;
        }
        this._jumpPressed = false;

        /* 4. horizontal input vector */
        let horizDir = new Vec3();
        if (this._horizontal || this._vertical) {
            horizDir.copy(this.entity.forward).mulScalar(-this._vertical)
                .add(new Vec3().copy(this.entity.right).mulScalar(this._horizontal))
                .normalize();
        }
        const moveSpeed = this._grounded ? this.speed : this.speed * this.airControl;
        let desiredHoriz = horizDir.mulScalar(moveSpeed * dt);

        /* 5. gravity */
        this._velY += this.gravity * dt;
        const desiredVert = this._velY * dt;

        /* 6. clamp uphill component when on steep slope */
        if (this._steepNormal) {
            const upDir = projectOnPlane(Vec3.UP, this._steepNormal).normalize();
            const uphill = desiredHoriz.dot(upDir);
            if (uphill > 0) {
                desiredHoriz.sub(upDir.mulScalar(uphill));
            }
        }

        /* 7. two-pass collide-and-slide */
        let pos = this.entity.getPosition().clone();
        this._grounded = false;
        this._groundCandidate = null;

        /* vertical pass */
        if (Math.abs(desiredVert) > EPS)
            pos = sweep(this, pos, new Vec3(0, desiredVert, 0), true);

        /* horizontal pass */
        if (desiredHoriz.lengthSq() > EPS)
            pos = sweep(this, pos, desiredHoriz, false);

        /* clear steep flag for next frame */
        this._steepNormal = null;

        /* 8. ground-snap */
        if (!this._grounded && this._velY < 0 && this.groundSnap > 0) {
            const snapHit = this.app.systems.rigidbody.sphereCast(
                this.radius,
                pos,
                pos.clone().add(Vec3.UP.clone().mulScalar(-this.groundSnap))
            );
            if (snapHit && snapHit.entity) {
                const slopeDeg = Math.acos(
                    clamp(snapHit.normal.dot(Vec3.UP), -1, 1)
                ) * 180 / Math.PI;
                if (slopeDeg < this.slopeLimitDeg) {
                    pos.y -= clamp(snapHit.hitFraction * this.groundSnap, 0, this.groundSnap);
                    this._grounded = true;
                    this._groundCandidate = snapHit.entity;
                }
            }
        }

        /* 9. hover */
        if (this._grounded)
            pos.add(Vec3.UP.clone().mulScalar(this.hover));

        /* 10. commit */
        this.entity.setPosition(pos);

        if (this.debug)
            this.app.drawWireSphere(
                pos,
                this.radius,
                this._grounded ? this.controllerGroundedDebugColor
                    : this.controllerNotGroundedDebugColor,
                20,
                false
            );

        /* 11. reset vertical velocity when grounded */
        if (this._grounded && this._velY < 0) this._velY = 0;

        /* 12. remember ground (moving platforms) */
        if (this._grounded) {
            this._groundEntity = this._groundCandidate;
            if (this._groundEntity) {
                this._groundPrevPos.copy(this._groundEntity.getPosition());
                this._groundPrevRot.copy(this._groundEntity.getRotation());
            }
        } else {
            this._groundEntity = null;
        }
        this._wasGrounded = this._grounded;
    }
}