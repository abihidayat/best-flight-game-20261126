// game/src/audio.js

export function createAudio() {
    let ctx = null;
    let masterGain = null;
    let engineOsc1 = null;
    let engineOsc2 = null;
    let engineGain = null;
    let windNoise = null;
    let windGain = null;
    let isInitialized = false;

    const api = {
        muted: false,
        resume: async () => {
            if (isInitialized) {
                if (ctx.state === 'suspended') await ctx.resume();
                return;
            }
            try {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = ctx.createGain();
                masterGain.connect(ctx.destination);

                // Engine
                engineGain = ctx.createGain();
                engineGain.gain.value = 0;
                engineOsc1 = ctx.createOscillator();
                engineOsc1.type = 'sawtooth';
                engineOsc1.frequency.value = 55;
                engineOsc2 = ctx.createOscillator();
                engineOsc2.type = 'square';
                engineOsc2.frequency.value = 27.5;

                engineOsc1.connect(engineGain);
                engineOsc2.connect(engineGain);
                engineGain.connect(masterGain);
                engineOsc1.start();
                engineOsc2.start();

                // Wind
                const bufferSize = 2 * ctx.sampleRate;
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }
                windNoise = ctx.createBufferSource();
                windNoise.buffer = noiseBuffer;
                windNoise.loop = true;

                const windFilter = ctx.createBiquadFilter();
                windFilter.type = 'lowpass';
                windFilter.frequency.value = 1000;

                windGain = ctx.createGain();
                windGain.gain.value = 0;

                windNoise.connect(windFilter);
                windFilter.connect(windGain);
                windGain.connect(masterGain);
                windNoise.start();

                isInitialized = true;
            } catch (e) {
                console.warn("Audio init failed", e);
            }
        },
        setEngine: (throttle, speedNorm) => {
            if (!isInitialized) return;
            const now = ctx.currentTime;
            const freqBase = 50 + throttle * 60 + speedNorm * 40;
            engineOsc1.frequency.setTargetAtTime(freqBase, now, 0.1);
            engineOsc2.frequency.setTargetAtTime(freqBase * 0.505, now, 0.1);
            engineGain.gain.setTargetAtTime(0.1 + throttle * 0.2, now, 0.1);
            windGain.gain.setTargetAtTime(speedNorm * 0.15, now, 0.2);
        },
        ring: () => {
            if (!isInitialized) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
            g.gain.setValueAtTime(0.2, now);
            g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.connect(g);
            g.connect(masterGain);
            osc.start();
            osc.stop(now + 0.4);
        },
        crash: () => {
            if (!isInitialized) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
            g.gain.setValueAtTime(0.5, now);
            g.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.connect(g);
            g.connect(masterGain);
            osc.start();
            osc.stop(now + 0.5);

            const n = ctx.createBufferSource();
            const ng = ctx.createGain();
            n.buffer = windNoise.buffer;
            ng.gain.setValueAtTime(0.5, now);
            ng.gain.linearRampToValueAtTime(0, now + 0.6);
            n.connect(ng);
            ng.connect(masterGain);
            n.start();
        },
        click: () => {
            if (!isInitialized) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            g.gain.setValueAtTime(0.1, now);
            g.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.connect(g);
            g.connect(masterGain);
            osc.start();
            osc.stop(now + 0.05);
        },
        setMuted: (m) => {
            api.muted = m;
            if (masterGain) masterGain.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
        }
    };

    return api;
}
