// Keyboard and mouse input. Held keys give pitch, roll and throttle; one-shot
// presses (pause, camera, mute, restart, confirm) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost or doubled.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let lookX = 0;
  let lookY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CAMERA.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CAMERA;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      ROLL_LEFT.has(event.code) || ROLL_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)
    ) {
      held.add(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => held.clear());

  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    lookX += event.clientX - lastX;
    lookY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  const has = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    /** -1 (nose up) .. 1 (nose down) from pitch keys. */
    pitch() {
      return (has(PITCH_DOWN) ? 1 : 0) - (has(PITCH_UP) ? 1 : 0);
    },
    /** -1 (bank left) .. 1 (bank right) from roll keys. */
    roll() {
      return (has(ROLL_RIGHT) ? 1 : 0) - (has(ROLL_LEFT) ? 1 : 0);
    },
    /** -1 (throttle down) .. 1 (throttle up) from throttle keys. */
    throttle() {
      return (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
    },
    /** Mouse-drag look offset in pixels; the loop eases it back to zero. */
    look() {
      return { x: lookX, y: lookY };
    },
    decayLook(factor) {
      lookX *= factor;
      lookY *= factor;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
