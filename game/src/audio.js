// game/src/audio.js — all sound is synthesized with WebAudio: engine drone,
// wind rush, a chime for each gate, a thud for a crash, a tick for menus.
// Nothing is fetched; the graph is built lazily on the first user gesture.
export function createAudio() {
    let ctx = null;
    let master = null;
    let oscA = null;
    let oscB = null;
    let engineBus = null;
    let windSrc = null;
    let windBus = null;
    let ready = false;

    // One short pitched blip: an oscillator with a frequency ramp and a
    // gain envelope, connected straight to the master bus.
    function blip(type, from, to, seconds, vol) {
        if (!ready) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(from, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), now + seconds);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + seconds);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now);
        osc.stop(now + seconds);
    }

    // A looped white-noise buffer shared by the wind bed and the crash burst.
    function noiseBuffer() {
        const len = 2 * ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    const api = {
        muted: false,

        resume: async () => {
            if (ready) {
                if (ctx.state === 'suspended') await ctx.resume();
                return;
            }
            try {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                master = ctx.createGain();
                master.connect(ctx.destination);

                // Engine: a sawtooth plus a sub-octave square, both fed
                // through one gain so the throttle can swell them together.
                engineBus = ctx.createGain();
                engineBus.gain.value = 0;
                oscA = ctx.createOscillator();
                oscA.type = 'sawtooth';
                oscA.frequency.value = 55;
                oscB = ctx.createOscillator();
                oscB.type = 'square';
                oscB.frequency.value = 27.5;
                oscA.connect(engineBus);
                oscB.connect(engineBus);
                engineBus.connect(master);
                oscA.start();
                oscB.start();

                // Wind: looped noise through a lowpass, gain tied to speed.
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 1000;
                windBus = ctx.createGain();
                windBus.gain.value = 0;
                windSrc = ctx.createBufferSource();
                windSrc.buffer = noiseBuffer();
                windSrc.loop = true;
                windSrc.connect(filter);
                filter.connect(windBus);
                windBus.connect(master);
                windSrc.start();

                ready = true;
            } catch (e) {
                console.warn('Audio init failed', e);
            }
        },

        setEngine: (throttle, speed01) => {
            if (!ready) return;
            const now = ctx.currentTime;
            const base = 50 + throttle * 60 + speed01 * 40;
            oscA.frequency.setTargetAtTime(base, now, 0.1);
            oscB.frequency.setTargetAtTime(base * 0.505, now, 0.1);
            engineBus.gain.setTargetAtTime(0.1 + throttle * 0.2, now, 0.1);
            windBus.gain.setTargetAtTime(speed01 * 0.15, now, 0.2);
        },

        ring: () => {
            blip('sine', 880, 1320, 0.4, 0.2);
        },

        crash: () => {
            if (!ready) return;
            blip('sine', 100, 40, 0.5, 0.5);
            const now = ctx.currentTime;
            const burst = ctx.createBufferSource();
            burst.buffer = windSrc.buffer;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.6);
            burst.connect(gain);
            gain.connect(master);
            burst.start(now);
        },

        click: () => {
            blip('sine', 1200, 1200, 0.05, 0.1);
        },

        setMuted: (m) => {
            api.muted = m;
            if (master) {
                master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
            }
        },
    };

    return api;
}
