// game/src/world.js — the island, its airfield, town, forest and ring course.
// All geometry is procedural and seeded: the same seed always builds the
// same island. Units are metres, Y-up, sea level y = 0.
import * as THREE from 'three';
import { mulberry32, fbm2 } from './random.js';
import { WORLD, COLORS, clamp } from './config.js';

// The ten gates of the course, flown in order. Heights are metres above sea
// level; the builder lifts any gate that would sit too close to the ground.
const COURSE = [
    [250, 45, 0], [420, 60, 180], [380, 75, 420], [120, 85, 520],
    [-180, 90, 430], [-380, 70, 180], [-420, 55, -120],
    [-260, 60, -380], [0, 50, -480], [220, 45, -260],
];

const RUNWAY = { x0: -350, x1: 150, y: 2.15, width: 14 };

export function createWorld(seed) {
    const rand = mulberry32(seed);
    const root = new THREE.Group();

    // Ground height at (x, z). A smooth island rises out of the sea; two
    // hills dominate it; the airfield strip is graded flat at y = 2.
    function groundHeight(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        const island = clamp((600 - dist) / 200, 0, 1);
        if (island <= 0) return -2;

        let h = fbm2(x * 0.004, z * 0.004) * 45;
        h += 85 * Math.exp(-((x - 250) ** 2 + (z - 200) ** 2) / 12000);
        h += 105 * Math.exp(-((x + 300) ** 2 + (z + 250) ** 2) / 18000);

        // Flat pad under the runway: full strength over the strip, fading
        // out 60 m along x and 30 m along z so the pad meets the hills.
        const along = 1 - clamp((Math.abs(x + 100) - 250) / 60, 0, 1);
        const across = 1 - clamp((Math.abs(z) - 12) / 30, 0, 1);
        return THREE.MathUtils.lerp(h * island, 2.0, along * across);
    }

    // --- Ground ------------------------------------------------------------
    const groundGeo = new THREE.PlaneGeometry(1400, 1400, 140, 140);
    groundGeo.rotateX(-Math.PI / 2);
    const verts = groundGeo.attributes.position.array;
    const tint = new Float32Array(verts.length);
    const c = new THREE.Color();
    for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i];
        const z = verts[i + 2];
        const h = groundHeight(x, z);
        verts[i + 1] = h;
        const slope = Math.abs(h - groundHeight(x + 5, z))
                    + Math.abs(h - groundHeight(x, z + 5));
        if (h < 1.2) c.set(COLORS.SAND);
        else if (h > 98 && slope < 2) c.set(0xffffff);
        else if (slope > 3.5 || h > 70) c.set(COLORS.ROCK);
        else c.set(COLORS.GRASS);
        c.toArray(tint, i);
    }
    groundGeo.computeVertexNormals();
    groundGeo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    root.add(new THREE.Mesh(
        groundGeo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    ));

    // --- Sea ---------------------------------------------------------------
    const seaMat = new THREE.MeshStandardMaterial({
        color: COLORS.SEA, transparent: true, opacity: 0.7, roughness: 0.1,
    });
    const seaGeo = new THREE.PlaneGeometry(3000, 3000);
    seaGeo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(seaGeo, seaMat);
    root.add(sea);

    // --- Runway ------------------------------------------------------------
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = 512;
    stripCanvas.height = 64;
    const g2 = stripCanvas.getContext('2d');
    g2.fillStyle = '#222';
    g2.fillRect(0, 0, 512, 64);
    g2.strokeStyle = '#fff';
    g2.setLineDash([20, 20]);
    g2.lineWidth = 2;
    g2.beginPath();
    g2.moveTo(0, 32);
    g2.lineTo(512, 32);
    g2.stroke();
    g2.setLineDash([]);
    g2.fillRect(10, 10, 5, 44);
    g2.fillRect(20, 10, 5, 44);
    g2.fillRect(487, 10, 5, 44);
    g2.fillRect(497, 10, 5, 44);
    const stripTex = new THREE.CanvasTexture(stripCanvas);
    stripTex.wrapS = THREE.RepeatWrapping;
    const stripGeo = new THREE.PlaneGeometry(RUNWAY.x1 - RUNWAY.x0, RUNWAY.width);
    stripGeo.rotateX(-Math.PI / 2);
    const strip = new THREE.Mesh(
        stripGeo, new THREE.MeshBasicMaterial({ map: stripTex }),
    );
    strip.position.set((RUNWAY.x0 + RUNWAY.x1) / 2, RUNWAY.y, 0);
    root.add(strip);

    // --- Airfield buildings -------------------------------------------------
    const shedMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const shedGeo = new THREE.BoxGeometry(20, 10, 30);
    for (let i = 0; i < 2; i++) {
        const shed = new THREE.Mesh(shedGeo, shedMat);
        shed.position.set(-280 + i * 40, 7, -25);
        root.add(shed);
    }
    // Windsock: pole + orange cone pointing downwind.
    const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 8), shedMat,
    );
    mast.position.set(-320, 6, 15);
    const sockGeo = new THREE.ConeGeometry(1, 4, 8);
    sockGeo.rotateZ(Math.PI / 2);
    const sock = new THREE.Mesh(
        sockGeo, new THREE.MeshBasicMaterial({ color: 0xff3300 }),
    );
    sock.position.set(2, 4, 0);
    mast.add(sock);
    root.add(mast);

    // --- Town: a dozen blocks south of the strip, windows lit -------------
    const winCanvas = document.createElement('canvas');
    winCanvas.width = 64;
    winCanvas.height = 64;
    const w2 = winCanvas.getContext('2d');
    w2.fillStyle = '#333';
    w2.fillRect(0, 0, 64, 64);
    w2.fillStyle = '#ffcc00';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 6; j++) {
            if (rand() > 0.3) w2.fillRect(i * 16 + 4, j * 10 + 4, 8, 5);
        }
    }
    const winTex = new THREE.CanvasTexture(winCanvas);
    const townMat = new THREE.MeshStandardMaterial({
        color: 0x555555,
        emissiveMap: winTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.5,
    });
    for (let i = 0; i < 12; i++) {
        const hgt = 5 + rand() * 15;
        const block = new THREE.Mesh(new THREE.BoxGeometry(8, hgt, 8), townMat);
        const bx = -250 + rand() * 200;
        const bz = 40 + rand() * 100;
        block.position.set(bx, groundHeight(bx, bz) + hgt / 2, bz);
        root.add(block);
    }

    // --- Forest: instanced trunks + cones, kept off the strip --------------
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3, 6);
    const crownGeo = new THREE.ConeGeometry(2.5, 7, 8);
    crownGeo.translate(0, 5, 0);
    const trunks = new THREE.InstancedMesh(
        trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3a22 }), 120,
    );
    const crowns = new THREE.InstancedMesh(
        crownGeo, new THREE.MeshStandardMaterial({ color: 0x2f7a1e }), 120,
    );
    let planted = 0;
    for (let i = 0; i < 1000 && planted < 120; i++) {
        const tx = (rand() - 0.5) * 1100;
        const tz = (rand() - 0.5) * 1100;
        const th = groundHeight(tx, tz);
        if (th > 4 && th < 45 && Math.abs(tz) > 25) {
            const m = new THREE.Matrix4().makeTranslation(tx, th, tz);
            trunks.setMatrixAt(planted, m);
            crowns.setMatrixAt(planted, m);
            planted++;
        }
    }
    trunks.count = planted;
    crowns.count = planted;
    root.add(trunks);
    root.add(crowns);

    // --- Clouds: drifting puffs of white spheres ----------------------------
    const clouds = [];
    for (let i = 0; i < 10; i++) {
        const puff = new THREE.Group();
        const puffs = 3 + Math.floor(rand() * 3);
        const puffMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.8,
        });
        for (let j = 0; j < puffs; j++) {
            const ball = new THREE.Mesh(
                new THREE.SphereGeometry(10 + rand() * 10, 8, 8), puffMat,
            );
            ball.scale.y = 0.5;
            ball.position.set(rand() * 20 - 10, rand() * 5, rand() * 20 - 10);
            puff.add(ball);
        }
        puff.position.set(
            (rand() - 0.5) * 1200, 150 + rand() * 70, (rand() - 0.5) * 1200,
        );
        root.add(puff);
        clouds.push({ mesh: puff, speed: 2 + rand() * 3 });
    }

    // --- The course: ten golden toruses, each facing the next --------------
    const rings = [];
    const torusGeo = new THREE.TorusGeometry(13, 1.2, 12, 24);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    COURSE.forEach((spot, i) => {
        const pos = new THREE.Vector3(spot[0], spot[1], spot[2]);
        const floor = groundHeight(pos.x, pos.z);
        pos.y = Math.max(pos.y, floor + 25);

        const mat = new THREE.MeshStandardMaterial({
            color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2,
        });
        const hoop = new THREE.Mesh(torusGeo, mat);
        hoop.position.copy(pos);
        const nxt = COURSE[(i + 1) % COURSE.length];
        hoop.lookAt(new THREE.Vector3(nxt[0], nxt[1], nxt[2]));

        // A post down to the ground, but only when the gate is low enough
        // for one to look right.
        const drop = pos.y - floor;
        if (drop < 45) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.5, drop), postMat,
            );
            post.position.set(pos.x, floor + drop / 2, pos.z);
            root.add(post);
        }
        root.add(hoop);
        rings.push({ pos, radius: 13, passed: false, mesh: hoop, material: mat });
    });

    const api = {
        group: root,
        heightAt: groundHeight,
        rings,
        runway: {
            start: new THREE.Vector3(RUNWAY.x0, RUNWAY.y, 0),
            end: new THREE.Vector3(RUNWAY.x1, RUNWAY.y, 0),
            mesh: strip,
        },
        reset() {
            for (const r of rings) {
                r.passed = false;
                r.material.color.set(0xffaa00);
                r.material.emissive.set(0xffaa00);
                r.mesh.scale.setScalar(1);
            }
        },
        update(dt, t) {
            seaMat.opacity = 0.6 + Math.sin(t * 0.5) * 0.1;
            for (const cl of clouds) {
                cl.mesh.position.x += cl.speed * dt;
                if (cl.mesh.position.x > 800) cl.mesh.position.x = -800;
            }
            const next = api.nextRing();
            if (next) {
                const pulse = 1 + Math.sin(t * 6) * 0.15;
                next.mesh.scale.set(pulse, pulse, pulse);
                next.material.emissiveIntensity = 2 + Math.sin(t * 6) * 1;
            }
        },
        nextRing() {
            return rings.find((r) => !r.passed) || null;
        },
        markPassed(ring) {
            ring.passed = true;
            ring.material.color.set(0x00ff00);
            ring.material.emissive.set(0x00ff00);
            ring.mesh.scale.setScalar(1);
        },
        isSea(x, z) {
            return groundHeight(x, z) <= 0.3
                && Math.sqrt(x * x + z * z) > 450;
        },
    };
    return api;
}
