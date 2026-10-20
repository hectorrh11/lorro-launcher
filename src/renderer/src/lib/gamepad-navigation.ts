const DEADZONE = 0.5;
const REPEAT_MS = 180;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[role="button"]';

const isEditable = (element: Element | null) => {
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const dispatchKey = (key: string) => {
  const init: KeyboardEventInit = { key, bubbles: true, cancelable: true };
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", init)
  );
  window.dispatchEvent(new KeyboardEvent("keydown", init));
};

const focusables = () =>
  Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const styles = getComputedStyle(element);
      return styles.visibility !== "hidden" && styles.display !== "none";
    }
  );

const moveFocus = (direction: 1 | -1) => {
  const items = focusables();
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    current === -1
      ? direction === 1
        ? 0
        : items.length - 1
      : (current + direction + items.length) % items.length;
  items[next].focus({ preventScroll: true });
  items[next].scrollIntoView({ block: "nearest", behavior: "smooth" });
};

const activateFocused = () => {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) {
    dispatchKey("Enter");
    return;
  }
  if (isEditable(element)) {
    dispatchKey("Enter");
    return;
  }
  element.click();
};

export function installGamepadNavigation() {
  if (!window.location.hash.startsWith("#/big-picture")) return;

  const held = new Set<number>();
  let lastRepeat = 0;
  let frame = 0;

  const handleButton = (index: number) => {
    switch (index) {
      case 0:
        activateFocused();
        break;
      case 1:
        dispatchKey("Escape");
        break;
      case 4:
        moveFocus(-1);
        break;
      case 5:
        moveFocus(1);
        break;
      case 9:
        dispatchKey("Escape");
        break;
      case 12:
      case 14:
        moveFocus(-1);
        break;
      case 13:
      case 15:
        moveFocus(1);
        break;
      default:
        break;
    }
  };

  const tick = (time: number) => {
    const pad = navigator.getGamepads?.().find(Boolean) ?? null;
    if (pad) {
      pad.buttons.forEach((button, index) => {
        if (button.pressed) {
          if (!held.has(index)) {
            held.add(index);
            handleButton(index);
          }
        } else {
          held.delete(index);
        }
      });

      if (time - lastRepeat >= REPEAT_MS) {
        const axisX = pad.axes[0] ?? 0;
        const axisY = pad.axes[1] ?? 0;
        if (Math.abs(axisX) > DEADZONE || Math.abs(axisY) > DEADZONE) {
          moveFocus(axisX > DEADZONE || axisY > DEADZONE ? 1 : -1);
          lastRepeat = time;
        }
      }
    } else {
      held.clear();
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);

  const onDisconnect = () => held.clear();
  window.addEventListener("gamepaddisconnected", onDisconnect);

  window.addEventListener(
    "beforeunload",
    () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    },
    { once: true }
  );
}
