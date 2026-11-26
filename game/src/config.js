// game/src/config.js

export const WORLD = {
    SIZE: 1400,
    SEA_LEVEL: 0,
    CEILING: 420,
    ISLAND_RADIUS: 620
};

export const PLANE = {
    MIN_SPEED: 32,
    MAX_SPEED: 150,
    CRUISE_SPEED: 85,
    ACCEL: 26,
    DRAG: 0.12,
    TURN_RATE: 0.9,
    PITCH_RATE: 0.7,
    ROLL_RATE: 2.2,
    STALL_SPEED: 38
};

export const RINGS = {
    COUNT: 10,
    RADIUS: 13
};

export const GAME = {
    LIVES: 3,
    TIME_LIMIT: 180,
    RING_POINTS: 100,
    COMPLETE_BONUS: 500
};

export const COLORS = {
    SKY_TOP: 0x2f6fd0,
    SKY_BOTTOM: 0xbfd9e8,
    SEA: 0x1e6f8e,
    SAND: 0xd9c28a,
    GRASS: 0x4d8a3f,
    ROCK: 0x6b6f75,
    RUNWAY: 0x2c2f36,
    RING: 0xffc21c,
    RING_DONE: 0x35d05a
};

export function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function deg2rad(d) {
    return d * (Math.PI / 180);
}

export function rad2deg(r) {
    return r * (180 / Math.PI);
}
