// game/src/plane.js — the Merpati-7: a single-prop island hopper built from
// primitives, plus the arcade flight model that flies it.
// The model faces +Z locally. State: pos (metres), yaw/pitch/roll (radians,
// pitch nose-up positive), speed (m/s), throttle (0..1).
import * as THREE from 'three';
import { WORLD, PLANE, clamp } from './config.js';

export function spawnPoint() {
    return {
        pos: new THREE.Vector3(-320, 8, 0),
        yaw: Math.PI / 2,
        pitch: 0,
        roll: 0,
        speed: 0,
        throttle: 0.35,
    };
}

export function createPlane() {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    const hullMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const wingMat = new THREE.MeshPhongMaterial({ color: 0x87ceeb });
    const accentMat = new THREE.MeshPhongMaterial({ color: 0xffa500 });
    const glassMat = new THREE.MeshPhongMaterial({
        color: 0x222222, transparent: true, opacity: 0.6, emissive: 0x111111,
    });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

    // Add one mesh to the airframe: geometry + material, placed and turned.
    function addPart(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rx, ry, rz);
        group.add(mesh);
        return mesh;
    }

    // Fuselage: a capsule lying along Z, orange spinner cone at the nose.
    addPart(new THREE.CapsuleGeometry(0.6, 3, 4, 12), hullMat, 0, 0, 0, Math.PI / 2);
    addPart(new THREE.ConeGeometry(0.6, 1, 12), accentMat, 0, 0, 2.2, Math.PI / 2);
    // Wings, tailplane, fin.
    addPart(new THREE.BoxGeometry(6, 0.1, 1.5), wingMat, 0, -0.1, 0.2);
    addPart(new THREE.BoxGeometry(2, 0.05, 0.8), wingMat, 0, 0, -1.8);
    addPart(new THREE.BoxGeometry(0.05, 1, 0.8), accentMat, 0, 0.5, -1.8);
    // Bubble canopy, stretched along the fuselage.
    const canopy = addPart(
        new THREE.SphereGeometry(0.45, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        glassMat, 0, 0.35, 0.5,
    );
    canopy.scale.set(1, 1, 2.5);

    // Two-blade propeller on the nose; its spin is driven in update().
    const prop = new THREE.Group();
    prop.position.z = 2.75;
    group.add(prop);
    prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.02), darkMat));

    // Fixed gear and navigation lights (red port, green starboard, white tail).
    addPart(new THREE.SphereGeometry(0.15, 8, 8), darkMat, 0.8, -0.8, 0.8);
    addPart(new THREE.SphereGeometry(0.15, 8, 8), darkMat, -0.8, -0.8, 0.8);
    const lampGeo = new THREE.SphereGeometry(0.08, 8, 8);
    addPart(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }), 2.9, -0.1, 0.2);
    addPart(lampGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }), -2.9, -0.1, 0.2);
    addPart(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 1, -2.1);

    const state = spawnPoint();

    // Forward vector from yaw (0 = north, 90 deg = east) and pitch.
    function forwardOf(s) {
        return new THREE.Vector3(
            Math.sin(s.yaw) * Math.cos(s.pitch),
            Math.sin(s.pitch),
            Math.cos(s.yaw) * Math.cos(s.pitch),
        );
    }

    return {
        group,
        state,
        prop,
        reset(spawn) {
            state.pos.copy(spawn.pos);
            state.yaw = spawn.yaw;
            state.pitch = spawn.pitch;
            state.roll = spawn.roll;
            state.speed = spawn.speed;
            state.throttle = spawn.throttle;
            group.position.copy(state.pos);
            prop.rotation.z = 0;
        },
        update(dt, input, world) {
            const axes = input.axis();

            // Throttle and speed: chase the throttle's target speed, with
            // extra drag when the throttle is nearly closed.
            state.throttle = clamp(
                state.throttle + input.throttleAxis() * 0.45 * dt, 0, 1,
            );
            const cruise = PLANE.MIN_SPEED
                + state.throttle * (PLANE.MAX_SPEED - PLANE.MIN_SPEED);
            const push = cruise > state.speed ? PLANE.ACCEL : PLANE.ACCEL * 0.5;
            state.speed += clamp(cruise - state.speed, -push * dt, push * dt);
            if (state.throttle < 0.15) {
                state.speed -= state.speed * PLANE.DRAG * dt * 1.5;
            }

            // Attitude: stick pitch is nose-up negative, so it subtracts;
            // the wings level themselves when the stick is centred.
            state.pitch -= axes.pitch * PLANE.PITCH_RATE * dt;
            state.pitch = clamp(state.pitch, -0.55, 0.6);
            state.roll += axes.roll * PLANE.ROLL_RATE * dt;
            if (axes.roll === 0) state.roll -= state.roll * 1.5 * dt;
            state.roll = clamp(state.roll, -1.15, 1.15);

            // A banked turn: roll right and the heading swings right. The
            // turn bites harder at speed. The mouse drags the heading too.
            const bite = 0.4 + 0.6 * (state.speed / PLANE.CRUISE_SPEED);
            state.yaw += state.roll * PLANE.TURN_RATE * dt * bite;
            state.yaw += input.mouseDX() * 0.0016;

            // Stall: below the floor the nose drops and the dive rebuilds
            // speed on its own.
            const stalled = state.speed < PLANE.STALL_SPEED;
            if (stalled) {
                state.pitch -= 0.35 * dt;
                state.speed += 12 * dt;
            }

            state.pos.addScaledVector(forwardOf(state), state.speed * dt);

            // Ceiling: level off at the top of the sky.
            if (state.pos.y > WORLD.CEILING) {
                state.pos.y = WORLD.CEILING;
                state.pitch = Math.min(state.pitch, 0);
            }

            // Terrain and water: any contact is a crash.
            let crashed = false;
            if (state.pos.y < world.heightAt(state.pos.x, state.pos.z) + 1.2) {
                crashed = true;
            }
            if (world.isSea(state.pos.x, state.pos.z) && state.pos.y < 1.5) {
                crashed = true;
            }

            // Pose the model and spin the prop.
            group.position.copy(state.pos);
            group.rotation.set(-state.pitch, state.yaw, state.roll);
            prop.rotation.z += dt * (10 + state.speed * 0.5);

            // Only the next gate on the course can be flown.
            const gate = world.nextRing();
            const flown = gate
                && state.pos.distanceTo(gate.pos) < gate.radius * 0.95
                ? gate : null;

            return { crashed, ring: flown, stalled };
        },
    };
}
