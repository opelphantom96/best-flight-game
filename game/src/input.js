// AURORA CARGO — input: keyboard + mouse. Arrow keys and Space never
// scroll the page. `pressed` holds keys hit once since the last read, for
// one-shot actions (Enter, P, R, M, L).

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mousePitch = 0; // -1 (nose down) .. +1 (nose up) from the mouse

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const my = (e.clientY - rect.top) / rect.height; // 0 top .. 1 bottom
    mousePitch = (0.5 - my) * 2; // mouse up = nose up
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);

  return {
    /** The live control state the world steps with. */
    read() {
      const turn =
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      return {
        throttleUp: keys.has('KeyW') || keys.has('ArrowUp'),
        throttleDown: keys.has('KeyS') || keys.has('ArrowDown'),
        turn,
        pitch: mousePitch * 0.42,
        brake: keys.has('Space'),
      };
    },
    pressed,
    wasPressed(code) {
      return pressed.has(code);
    },
    clearPressed() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
    },
  };
}
