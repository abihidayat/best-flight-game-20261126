// game/src/render.js — scene, cameras and the HUD.
// The chase camera trails the plane; the cockpit camera sits in the pilot's
// seat and the panel DOM takes over the instruments. The HUD is DOM text
// plus a small 2D attitude canvas, updated every frame from the game state.
import * as THREE from 'three';
import { COLORS, rad2deg } from './config.js';

// Compass heading in degrees: 0 = north (-Z), 90 = east (+X).
export function headingDeg(yaw) {
    let h = rad2deg(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
    if (h < 0) h += 360;
    return Math.round(h);
}

// A sky dome whose vertex colours fade from horizon pale to zenith blue.
function gradientSky() {
    const geo = new THREE.SphereGeometry(1500, 32, 15);
    const top = new THREE.Color(COLORS.SKY_TOP);
    const bottom = new THREE.Color(COLORS.SKY_BOTTOM);
    const cols = [];
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const mix = Math.max(0, p.getY(i) / 1500);
        const cc = new THREE.Color().lerpColors(bottom, top, mix);
        cols.push(cc.r, cc.g, cc.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return new THREE.Mesh(
        geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }),
    );
}

export function createRender(canvas, world, plane) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.SKY_BOTTOM, 300, 1600);
    scene.add(gradientSky());

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(400, 500, 200);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xcae1ff, 0x3b5d38, 0.85));

    scene.add(world.group);
    scene.add(plane.group);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
    let viewMode = 'chase';
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    let camSettled = false;

    const horizonCanvas = document.getElementById('hud-horizon');
    const hctx = horizonCanvas ? horizonCanvas.getContext('2d') : null;

    function forward() {
        const s = plane.state;
        return new THREE.Vector3(
            Math.sin(s.yaw) * Math.cos(s.pitch),
            Math.sin(s.pitch),
            Math.cos(s.yaw) * Math.cos(s.pitch),
        );
    }

    // Artificial horizon: a blue/brown split that rolls with the wings and
    // slides with pitch, plus a fixed yellow gunsight at the centre.
    function drawHorizon(ctx, roll, pitch) {
        ctx.clearRect(0, 0, 160, 120);
        ctx.save();
        ctx.translate(80, 60);
        ctx.rotate(-roll);
        const drop = pitch * 100;
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(-200, -200 + drop, 400, 200);
        ctx.fillStyle = '#554433';
        ctx.fillRect(-200, drop, 400, 200);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-60, drop);
        ctx.lineTo(60, drop);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(70, 60);
        ctx.lineTo(75, 60);
        ctx.moveTo(85, 60);
        ctx.lineTo(90, 60);
        ctx.moveTo(80, 55);
        ctx.lineTo(80, 58);
        ctx.stroke();
    }

    return {
        setView(mode) {
            viewMode = mode;
            plane.group.visible = mode === 'chase';
            const panel = document.getElementById('hud-panel');
            if (panel) panel.style.display = mode === 'cockpit' ? 'block' : 'none';
            camSettled = false;
        },

        // Put the chase camera exactly where it belongs at once, so a
        // teleport, a reset or a staged screenshot never starts with a swoop.
        snapCamera() {
            const fwd = forward();
            camPos.copy(plane.state.pos)
                .addScaledVector(fwd, -10)
                .add(new THREE.Vector3(0, 3.2, 0));
            camLook.copy(plane.state.pos).addScaledVector(fwd, 14);
            camSettled = true;
        },

        setSunset(on) {
            sun.color.set(on ? 0xffa500 : 0xfff4e0);
            scene.fog.color.set(on ? 0xcc8855 : COLORS.SKY_BOTTOM);
        },

        updateHud(s) {
            const fields = [
                ['hud-alt', String(Math.round(s.altitude))],
                ['hud-spd', String(Math.round(s.speed * 3.6))],
                ['hud-hdg', String(headingDeg(plane.state.yaw)).padStart(3, '0')],
                ['hud-thr', Math.round(s.throttle * 100) + '%'],
                ['hud-score', String(s.score)],
                ['hud-rings', s.ringsHit + '/' + s.ringsTotal],
                ['hud-lives', 'LIVES ' + Math.max(0, s.lives)],
            ];
            for (const [id, val] of fields) {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            }
            const m = Math.floor(s.timeLeft / 60);
            const sec = Math.floor(s.timeLeft % 60).toString().padStart(2, '0');
            const clock = document.getElementById('hud-time');
            if (clock) clock.textContent = m + ':' + sec;
            const banner = document.getElementById('hud-msg');
            if (banner) {
                banner.textContent = performance.now() < s.messageUntil
                    ? s.message : '';
            }
            if (hctx) drawHorizon(hctx, plane.state.roll, plane.state.pitch);
        },

        drawHorizon,

        resize() {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        },

        draw(dt) {
            const fwd = forward();
            if (viewMode === 'chase') {
                const ideal = plane.state.pos.clone()
                    .addScaledVector(fwd, -10)
                    .add(new THREE.Vector3(0, 3.2, 0));
                const aim = plane.state.pos.clone().addScaledVector(fwd, 14);
                if (!camSettled) {
                    camPos.copy(ideal);
                    camLook.copy(aim);
                    camSettled = true;
                } else {
                    const t = 1.0 - Math.exp(-6 * dt);
                    camPos.lerp(ideal, t);
                    camLook.lerp(aim, t);
                }
                camera.position.copy(camPos);
                camera.lookAt(camLook);
            } else {
                // Cockpit: the pilot's seat, looking 40 m ahead.
                camera.position.copy(plane.state.pos)
                    .addScaledVector(fwd, 1.6)
                    .add(new THREE.Vector3(0, 0.9, 0));
                camera.lookAt(plane.state.pos.clone().addScaledVector(fwd, 40));
            }
            renderer.render(scene, camera);
        },
    };
}
