// game/src/random.js

export function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function hash2(ix, iz, seed) {
    const s = seed || 0;
    const x = Math.sin(ix * 12.9898 + iz * 78.233 + s) * 43758.5453123;
    return x - Math.floor(x);
}

export function valueNoise2(x, z, seed) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    const u = fx * fx * (3.0 - 2.0 * fx);
    const v = fz * fz * (3.0 - 2.0 * fz);

    const a = hash2(ix, iz, seed);
    const b = hash2(ix + 1, iz, seed);
    const c = hash2(ix, iz + 1, seed);
    const d = hash2(ix + 1, iz + 1, seed);

    return a * (1 - u) * (1 - v) +
           b * u * (1 - v) +
           c * (1 - u) * v +
           d * u * v;
}

export function fbm2(x, z, seed, octaves = 4) {
    let value = 0;
    let amplitude = 0.5;
    let freq = 1.0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * valueNoise2(x * freq, z * freq, seed);
        freq *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
