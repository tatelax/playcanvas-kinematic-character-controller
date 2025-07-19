/* kcc.mjs – Kinematic Character Controller for PlayCanvas
   ▸ two-pass gravity  ▸ steep-slope sliding  ▸ corner-lock (July 2025)      */

   import { Vec3, Quat, Script, Color } from 'playcanvas';
   import { clamp, EPS, projectOnPlane } from './kccUtils.mjs';
   
   /* ───────── controller ───────── */
   export class KCC extends Script {
       static scriptName = 'kcc';
   
       /** Walk speed (m s⁻¹)             @attribute */ speed = 6;
       /** Gravity (m s⁻², − = down)      @attribute */ gravity = -9.81;
       /** Jump speed (m s⁻¹)             @attribute */ jumpSpeed = 6;
       /** Air-control (0–1)              @attribute */ airControl = 1;
       /** Controller radius (m)          @attribute */ radius = 0.5;
       /** Sweeps / pass                  @attribute */ maxIterations = 5;
       /** Walkable slope (°)             @attribute */ slopeLimitDeg = 50;
       /** Skin gap (m)                   @attribute */ skin = 0.01;
       /** Down-snap distance (m)         @attribute */ groundSnap = 0.3;
       /** Hover gap when grounded (m)    @attribute */ hover = 0.2;
   
       /** Draw debug helpers?            @attribute */ debug = false;
       castDebugColor = new Color(1, 0, 0, 1);
       controllerGroundedDebugColor = new Color(0, 0, 1, 1);
       controllerNotGroundedDebugColor = new Color(1, 0, 0, 1);
       hitDebugColor = new Color(1, 1, 0, 1);
       normalDebugColor = new Color(0, 1, 0, 1);
   
       /* ───────── runtime state ───────── */
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
       }
   
       /* Called each frame by your input script */
       setInput(h = 0, v = 0, jump = false, yaw = 0) {
           this._horizontal = h;
           this._vertical = v;
           this._jumpPressed = jump;
           this._yawDelta = yaw;
       }
   
       /* ───────── helper: sweep & resolve ───────── */
       _sweep(pos, disp, isVerticalPass) {
           let remaining = disp.clone();
   
           /* record up to two distinct wall normals (horizontal pass only) */
           let wallN1 = null;
           let wallN2 = null;
   
           for (let i = 0; i < this.maxIterations; ++i) {
               if (remaining.lengthSq() < EPS) break;
   
               const end = pos.clone().add(remaining);
               const hit = this.app.systems.rigidbody.sphereCast(this.radius, pos, end);
   
               if (this.debug) this.app.drawLine(pos, end, this.castDebugColor, false);
   
               /* ▸ no hit – move fully */
               if (!hit || !hit.entity) {
                   pos.add(remaining);
                   break;
               }
   
               /* ▸ step to just before impact */
               const dir = remaining.clone().normalize();
               const totalDist = remaining.length();
               const hitDist = clamp(hit.hitFraction * totalDist, 0, totalDist);
               const stepDist = Math.max(hitDist - this.skin, 0);
   
               if (stepDist > EPS) pos.add(dir.clone().mulScalar(stepDist));
   
               /* slope metrics */
               const cosθ = clamp(hit.normal.dot(Vec3.UP), -1, 1);
               const slopeDeg = Math.acos(cosθ) * 180 / Math.PI;
               const walkable = slopeDeg < this.slopeLimitDeg;
   
               /* ───── vertical (gravity) pass ───── */
               if (isVerticalPass) {
                   const movingDown = remaining.y < 0;
                   const movingUp = remaining.y > 0;
   
                   /* ▸ ceiling */
                   if (movingUp) { this._velY = 0; break; }
   
                   if (movingDown) {
                       if (walkable) {
                           /* landing */
                           this._grounded = true;
                           this._groundCandidate = hit.entity;
                           this._velY = 0;
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
                           remaining.add(hit.normal.clone().mulScalar(this.skin));
                       }
                       continue;
                   }
   
                   /* ───── horizontal (player) pass ───── */
               } else {
                   if (walkable) {
                       this._grounded = true;
                       this._groundCandidate = hit.entity;
                       remaining = projectOnPlane(
                           remaining.mulScalar(1 - hit.hitFraction),
                           hit.normal
                       );
                   } else {
                       /* wall */
                       const wallN = new Vec3(hit.normal.x, 0, hit.normal.z);
                       if (wallN.lengthSq() > EPS) wallN.normalize();
   
                       /* record first & second distinct wall normals */
                       if (!wallN1) {
                           wallN1 = wallN.clone();
                       } else if (wallN.dot(wallN1) < 0.99) {   // not parallel
                           wallN2 = wallN.clone();
                       }
   
                       /* if two distinct walls ⇒ corner ⇒ stop */
                       if (wallN1 && wallN2) {
                           remaining.set(0, 0, 0);
                       } else {
                           remaining = projectOnPlane(
                               remaining.mulScalar(1 - hit.hitFraction),
                               wallN1 || wallN
                           );
                           remaining.add((wallN1 || wallN).clone().mulScalar(this.skin));
                       }
                   }
               }
           }
           return pos;
       }
   
       /* ───────── main update (unchanged except comments) ───────── */
       update(dt) {
   
           /* 1. yaw */
           if (Math.abs(this._yawDelta) > EPS) {
               this.entity.rotateLocal(0, this._yawDelta, 0);
               this._yawDelta = 0;
           }
   
           /* 2. follow moving ground */
           if (this._wasGrounded && this._groundEntity) {
               const gp = this._groundEntity.getPosition();
               const gr = this._groundEntity.getRotation();
               const rel = this.entity.getPosition().clone().sub(this._groundPrevPos);
               gr.clone().mul(this._groundPrevRot.clone().invert()).transformVector(rel, rel);
               this.entity.setPosition(gp.clone().add(rel));
           }
   
           /* 3. jump */
           if (this._grounded && this._jumpPressed) {
               this._velY = this.jumpSpeed;
               this._grounded = false;
           }
           this._jumpPressed = false;
   
           /* 4. horizontal input */
           let horizDir = new Vec3();
           if (this._horizontal || this._vertical) {
               horizDir.copy(this.entity.forward).mulScalar(-this._vertical)
                   .add(new Vec3().copy(this.entity.right).mulScalar(this._horizontal))
                   .normalize();
           }
           const moveSpeed = this._grounded ? this.speed : this.speed * this.airControl;
           const desiredHoriz = horizDir.mulScalar(moveSpeed * dt);
   
           /* 5. gravity */
           this._velY += this.gravity * dt;
           const desiredVert = this._velY * dt;
   
           /* 6. two-pass collide-and-slide */
           let pos = this.entity.getPosition().clone();
           this._grounded = false;
           this._groundCandidate = null;
   
           if (Math.abs(desiredVert) > EPS)
               pos = this._sweep(pos, new Vec3(0, desiredVert, 0), true);
   
           if (desiredHoriz.lengthSq() > EPS)
               pos = this._sweep(pos, desiredHoriz, false);
   
           /* 7. ground-snap */
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
   
           /* 8. hover */
           if (this._grounded) pos.add(Vec3.UP.clone().mulScalar(this.hover));
   
           /* 9. commit */
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
   
           /* 10. reset vertical velocity when grounded */
           if (this._grounded && this._velY < 0) this._velY = 0;
   
           /* 11. remember ground (moving platforms) */
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