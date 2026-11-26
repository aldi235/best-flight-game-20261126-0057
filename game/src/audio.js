// Synthesised sound only: every effect is built with WebAudio oscillators and
// filtered noise, so the game ships no audio files and makes no network request.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let muted = false;
  let alarmTimer = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      engineOsc2.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, duration, type, volume, when = 0) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  return {
    /** Must be called from a user gesture at least once: browsers block audio before that. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.05;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum; pitch and loudness follow throttle and airspeed. */
    engine(throttle, speed, running) {
      if (!ensure() || muted) return;
      if (context.state === 'suspended') return;
      const rpm = 55 + throttle * 75 + speed * 0.35;
      engineOsc.frequency.setTargetAtTime(running ? rpm : 0, context.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(running ? rpm * 2.02 : 0, context.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + throttle * 900, context.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(running ? 0.035 + throttle * 0.045 : 0, context.currentTime, 0.1);
    },
    /** Bright two-note chime when the plane threads a target ring. */
    ring() {
      tone(880, 0.35, 'sine', 0.22);
      tone(1318.5, 0.5, 'sine', 0.2, 0.09);
    },
    /** Low thud on touchdown, plus a soft rumble while rolling. */
    touchdown(hard) {
      tone(hard ? 70 : 95, 0.28, 'sine', hard ? 0.5 : 0.3);
      tone(48, 0.35, 'triangle', 0.35);
    },
    /** Metallic crunch on a crash. */
    crash() {
      tone(160, 0.5, 'sawtooth', 0.3);
      tone(60, 0.7, 'square', 0.3, 0.05);
    },
    /** Short beep for a button press or a mission message. */
    blip() {
      tone(660, 0.09, 'sine', 0.15);
    },
    /** Rising fanfare when a mission is completed. */
    fanfare() {
      tone(523.25, 0.22, 'triangle', 0.22);
      tone(659.25, 0.22, 'triangle', 0.22, 0.14);
      tone(783.99, 0.22, 'triangle', 0.22, 0.28);
      tone(1046.5, 0.5, 'triangle', 0.25, 0.42);
    },
    /** Two-tone alarm while fuel is critical or the wing is stalling. Call every frame. */
    alarm(dt, active) {
      if (!ensure() || muted || !active) {
        alarmTimer = 0;
        return;
      }
      alarmTimer -= dt;
      if (alarmTimer <= 0) {
        tone(980, 0.12, 'square', 0.08);
        alarmTimer = 0.55;
      }
    },
  };
}
