// game/src/main.js — game loop, screens, scoring and screenshot staging.
// Boots the world, the plane, the renderer, the input and the audio, then
// runs the fixed-step loop. Shot mode (?shot=start|play|ring|end) stages one
// frozen frame instead and raises window.__shotReady after two paints.
import * as THREE from 'three';
import { PLANE, GAME, RINGS } from './config.js';
import { createWorld } from './world.js';
import { createPlane, spawnPoint } from './plane.js';
import { createRender, headingDeg } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const seed = parseInt(query.get('seed') || '1', 10);

const canvas = document.getElementById('game');
const world = createWorld(seed);
const plane = createPlane();
const render = createRender(canvas, world, plane);
const input = createInput(canvas);
const audio = createAudio();

// Mutable run state. screen: title | play | paused | over | complete.
const G = {
    screen: 'title',
    score: 0,
    ringsHit: 0,
    lives: GAME.LIVES,
    timeLeft: GAME.TIME_LIMIT,
    best: loadBest(),
    message: '',
    messageUntil: 0,
    view: 'chase',
    invulnerableUntil: 0,
    wasStalled: false,
};

function loadBest() {
    try {
        return parseInt(localStorage.getItem('island-run-best') || '0', 10);
    } catch (e) {
        return 0;
    }
}

function storeBest() {
    try {
        localStorage.setItem('island-run-best', String(G.best));
    } catch (e) {
        // Best score is a nicety; a blocked store must never break the game.
    }
}

function hudSnapshot() {
    return {
        score: G.score,
        ringsHit: G.ringsHit,
        ringsTotal: RINGS.COUNT,
        timeLeft: G.timeLeft,
        lives: G.lives,
        best: G.best,
        speed: plane.state.speed,
        throttle: plane.state.throttle,
        altitude: Math.max(0, plane.state.pos.y),
        heading: 0,
        stalled: plane.state.speed < PLANE.STALL_SPEED,
        screen: G.screen,
        message: G.message,
        messageUntil: G.messageUntil,
    };
}

// Overlays are plain divs; show one, hide the rest. Showing an end screen
// also refreshes its score/best figures.
function setOverlay(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    for (const b of document.querySelectorAll('[id$="-best"]')) {
        b.textContent = G.best;
    }
    const overScore = document.getElementById('hud-over-score');
    if (overScore) overScore.textContent = G.score;
    const doneScore = document.getElementById('hud-complete-score');
    if (doneScore) doneScore.textContent = G.score;
    const doneTime = document.getElementById('hud-complete-time');
    if (doneTime) doneTime.textContent = Math.ceil(G.timeLeft);
}

function hideOverlays() {
    for (const id of ['hud-title', 'hud-paused', 'hud-over', 'hud-complete']) {
        setOverlay(id, false);
    }
}

function announce(msg) {
    const status = document.getElementById('status');
    if (status) status.textContent = msg;
}

function newRun() {
    world.reset();
    const start = spawnPoint();
    start.pos.y = world.heightAt(start.pos.x, start.pos.z) + 1.0;
    plane.reset(start);

    G.score = 0;
    G.ringsHit = 0;
    G.lives = GAME.LIVES;
    G.timeLeft = GAME.TIME_LIMIT;
    G.screen = 'play';
    G.view = 'chase';
    G.invulnerableUntil = 0;

    render.setView('chase');
    render.setSunset(false);
    render.snapCamera();
    hideOverlays();

    G.message = 'FLY THROUGH THE GOLD RINGS!';
    G.messageUntil = performance.now() + 3000;
    audio.resume();
    audio.click();
    announce('Playing. 3 lives.');
}

function endRun(reason) {
    G.screen = 'over';
    if (G.score > G.best) {
        G.best = G.score;
        storeBest();
    }
    setOverlay('hud-over', true);
    if (reason === 'crash') audio.crash();
    announce('Game over. Score ' + G.score + '.');
}

function finishCourse() {
    G.score += GAME.COMPLETE_BONUS + Math.round(G.timeLeft) * 5;
    if (G.score > G.best) {
        G.best = G.score;
        storeBest();
    }
    G.screen = 'complete';
    render.setSunset(true);
    setOverlay('hud-complete', true);
    audio.ring();
    announce('Course complete!');
}

