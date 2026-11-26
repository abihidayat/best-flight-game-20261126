import * as THREE from 'three';
import { mulberry32, fbm2, valueNoise2 } from './random.js';
import { WORLD, COLORS, RINGS, clamp } from './config.js';

export function createWorld(seed) {
    const rng = mulberry32(seed);
    const worldGroup = new THREE.Group();

    // --- Height Function ---
    function heightAt(x, z) {
        const d = Math.sqrt(x * x + z * z);
        const islandMask = Math.max(0, Math.min(1, (600 - d) / 200));
        if (islandMask <= 0) return -2;

        // Base terrain with FBM
        let h = fbm2(x * 0.004, z * 0.004) * 45;

        // Two specific peaks
        const p1 = Math.exp(-(Math.pow(x - 250, 2) + Math.pow(z - 200, 2)) / 12000) * 85;
        const p2 = Math.exp(-(Math.pow(x + 300, 2) + Math.pow(z + 250, 2)) / 18000) * 105;
        h += p1 + p2;

        // Airfield flattening: the runway strip (x -350..150, |z| <= 12) is
        // flat at y = 2, fading out over 60 m in x and 30 m in z so the pad
        // meets the hills instead of the runway being buried under terrain.
        const ax = 1 - clamp((Math.abs(x + 100) - 250) / 60, 0, 1);
        const az = 1 - clamp((Math.abs(z) - 12) / 30, 0, 1);
        const airfieldMask = ax * az;
        h = THREE.MathUtils.lerp(h * islandMask, 2.0, airfieldMask);

        return h;
    }

    // --- Terrain ---
    const terrainSize = 1400;
    const terrainSegments = 140;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
    terrainGeo.rotateX(-Math.PI / 2);

    const vertices = terrainGeo.attributes.position.array;
    const colors = new Float32Array(vertices.length);
    const colorA = new THREE.Color();

    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        const h = heightAt(x, z);
        vertices[i + 1] = h;

        // Calculate slope roughly for coloring
        const hR = heightAt(x + 5, z);
        const hF = heightAt(x, z + 5);
        const slope = Math.abs(h - hR) + Math.abs(h - hF);

        if (h < 1.2) {
            colorA.set(COLORS.SAND);
        } else if (h > 98 && slope < 2) {
            colorA.set(0xffffff); // Snow
        } else if (slope > 3.5 || h > 70) {
            colorA.set(COLORS.ROCK);
        } else {
            colorA.set(COLORS.GRASS);
        }
        colorA.toArray(colors, i);
    }
    terrainGeo.computeVertexNormals();
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    worldGroup.add(terrainMesh);

    // --- Sea ---
    const seaGeo = new THREE.PlaneGeometry(3000, 3000);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshStandardMaterial({
        color: COLORS.SEA,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.y = 0;
    worldGroup.add(seaMesh);

    // --- Runway ---
    const rwWidth = 14;
    const rwStart = -350;
    const rwEnd = 150;
    const rwLen = rwEnd - rwStart;
    const rwGeo = new THREE.PlaneGeometry(rwLen, rwWidth);
    rwGeo.rotateX(-Math.PI / 2);

    const rwCanvas = document.createElement('canvas');
    rwCanvas.width = 512; rwCanvas.height = 64;
    const ctx = rwCanvas.getContext('2d');
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 512, 64);
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([20, 20]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 32); ctx.lineTo(512, 32);
    ctx.stroke();
    // Thresholds
    ctx.setLineDash([]);
    ctx.fillRect(10, 10, 5, 44); ctx.fillRect(20, 10, 5, 44);
    ctx.fillRect(497, 10, 5, 44); ctx.fillRect(487, 10, 5, 44);

    const rwTex = new THREE.CanvasTexture(rwCanvas);
    rwTex.wrapS = THREE.RepeatWrapping;
    const rwMat = new THREE.MeshBasicMaterial({ map: rwTex });
    const rwMesh = new THREE.Mesh(rwGeo, rwMat);
    rwMesh.position.set((rwStart + rwEnd) / 2, 2.15, 0);
    worldGroup.add(rwMesh);

    // Hangars
    const hangarGeo = new THREE.BoxGeometry(20, 10, 30);
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let i = 0; i < 2; i++) {
        const hng = new THREE.Mesh(hangarGeo, hangarMat);
        hng.position.set(-280 + i * 40, 7, -25);
        worldGroup.add(hng);
    }

    // Windsock
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 8);
    const pole = new THREE.Mesh(poleGeo, hangarMat);
    pole.position.set(-320, 6, 15);
    const sockGeo = new THREE.ConeGeometry(1, 4, 8);
    sockGeo.rotateZ(Math.PI / 2);
    const sockMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const sock = new THREE.Mesh(sockGeo, sockMat);
    sock.position.set(2, 4, 0);
    pole.add(sock);
    worldGroup.add(pole);

    // --- Town ---
    const winCanvas = document.createElement('canvas');
    winCanvas.width = 64; winCanvas.height = 64;
    const wctx = winCanvas.getContext('2d');
    wctx.fillStyle = '#333'; wctx.fillRect(0,0,64,64);
    wctx.fillStyle = '#ffcc00';
    for(let i=0; i<4; i++) for(let j=0; j<6; j++) if(rng() > 0.3) wctx.fillRect(i*16+4, j*10+4, 8, 5);
    const winTex = new THREE.CanvasTexture(winCanvas);
    const townMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissiveMap: winTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.5 });

    for (let i = 0; i < 12; i++) {
        const twH = 5 + rng() * 15;
        const twBox = new THREE.Mesh(new THREE.BoxGeometry(8, twH, 8), townMat);
        const tx = -250 + rng() * 200;
        const tz = 40 + rng() * 100;
        twBox.position.set(tx, heightAt(tx, tz) + twH / 2, tz);
        worldGroup.add(twBox);
    }

    // --- Trees ---
    const treeTrunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3, 6);
    const treeTopGeo = new THREE.ConeGeometry(2.5, 7, 8);
    treeTopGeo.translate(0, 5, 0);
    const trunkMesh = new THREE.InstancedMesh(treeTrunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3a22 }), 120);
    const treeMesh = new THREE.InstancedMesh(treeTopGeo, new THREE.MeshStandardMaterial({ color: 0x2f7a1e }), 120);
    let treeCount = 0;
    for (let i = 0; i < 1000 && treeCount < 120; i++) {
        const rx = (rng() - 0.5) * 1100;
        const rz = (rng() - 0.5) * 1100;
        const rh = heightAt(rx, rz);
        if (rh > 4 && rh < 45 && Math.abs(rz) > 25) {
            const m = new THREE.Matrix4().makeTranslation(rx, rh, rz);
            trunkMesh.setMatrixAt(treeCount, m);
            treeMesh.setMatrixAt(treeCount, m);
            treeCount++;
        }
    }
    trunkMesh.count = treeCount;
    treeMesh.count = treeCount;
    worldGroup.add(trunkMesh);
    worldGroup.add(treeMesh);

    // --- Clouds ---
    const clouds = [];
    for (let i = 0; i < 10; i++) {
        const cloudGroup = new THREE.Group();
        const numSpheres = 3 + Math.floor(rng() * 3);
        const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        for (let j = 0; j < numSpheres; j++) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(10 + rng() * 10, 8, 8), cloudMat);
            s.scale.y = 0.5;
            s.position.set(rng() * 20 - 10, rng() * 5, rng() * 20 - 10);
            cloudGroup.add(s);
        }
        cloudGroup.position.set((rng() - 0.5) * 1200, 150 + rng() * 70, (rng() - 0.5) * 1200);
        worldGroup.add(cloudGroup);
        clouds.push({ mesh: cloudGroup, speed: 2 + rng() * 3 });
    }

    // --- Rings ---
    const ringCoords = [
        [250, 45, 0], [420, 60, 180], [380, 75, 420], [120, 85, 520], [-180, 90, 430],
        [-380, 70, 180], [-420, 55, -120], [-260, 60, -380], [0, 50, -480], [220, 45, -260]
    ];
    const rings = [];
    const ringGeo = new THREE.TorusGeometry(13, 1.2, 12, 24);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

    ringCoords.forEach((coord, i) => {
        const pos = new THREE.Vector3(coord[0], coord[1], coord[2]);
        const terrainH = heightAt(pos.x, pos.z);
        pos.y = Math.max(pos.y, terrainH + 25);

        const rMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2 });
        const rMesh = new THREE.Mesh(ringGeo, rMat);
        rMesh.position.copy(pos);

        // Orient ring: hole faces the next ring on the course
        const nextIdx = (i + 1) % ringCoords.length;
        const target = new THREE.Vector3(ringCoords[nextIdx][0], ringCoords[nextIdx][1], ringCoords[nextIdx][2]);
        rMesh.lookAt(target);

        // Pole down to the terrain (only when the ring is close to the ground)
        const pLen = pos.y - terrainH;
        if (pLen < 45) {
            const pGeo = new THREE.CylinderGeometry(0.5, 0.5, pLen);
            const pMesh = new THREE.Mesh(pGeo, poleMat);
            pMesh.position.set(pos.x, terrainH + pLen / 2, pos.z);
            worldGroup.add(pMesh);
        }

        worldGroup.add(rMesh);
        rings.push({ pos, radius: 13, passed: false, mesh: rMesh, material: rMat });
    });

    return {
        group: worldGroup,
        heightAt,
        rings,
        runway: { start: new THREE.Vector3(rwStart, 2, 0), end: new THREE.Vector3(rwEnd, 2, 0), mesh: rwMesh },
        reset() {
            rings.forEach(r => {
                r.passed = false;
                r.material.color.set(0xffaa00);
                r.material.emissive.set(0xffaa00);
                r.mesh.scale.setScalar(1);
            });
        },
        update(dt, t) {
            // Animate Sea
            seaMat.opacity = 0.6 + Math.sin(t * 0.5) * 0.1;

            // Drift Clouds
            clouds.forEach(c => {
                c.mesh.position.x += c.speed * dt;
                if (c.mesh.position.x > 800) c.mesh.position.x = -800;
            });

            // Pulse next ring
            const next = this.nextRing();
            if (next) {
                const s = 1 + Math.sin(t * 6) * 0.15;
                next.mesh.scale.set(s, s, s);
                next.material.emissiveIntensity = 2 + Math.sin(t * 6) * 1;
            }
        },
        nextRing() {
            return rings.find(r => !r.passed) || null;
        },
        markPassed(ring) {
            ring.passed = true;
            ring.material.color.set(0x00ff00);
            ring.material.emissive.set(0x00ff00);
            ring.mesh.scale.setScalar(1);
        },
        isSea(x, z) {
            return heightAt(x, z) <= 0.3 && Math.sqrt(x * x + z * z) > 450;
        }
    };
}
