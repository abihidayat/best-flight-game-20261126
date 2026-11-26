import * as THREE from 'three';
import { WORLD, PLANE, GAME, RINGS, clamp } from './config.js';
import { createWorld } from './world.js';
import { createPlane, spawnPoint } from './plane.js';
import { createRender, headingDeg } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = parseInt(params.get('seed') || '1', 10);

const canvas = document.getElementById('game');
const world = createWorld(seed);
const plane = createPlane();
const render = createRender(canvas, world, plane);
const input = createInput(canvas);
const audio = createAudio();

const game = {
    screen: 'title',
    score: 0,
    ringsHit: 0,
    lives: GAME.LIVES,
    timeLeft: GAME.TIME_LIMIT,
    best: readBest(),
    message: '',
    messageUntil: 0,
    view: 'chase',
    invulnerableUntil: 0,
    wasStalled: false
};

function readBest() {
    try {
        return parseInt(localStorage.getItem('island-run-best') || '0', 10);
    } catch (e) { return 0; }
}

function saveBest() {
    try {
        localStorage.setItem('island-run-best', game.best.toString());
    } catch (e) {}
}

function hudState() {
    return {
        score: game.score,
        ringsHit: game.ringsHit,
        ringsTotal: RINGS.COUNT,
        timeLeft: game.timeLeft,
        lives: game.lives,
        best: game.best,
        speed: plane.state.speed,
        throttle: plane.state.throttle,
        altitude: Math.max(0, plane.state.pos.y),
        heading: 0,
        stalled: plane.state.speed < PLANE.STALL_SPEED,
        screen: game.screen,
        message: game.message,
        messageUntil: game.messageUntil
    };
}

function showOverlay(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'flex' : 'none';

    if (show) {
        const bestEls = document.querySelectorAll('[id$="-best"]');
        bestEls.forEach(e => e.textContent = game.best);

        const scoreOver = document.getElementById('hud-over-score');
        if (scoreOver) scoreOver.textContent = game.score;

        const scoreComp = document.getElementById('hud-complete-score');
        if (scoreComp) scoreComp.textContent = game.score;

        const timeComp = document.getElementById('hud-complete-time');
        if (timeComp) timeComp.textContent = Math.ceil(game.timeLeft);
    }
}

function announce(msg) {
    const status = document.getElementById('status');
    if (status) status.textContent = msg;
}

function startGame() {
    world.reset();
    const s = spawnPoint();
    s.pos.y = world.heightAt(s.pos.x, s.pos.z) + 1.0;
    plane.reset(s);

    game.score = 0;
    game.ringsHit = 0;
    game.lives = GAME.LIVES;
    game.timeLeft = GAME.TIME_LIMIT;
    game.screen = 'play';
    game.view = 'chase';
    game.invulnerableUntil = 0;

    render.setView('chase');
    render.setSunset(false);
    render.snapCamera();

    ['hud-title', 'hud-paused', 'hud-over', 'hud-complete'].forEach(id => showOverlay(id, false));

    game.message = 'FLY THROUGH THE GOLD RINGS!';
    game.messageUntil = performance.now() + 3000;

    audio.resume();
    audio.click();
    announce('Playing. 3 lives.');
}

function gameOver(reason) {
    game.screen = 'over';
    if (game.score > game.best) {
        game.best = game.score;
        saveBest();
    }
    showOverlay('hud-over', true);
    if (reason === 'crash') audio.crash();
    announce('Game over. Score ' + game.score + '.');
}

function complete() {
    game.score += GAME.COMPLETE_BONUS + Math.round(game.timeLeft) * 5;
    if (game.score > game.best) {
        game.best = game.score;
        saveBest();
    }
    game.screen = 'complete';
    render.setSunset(true);
    showOverlay('hud-complete', true);
    audio.ring();
    announce('Course complete!');
}

