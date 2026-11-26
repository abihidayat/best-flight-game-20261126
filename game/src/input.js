// game/src/input.js

export function createInput(canvas) {
    const state = {
        keys: new Set(),
        mouseDeltaX: 0,
        isMouseDown: false,
        confirmPressed: false,
        pausePressed: false,
        restartPressed: false,
        camPressed: false
    };

    const gameKeys = [
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'KeyW', 'KeyS', 'KeyA', 'KeyD',
        'ShiftLeft', 'ShiftRight', 'ControlLeft', 'Equal', 'Minus',
        'Space', 'Enter', 'KeyP', 'KeyR', 'KeyC'
    ];

    const onKeyDown = (e) => {
        state.keys.add(e.code);
        if (gameKeys.includes(e.code)) e.preventDefault();

        if (e.code === 'Space' || e.code === 'Enter') state.confirmPressed = true;
        if (e.code === 'KeyP') state.pausePressed = true;
        if (e.code === 'KeyR') state.restartPressed = true;
        if (e.code === 'KeyC') state.camPressed = true;
    };

    const onKeyUp = (e) => {
        state.keys.delete(e.code);
    };

    const onPointerDown = () => { state.isMouseDown = true; };
    const onPointerUp = () => { state.isMouseDown = false; };
    const onPointerMove = (e) => {
        if (state.isMouseDown) {
            state.mouseDeltaX += e.movementX || 0;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);

    return {
        keys: state.keys,
        axis() {
            let p = 0;
            let r = 0;
            if (state.keys.has('ArrowUp') || state.keys.has('KeyW')) p -= 1;
            if (state.keys.has('ArrowDown') || state.keys.has('KeyS')) p += 1;
            if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) r -= 1;
            if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) r += 1;
            return { pitch: p, roll: r };
        },
        throttleAxis() {
            let t = 0;
            if (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.keys.has('Equal')) t += 1;
            if (state.keys.has('ControlLeft') || state.keys.has('Minus')) t -= 1;
            return t;
        },
        mouseDX() {
            const dx = state.mouseDeltaX;
            state.mouseDeltaX = 0;
            return dx;
        },
        consumeConfirm() {
            const p = state.confirmPressed;
            state.confirmPressed = false;
            return p;
        },
        consumePause() {
            const p = state.pausePressed;
            state.pausePressed = false;
            return p;
        },
        consumeRestart() {
            const p = state.restartPressed;
            state.restartPressed = false;
            return p;
        },
        consumeCam() {
            const p = state.camPressed;
            state.camPressed = false;
            return p;
        },
        destroy() {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            canvas.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointermove', onPointerMove);
        }
    };
}
