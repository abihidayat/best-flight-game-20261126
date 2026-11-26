import * as THREE from 'three';
import { spawnPoint } from './plane.js';

export function stageShot(name, api) {
    const { world, plane, render, game, showOverlay } = api;

    const clearOverlays = () => {
        ['hud-title', 'hud-paused', 'hud-over', 'hud-complete'].forEach(id => showOverlay(id, false));
    };

    if (name === 'play' || name === 'ring' || name === 'end') {
        world.reset();
    }

    switch (name) {
        case 'start':
        default:
            game.screen = 'title';
            const s = spawnPoint();
            s.pos.y = world.heightAt(s.pos.x, s.pos.z) + 1.0;
            plane.reset(s);
            game.score = 0;
            game.ringsHit = 0;
            game.lives = 3;
            game.timeLeft = 180;
            render.setView('chase');
            render.setSunset(false);
            render.snapCamera();
            clearOverlays();
            showOverlay('hud-title', true);
            break;

        case 'play':
            world.markPassed(world.rings[0]);
            world.markPassed(world.rings[1]);
            game.screen = 'play';
            game.score = 200;
            game.ringsHit = 2;
            game.lives = 3;
            game.timeLeft = 150;
            const r2 = world.rings[2];
            const dir2 = r2.pos.clone().sub(world.rings[1].pos).normalize();
            const pos2 = r2.pos.clone().addScaledVector(dir2, -45).add(new THREE.Vector3(0, 6, 0));
            plane.state.pos.copy(pos2);
            plane.state.yaw = Math.atan2(dir2.x, dir2.z);
            plane.state.pitch = -0.04;
            plane.state.roll = 0;
            plane.state.speed = 85;
            plane.state.throttle = 0.7;
            plane.group.position.copy(pos2);
            plane.group.rotation.set(0.04, plane.state.yaw, 0);
            render.setView('chase');
            render.setSunset(false);
            render.snapCamera();
            clearOverlays();
            break;

        case 'ring':
            world.markPassed(world.rings[0]);
            world.markPassed(world.rings[1]);
            world.markPassed(world.rings[2]);
            game.screen = 'play';
            game.score = 300;
            game.ringsHit = 3;
            game.lives = 3;
            game.timeLeft = 140;
            const r3 = world.rings[3];
            const dir3 = r3.pos.clone().sub(world.rings[2].pos).normalize();
            const pos3 = r3.pos.clone().addScaledVector(dir3, -22).add(new THREE.Vector3(0, 2, 0));
            plane.state.pos.copy(pos3);
            plane.state.yaw = Math.atan2(dir3.x, dir3.z);
            plane.state.pitch = -0.02;
            plane.state.roll = 0;
            plane.state.speed = 90;
            plane.state.throttle = 0.75;
            plane.group.position.copy(pos3);
            plane.group.rotation.set(0.02, plane.state.yaw, 0);
            render.setView('chase');
            render.setSunset(false);
            render.snapCamera();
            clearOverlays();
            break;

        case 'end':
            world.rings.forEach(r => world.markPassed(r));
            game.screen = 'complete';
            game.score = 1450;
            game.ringsHit = 10;
            game.lives = 3;
            game.timeLeft = 42;
            const posE = new THREE.Vector3(60, 130, -80);
            plane.state.pos.copy(posE);
            plane.state.yaw = Math.atan2(-60, 80);
            plane.state.pitch = 0.05;
            plane.state.roll = 0;
            plane.state.speed = 80;
            plane.state.throttle = 0.6;
            plane.group.position.copy(posE);
            plane.group.rotation.set(-0.05, plane.state.yaw, 0);
            render.setSunset(true);
            render.setView('chase');
            render.snapCamera();
            clearOverlays();
            showOverlay('hud-complete', true);
            break;
    }
}
