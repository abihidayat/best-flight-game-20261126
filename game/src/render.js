// game/src/render.js
import * as THREE from 'three';
import { COLORS, rad2deg } from './config.js';

export function headingDeg(yaw) {
    // 0 = North (-Z), 90 = East (+X). Forward = (sin yaw, ., cos yaw).
    let h = rad2deg(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
    if (h < 0) h += 360;
    return Math.round(h);
}

export function createRender(canvas, world, plane) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.SKY_BOTTOM, 300, 1600);

    // Sky: big sphere with a vertex-coloured gradient (top blue -> horizon pale)
    const skyGeom = new THREE.SphereGeometry(1500, 32, 15);
    const skyMat = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        vertexColors: true
    });
    const skyMesh = new THREE.Mesh(skyGeom, skyMat);

    const colors = [];
    const pos = skyGeom.attributes.position;
    const cTop = new THREE.Color(COLORS.SKY_TOP);
    const cBot = new THREE.Color(COLORS.SKY_BOTTOM);
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 1500;
        const c = new THREE.Color().lerpColors(cBot, cTop, Math.max(0, y));
        colors.push(c.r, c.g, c.b);
    }
    skyGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(skyMesh);

    // Lights
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(400, 500, 200);
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xcae1ff, 0x3b5d38, 0.85);
    scene.add(hemi);

    scene.add(world.group);
    scene.add(plane.group);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
    let viewMode = 'chase';
    const camTarget = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    let camSnapped = false;

    const horizonCanvas = document.getElementById('hud-horizon');
    const hctx = horizonCanvas ? horizonCanvas.getContext('2d') : null;

    return {
        setView(mode) {
            viewMode = mode;
            plane.group.visible = (mode === 'chase');
            const panel = document.getElementById('hud-panel');
            if (panel) panel.style.display = (mode === 'cockpit' ? 'block' : 'none');
            camSnapped = false;
        },

        // Snap the chase camera to its ideal spot at once (no swoop after a
        // teleport, a reset, or a staged screenshot).
        snapCamera() {
            camSnapped = false;
            const state = plane.state;
            const fwd = new THREE.Vector3(
                Math.sin(state.yaw) * Math.cos(state.pitch),
                Math.sin(state.pitch),
                Math.cos(state.yaw) * Math.cos(state.pitch)
            );
            camPos.copy(state.pos).addScaledVector(fwd, -10).add(new THREE.Vector3(0, 3.2, 0));
            camTarget.copy(state.pos).addScaledVector(fwd, 14);
            camSnapped = true;
        },

        setSunset(on) {
            const targetSun = on ? new THREE.Color(0xffa500) : new THREE.Color(0xfff4e0);
            const targetFog = on ? new THREE.Color(0xcc8855) : new THREE.Color(COLORS.SKY_BOTTOM);
            sun.color.copy(targetSun);
            scene.fog.color.copy(targetFog);
            // Sky gradient stays day-blue; fog + sun carry the dusk mood.
        },

        updateHud(s) {
            const set = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            set('hud-alt', Math.round(s.altitude));
            set('hud-spd', Math.round(s.speed * 3.6));
            set('hud-hdg', String(headingDeg(plane.state.yaw)).padStart(3, '0'));
            set('hud-thr', Math.round(s.throttle * 100) + '%');
            set('hud-score', s.score);
            set('hud-rings', s.ringsHit + '/' + s.ringsTotal);
            set('hud-lives', 'LIVES ' + Math.max(0, s.lives));

            const m = Math.floor(s.timeLeft / 60);
            const sec = Math.floor(s.timeLeft % 60).toString().padStart(2, '0');
            set('hud-time', m + ':' + sec);

            const msgEl = document.getElementById('hud-msg');
            if (msgEl) {
                msgEl.textContent = performance.now() < s.messageUntil ? s.message : '';
            }

            if (hctx) this.drawHorizon(hctx, plane.state.roll, plane.state.pitch);
        },

        drawHorizon(ctx, roll, pitch) {
            ctx.clearRect(0, 0, 160, 120);
            ctx.save();
            ctx.translate(80, 60);
            ctx.rotate(-roll);
            const pitchY = pitch * 100;

            // Sky/Ground
            ctx.fillStyle = '#4488ff';
            ctx.fillRect(-200, -200 + pitchY, 400, 200);
            ctx.fillStyle = '#554433';
            ctx.fillRect(-200, 0 + pitchY, 400, 200);

            // Horizon line
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-60, pitchY);
            ctx.lineTo(60, pitchY);
            ctx.stroke();
            ctx.restore();

            // Static reticle
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(70, 60); ctx.lineTo(75, 60);
            ctx.moveTo(85, 60); ctx.lineTo(90, 60);
            ctx.moveTo(80, 55); ctx.lineTo(80, 58);
            ctx.stroke();
        },

        resize() {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        },

        draw(dt) {
            const state = plane.state;
            const fwd = new THREE.Vector3(
                Math.sin(state.yaw) * Math.cos(state.pitch),
                Math.sin(state.pitch),
                Math.cos(state.yaw) * Math.cos(state.pitch)
            );

            if (viewMode === 'chase') {
                const idealPos = state.pos.clone()
                    .addScaledVector(fwd, -10)
                    .add(new THREE.Vector3(0, 3.2, 0));

                if (!camSnapped) {
                    camPos.copy(idealPos);
                    camTarget.copy(state.pos).addScaledVector(fwd, 14);
                    camSnapped = true;
                } else {
                    const t = 1.0 - Math.exp(-6 * dt);
                    camPos.lerp(idealPos, t);
                    camTarget.lerp(state.pos.clone().addScaledVector(fwd, 14), t);
                }

                camera.position.copy(camPos);
                camera.lookAt(camTarget);
            } else {
                // Cockpit: camera at the pilot's seat, looking forward.
                camera.position.copy(state.pos).addScaledVector(fwd, 1.6).add(new THREE.Vector3(0, 0.9, 0));
                camera.lookAt(state.pos.clone().addScaledVector(fwd, 40));
            }

            renderer.render(scene, camera);
        }
    };
}