// After a crash with lives left: drop the plane back in the air behind the
// last gate it cleared (or behind the runway when none), briefly untouchable.
function putBackInAir() {
    const cleared = world.rings.filter((r) => r.passed);
    const anchor = cleared.length
        ? cleared[cleared.length - 1].pos
        : spawnPoint().pos;
    const bx = anchor.x - 40;
    const by = Math.max(
        anchor.y + 25, world.heightAt(bx, anchor.z) + 30,
    );
    plane.state.pos.set(bx, by, anchor.z);
    plane.state.yaw = Math.PI / 2;
    plane.state.pitch = 0;
    plane.state.roll = 0;
    plane.state.speed = 45;
    plane.state.throttle = 0.6;
    plane.group.position.copy(plane.state.pos);
    render.snapCamera();
    G.invulnerableUntil = performance.now() + 2500;
    G.message = 'BACK IN THE AIR';
    G.messageUntil = performance.now() + 2000;
}

// Mirror the HUD numbers onto the cockpit panel's big lit digits.
function syncPanel(snap) {
    const alt = document.getElementById('cp-alt');
    const spd = document.getElementById('cp-spd');
    const hdg = document.getElementById('cp-hdg');
    if (alt) alt.textContent = Math.round(snap.altitude);
    if (spd) spd.textContent = Math.round(snap.speed * 3.6);
    if (hdg) hdg.textContent = String(headingDeg(plane.state.yaw)).padStart(3, '0');
}

// One fixed step. `nowMs` is performance.now(); the world animation wants
// elapsed seconds, so it gets nowMs / 1000 while the message timers keep ms.
function step(dt, nowMs) {
    const tSec = nowMs / 1000;
    if (G.screen === 'play') {
        if (input.consumePause()) {
            G.screen = 'paused';
            setOverlay('hud-paused', true);
            return;
        }
        if (input.consumeCam()) {
            G.view = G.view === 'chase' ? 'cockpit' : 'chase';
            render.setView(G.view);
            const panel = document.getElementById('hud-panel');
            if (panel) panel.style.display = G.view === 'cockpit' ? 'grid' : 'none';
        }
        if (input.consumeRestart()) {
            newRun();
            return;
        }

        world.update(dt, tSec);
        const ev = plane.update(dt, input, world);

        if (ev.ring) {
            world.markPassed(ev.ring);
            G.ringsHit++;
            G.score += GAME.RING_POINTS;
            audio.ring();
            G.message = 'RING ' + G.ringsHit + '/' + RINGS.COUNT
                + '  +' + GAME.RING_POINTS;
            G.messageUntil = nowMs + 1800;
            if (G.ringsHit >= RINGS.COUNT) {
                finishCourse();
                return;
            }
        }

        if (ev.crashed && nowMs > G.invulnerableUntil) {
            G.lives--;
            if (G.lives <= 0) {
                endRun('crash');
                return;
            }
            audio.crash();
            putBackInAir();
        }

        if (ev.stalled && !G.wasStalled) {
            G.message = 'STALL — NOSE DOWN, ADD THROTTLE';
            G.messageUntil = nowMs + 1500;
        }
        G.wasStalled = ev.stalled;

        G.timeLeft -= dt;
        if (G.timeLeft <= 0) {
            G.timeLeft = 0;
            endRun('time');
            return;
        }
        audio.setEngine(
            plane.state.throttle, plane.state.speed / PLANE.MAX_SPEED,
        );
    } else if (G.screen === 'title') {
        world.update(dt, tSec);
        if (input.consumeConfirm()) newRun();
    } else if (G.screen === 'paused') {
        if (input.consumePause() || input.consumeConfirm()) {
            G.screen = 'play';
            setOverlay('hud-paused', false);
        }
        if (input.consumeRestart()) newRun();
    } else if (G.screen === 'over' || G.screen === 'complete') {
        if (input.consumeConfirm() || input.consumeRestart()) newRun();
    }
}

let lastNow = performance.now();
const STEP = 1 / 60;
let backlog = 0;

function frame(nowMs) {
    const dt = Math.min((nowMs - lastNow) / 1000, 0.25);
    lastNow = nowMs;
    backlog += dt;
    while (backlog >= STEP) {
        step(STEP, nowMs);
        backlog -= STEP;
    }
    const snap = hudSnapshot();
    render.updateHud(snap);
    syncPanel(snap);
    render.draw(dt);
    requestAnimationFrame(frame);
}

window.addEventListener('resize', () => render.resize());
document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'play') {
        G.screen = 'paused';
        setOverlay('hud-paused', true);
    }
});

render.resize();

if (shotName) {
    stageShot(shotName, { world, plane, render, game: G, showOverlay: setOverlay });
    const snap = hudSnapshot();
    render.updateHud(snap);
    syncPanel(snap);
    let painted = 0;
    const paint = () => {
        render.draw(0.016);
        painted++;
        if (painted < 2) requestAnimationFrame(paint);
        else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
} else {
    requestAnimationFrame(frame);
}
