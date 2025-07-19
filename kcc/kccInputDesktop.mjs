/* kccInput.mjs – gathers input & feeds kcc.mjs */

import { Vec2, Script } from 'playcanvas';

export class KccInputDesktop extends Script {
    static scriptName = 'kccInputDesktop';

    /**
     * @attribute
     */
    lookSpeed = 0.5;

    /**
     * @attribute
     */
    sprintScalar = 2.0;

    /**
     * @attribute
     */
    continuousJump = false;

    /**
     * @type {HTMLCanvasElement}
     * @private
     */
    _canvas;

    currMousePosition = new Vec2();
    prevMousePosition = new Vec2();

    initialize() {
        this._canvas = this.app.graphicsDevice.canvas;

        this._keys = this.app.keyboard;
        this._mouse = this.app.mouse;

        this.app.mouse.disableContextMenu();

        this._kcc = this.entity.script.kcc;
        this._cachedSpeed = this._kcc.speed;

        this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
        this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
    }

    update(dt) {
        let horizontal = +(this._keys.isPressed(pc.KEY_D)) - +(this._keys.isPressed(pc.KEY_A));
        let vertical = +(this._keys.isPressed(pc.KEY_S)) - +(this._keys.isPressed(pc.KEY_W));

        const isSprinting = this._keys.isPressed(pc.KEY_SHIFT);

        if (isSprinting) {
            this._kcc.speed = this._cachedSpeed * this.sprintScalar;
        }
        else {
            this._kcc.speed = this._cachedSpeed;
        }

        let jump = false;

        if (this.continuousJump)
            jump = this._keys.isPressed(pc.KEY_SPACE);
        else
            jump = this._keys.wasPressed(pc.KEY_SPACE);

        const yawDelta = this.prevMousePosition.x - this.currMousePosition.x;
        this.prevMousePosition.copy(this.currMousePosition);

        /* feed the controller */
        if (this._kcc && this._kcc.setInput)
            this._kcc.setInput(horizontal, vertical, jump, yawDelta * this.lookSpeed);
    }

    onMouseMove(event) {
        // if (document.pointerLockElement !== this._canvas) {
        //     return;
        // }

        this.currMousePosition.set(event.x, event.y);
    }

    onMouseDown(event) {
        if (document.pointerLockElement !== this._canvas) {
            //this._canvas.requestPointerLock();
        }
    }
}