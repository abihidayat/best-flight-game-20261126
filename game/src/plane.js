// game/src/plane.js
import * as THREE from 'three';
import { WORLD, PLANE, clamp, lerp } from './config.js';

export function spawnPoint() {
    return {
        pos: new THREE.Vector3(-320, 8, 0),
        yaw: Math.PI / 2, // 090 degrees (East / +X)
        pitch: 0,
        roll: 0,
        speed: 0,
        throttle: 0.35
    };
}

export function createPlane() {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    // Materials
    const matWhite = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const matBlue = new THREE.MeshPhongMaterial({ color: 0x87ceeb }); // Sky Blue
    const matOrange = new THREE.MeshPhongMaterial({ color: 0xffa500 });
    const matGlass = new THREE.MeshPhongMaterial({ color: 0x222222, transparent: true, opacity: 0.6, emissive: 0x111111 });
    const matBlack = new THREE.MeshPhongMaterial({ color: 0x111111 });

    // Fuselage (faces +Z)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 3, 4, 12), matWhite);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 12), matOrange);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2.2;
    group.add(nose);

    // Wings
    const wingGeom = new THREE.BoxGeometry(6, 0.1, 1.5);
    const wings = new THREE.Mesh(wingGeom, matBlue);
    wings.position.y = -0.1;
    wings.position.z = 0.2;
    group.add(wings);

    // Tail
    const hTail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 0.8), matBlue);
    hTail.position.z = -1.8;
    group.add(hTail);

    const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.8), matOrange);
    vTail.position.y = 0.5;
    vTail.position.z = -1.8;
    group.add(vTail);

    // Canopy
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), matGlass);
    canopy.scale.set(1, 1, 2.5);
    canopy.position.y = 0.35;
    canopy.position.z = 0.5;
    group.add(canopy);

    // Propeller
    const propGroup = new THREE.Group();
    propGroup.position.z = 2.75;
    group.add(propGroup);
    const bladeGeom = new THREE.BoxGeometry(0.1, 1.8, 0.02);
    const blade = new THREE.Mesh(bladeGeom, matBlack);
    propGroup.add(blade);

    // Gear
    const wheelGeom = new THREE.SphereGeometry(0.15, 8, 8);
    const wheelL = new THREE.Mesh(wheelGeom, matBlack);
    wheelL.position.set(0.8, -0.8, 0.8);
    group.add(wheelL);
    const wheelR = new THREE.Mesh(wheelGeom, matBlack);
    wheelR.position.set(-0.8, -0.8, 0.8);
    group.add(wheelR);

    // Nav Lights (red = left / +X wing, green = right / -X wing, white = tail)
    const lightGeom = new THREE.SphereGeometry(0.08, 8, 8);
    const lightL = new THREE.Mesh(lightGeom, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lightL.position.set(2.9, -0.1, 0.2);
    group.add(lightL);
    const lightR = new THREE.Mesh(lightGeom, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    lightR.position.set(-2.9, -0.1, 0.2);
    group.add(lightR);
    const lightT = new THREE.Mesh(lightGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lightT.position.set(0, 1, -2.1);
    group.add(lightT);

    const state = spawnPoint();

    return {
        group,
        state,
        prop: propGroup,
        reset(spawn) {
            Object.assign(state, spawn);
            state.pos = spawn.pos.clone();
            group.position.copy(state.pos);
            this.prop.rotation.z = 0;
        },
        update(dt, input, world) {
            // Throttle & Speed
            state.throttle = clamp(state.throttle + input.throttleAxis() * 0.45 * dt, 0, 1);
            const targetSpeed = PLANE.MIN_SPEED + state.throttle * (PLANE.MAX_SPEED - PLANE.MIN_SPEED);
            const accel = (targetSpeed > state.speed) ? PLANE.ACCEL : PLANE.ACCEL * 0.5;
            state.speed += clamp(targetSpeed - state.speed, -accel * dt, accel * dt);

            if (state.throttle < 0.15) {
                state.speed -= state.speed * PLANE.DRAG * dt * 1.5;
            }

            // Attitude (input axis pitch -1 = nose up; state.pitch nose-up positive)
            const axes = input.axis();
            state.pitch -= axes.pitch * PLANE.PITCH_RATE * dt;
            state.pitch = clamp(state.pitch, -0.55, 0.6);

            state.roll += axes.roll * PLANE.ROLL_RATE * dt;
            if (axes.roll === 0) {
                state.roll -= state.roll * 1.5 * dt;
            }
            state.roll = clamp(state.roll, -1.15, 1.15);

            // Yaw / Banking (roll > 0 = bank right = heading increases)
            const speedFactor = 0.4 + 0.6 * (state.speed / PLANE.CRUISE_SPEED);
            state.yaw += state.roll * PLANE.TURN_RATE * dt * speedFactor;
            state.yaw += input.mouseDX() * 0.0016;

            // Stall logic
            const stalled = state.speed < PLANE.STALL_SPEED;
            if (stalled) {
                state.pitch -= 0.35 * dt;
                state.speed += 12 * dt;
            }

            // Movement
            const forward = new THREE.Vector3(
                Math.sin(state.yaw) * Math.cos(state.pitch),
                Math.sin(state.pitch),
                Math.cos(state.yaw) * Math.cos(state.pitch)
            );
            state.pos.addScaledVector(forward, state.speed * dt);

            // Ceiling
            if (state.pos.y > WORLD.CEILING) {
                state.pos.y = WORLD.CEILING;
                state.pitch = Math.min(state.pitch, 0);
            }

            // Collision
            let crashed = false;
            const terrainY = world.heightAt(state.pos.x, state.pos.z);
            if (state.pos.y < terrainY + 1.2) crashed = true;
            if (world.isSea(state.pos.x, state.pos.z) && state.pos.y < 1.5) crashed = true;

            // Update visuals (rotation order YXZ: y=yaw, x=-pitch, z=roll)
            group.position.copy(state.pos);
            group.rotation.set(-state.pitch, state.yaw, state.roll);
            this.prop.rotation.z += dt * (10 + state.speed * 0.5);

            // Ring check (only the next ring counts)
            const ring = world.nextRing();
            let hitRing = null;
            if (ring && state.pos.distanceTo(ring.pos) < ring.radius * 0.95) {
                hitRing = ring;
            }

            return { crashed, ring: hitRing, stalled };
        }
    };
}
