// Detects "user is dragging something and taps the trigger key" anywhere in Windows.
// Polls GetAsyncKeyState through koffi (no hooks, no admin rights, nothing injected into other apps).
const { EventEmitter } = require('events');
const { screen } = require('electron');

const VK = { LBUTTON: 0x01, RBUTTON: 0x02, SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12 };
const SM_SWAPBUTTON = 23;
const DRAG_THRESHOLD = 6; // DIP the cursor must travel with the button held
const POLL_MS = 16;

class DragWatcher extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.key = VK.SHIFT;
    this.buttonDown = false;
    this.keyDown = false;
    this.dragging = false;
    this.origin = null;
    this.api = null;
  }

  loadApi() {
    if (this.api) return this.api;
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    this.api = {
      GetAsyncKeyState: user32.func('short __stdcall GetAsyncKeyState(int vKey)'),
      GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int nIndex)'),
    };
    return this.api;
  }

  setKey(name) {
    this.key = { shift: VK.SHIFT, ctrl: VK.CONTROL, alt: VK.MENU }[name] || VK.SHIFT;
    this.keyDown = true; // ignore a key that is already held when switching
  }

  start() {
    if (this.timer || process.platform !== 'win32') return;
    try {
      this.loadApi();
    } catch (err) {
      this.emit('error', err);
      return;
    }
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.buttonDown = this.dragging = false;
  }

  get running() {
    return !!this.timer;
  }

  isDown(vk) {
    return (this.api.GetAsyncKeyState(vk) & 0x8000) !== 0;
  }

  tick() {
    const primary = this.api.GetSystemMetrics(SM_SWAPBUTTON) ? VK.RBUTTON : VK.LBUTTON;
    const button = this.isDown(primary);
    const key = this.isDown(this.key);

    if (button && !this.buttonDown) {
      this.origin = screen.getCursorScreenPoint();
      this.dragging = false;
    }
    if (button && !this.dragging && this.origin) {
      const p = screen.getCursorScreenPoint();
      if (Math.hypot(p.x - this.origin.x, p.y - this.origin.y) >= DRAG_THRESHOLD) this.dragging = true;
    }
    if (key && !this.keyDown) {
      this.emit('key', { dragging: button && this.dragging, point: screen.getCursorScreenPoint() });
    }
    if (!button && this.buttonDown) {
      this.emit('release', { point: screen.getCursorScreenPoint(), wasDragging: this.dragging });
      this.dragging = false;
      this.origin = null;
    }
    this.buttonDown = button;
    this.keyDown = key;
  }
}

module.exports = new DragWatcher();