function respawn() {
    const passed = world.rings.filter(r => r.passed);
    const anchor = passed.length ? passed[passed.length - 1].pos : spawnPoint().pos;

    const spawnX = anchor.x - 40;
    const terrainY = world.heightAt(spawnX, anchor.z);
    const spawnY = Math.max(anchor.y + 25, terrainY + 30);

    plane.state.pos.set(spawnX, spawnY, anchor.z);
    plane.state.yaw = Math.PI / 2;
    plane.state.pitch = 0;
    plane.state.roll = 0;
    plane.state.speed = 45;
    plane.state.throttle = 0.6;

    plane.group.position.copy(plane.state.pos);
    render.snapCamera();

    game.invulnerableUntil = performance.now() + 2500;
    game.message = 'BACK IN THE AIR';
    game.messageUntil = performance.now() + 2000;
}

function updateCockpitPanel(state) {
    const cpAlt = document.getElementById('cp-alt');
    const cpSpd = document.getElementById('cp-spd');
    const cpHdg = document.getElementById('cp-hdg');
    if (cpAlt) cpAlt.textContent = Math.round(state.altitude);
    if (cpSpd) cpSpd.textContent = Math.round(state.speed * 3.6);
    if (cpHdg) cpHdg.textContent = String(headingDeg(plane.state.yaw)).padStart(3, '0');
}

let lastTime = performance.now();
const step = 1/60;
let accum = 0;

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    accum += dt;

    while (accum >= step) {
        update(step, now);
        accum -= step;
    }

    const state = hudState();
    render.updateHud(state);
    updateCockpitPanel(state);

    render.draw(dt);
    requestAnimationFrame(loop);
}

function update(dt, t) {
    // t is performance.now() (milliseconds) — message/invulnerability timing.
    // world.update wants elapsed SECONDS for its sin() animation.
    const ts = t / 1000;
    if (game.screen === 'play') {
        if (input.consumePause()) {
            game.screen = 'paused';
            showOverlay('hud-paused', true);
            return;
        }
        if (input.consumeCam()) {
            game.view = game.view === 'chase' ? 'cockpit' : 'chase';
            render.setView(game.view);
            const panel = document.getElementById('hud-panel');
            if (panel) panel.style.display = game.view === 'cockpit' ? 'grid' : 'none';
        }
        if (input.consumeRestart()) {
            startGame();
            return;
        }

        world.update(dt, ts);
        const ev = plane.update(dt, input, world);

        if (ev.ring) {
            world.markPassed(ev.ring);
            game.ringsHit++;
            game.score += GAME.RING_POINTS;
            audio.ring();
            game.message = 'RING ' + game.ringsHit + '/' + RINGS.COUNT + '  +' + GAME.RING_POINTS;
            game.messageUntil = t + 1800;
            if (game.ringsHit >= RINGS.COUNT) {
                complete();
                return;
            }
        }

        if (ev.crashed && t > game.invulnerableUntil) {
            game.lives--;
            if (game.lives <= 0) {
                gameOver('crash');
                return;
            } else {
                audio.crash();
                respawn();
            }
        }

        if (ev.stalled && !game.wasStalled) {
            game.message = 'STALL — NOSE DOWN, ADD THROTTLE';
            game.messageUntil = t + 1500;
        }
        game.wasStalled = ev.stalled;

        game.timeLeft -= dt;
        if (game.timeLeft <= 0) {
            game.timeLeft = 0;
            gameOver('time');
        }

        audio.setEngine(plane.state.throttle, plane.state.speed / PLANE.MAX_SPEED);
    } else if (game.screen === 'title') {
        world.update(dt, ts);
        if (input.consumeConfirm()) startGame();
    } else if (game.screen === 'paused') {
        if (input.consumePause() || input.consumeConfirm()) {
            game.screen = 'play';
            showOverlay('hud-paused', false);
        }
        if (input.consumeRestart()) startGame();
    } else if (game.screen === 'over' || game.screen === 'complete') {
        if (input.consumeConfirm() || input.consumeRestart()) startGame();
    }
}

window.addEventListener('resize', () => render.resize());
document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'play') {
        game.screen = 'paused';
        showOverlay('hud-paused', true);
    }
});

render.resize();

if (shotMode) {
    stageShot(shotMode, { world, plane, render, game, showOverlay });
    const state = hudState();
    render.updateHud(state);
    updateCockpitPanel(state);

    let painted = 0;
    const paint = () => {
        render.draw(0.016);
        painted++;
        if (painted < 2) requestAnimationFrame(paint);
        else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
} else {
    requestAnimationFrame(loop);
}
