const { WebSocketServer, WebSocket } = require('ws');
const koffi = require('koffi');
const os = require('os');
const fs = require('fs');

const port = 8080;
const wss = new WebSocketServer({ port });
const rooms = new Map();

let driver = null;
const platform = os.platform();

if (platform === 'win32') {
    const user32 = koffi.load('user32.dll');
    const INPUT_MOUSE = 0;
    const INPUT_KEYBOARD = 1;
    const MOUSEEVENTF_LEFTDOWN = 0x0002;
    const MOUSEEVENTF_LEFTUP = 0x0004;
    const MOUSEEVENTF_WHEEL = 0x0800;
    const KEYEVENTF_KEYUP = 0x0002;
    const VK_CONTROL = 0x11;

    const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
    const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
    const SetCursorPos = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', { dx: 'long', dy: 'long', mouseData: 'uint32_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', { wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
    const INPUT = koffi.struct('INPUT', { type: 'uint32_t', u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT }) });
    const SendInput = user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
    const SZ = koffi.sizeof(INPUT);

    driver = {
        move(dx, dy) {
            const pt = { x: 0, y: 0 };
            GetCursorPos(pt);
            SetCursorPos(pt.x + Math.round(dx), pt.y + Math.round(dy));
        },
        click() {
            SendInput(2, [{ type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTDOWN, time: 0, dwExtraInfo: 0 } } }, { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTUP, time: 0, dwExtraInfo: 0 } } }], SZ);
        },
        scroll(delta) {
            SendInput(1, [{ type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: Math.round(delta), dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } }], SZ);
        },
        zoom(delta) {
            SendInput(3, [
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: Math.round(delta), dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } }
            ], SZ);
        }
    };
} else if (platform === 'linux') {
    try {
        const libc = koffi.load('libc.so.6');
        const input_event = koffi.struct('input_event', { tv_sec: 'long', tv_usec: 'long', type: 'uint16_t', code: 'uint16_t', value: 'int32_t' });
        const uinput_setup = koffi.struct('uinput_setup', { id_bustype: 'uint16_t', id_vendor: 'uint16_t', id_product: 'uint16_t', id_version: 'uint16_t', name: koffi.array('char', 80), ff_effects_max: 'uint32_t' });
        const open = libc.func('int open(const char *path, int flags)');
        const ioctl_int = libc.func('int ioctl(int fd, unsigned long request, int value)');
        const ioctl_ptr = libc.func('int ioctl(int fd, unsigned long request, uinput_setup *arg)');
        const write_event = libc.func('intptr_t write(int fd, const input_event *buf, uintptr_t count)');

        const EV_SYN = 0, EV_KEY = 1, EV_REL = 2;
        const REL_X = 0, REL_Y = 1, REL_WHEEL = 8;
        const BTN_LEFT = 272, KEY_LEFTCTRL = 29;
        const UI_SET_EVBIT = 0x40045564, UI_SET_KEYBIT = 0x40045565, UI_SET_RELBIT = 0x40045566, UI_DEV_SETUP = 0x405c5503, UI_DEV_CREATE = 0x5501;

        const fd = open('/dev/uinput', 1 | 2048);
        if (fd >= 0) {
            ioctl_int(fd, UI_SET_EVBIT, EV_KEY);
            ioctl_int(fd, UI_SET_EVBIT, EV_REL);
            ioctl_int(fd, UI_SET_EVBIT, EV_SYN);
            ioctl_int(fd, UI_SET_KEYBIT, BTN_LEFT);
            ioctl_int(fd, UI_SET_KEYBIT, KEY_LEFTCTRL);
            ioctl_int(fd, UI_SET_RELBIT, REL_X);
            ioctl_int(fd, UI_SET_RELBIT, REL_Y);
            ioctl_int(fd, UI_SET_RELBIT, REL_WHEEL);

            const setup = { id_bustype: 0x03, id_vendor: 0x1234, id_product: 0x5678, id_version: 1, name: Array.from('rein-webrtc-input').map(c => c.charCodeAt(0)).concat(new Array(62).fill(0)), ff_effects_max: 0 };
            ioctl_ptr(fd, UI_DEV_SETUP, setup);
            ioctl_int(fd, UI_DEV_CREATE, 0);

            const emit = (t, c, v) => write_event(fd, { tv_sec: 0, tv_usec: 0, type: t, code: c, value: v }, koffi.sizeof(input_event));
            const syn = () => emit(EV_SYN, 0, 0);

            driver = {
                move(dx, dy) { emit(EV_REL, REL_X, Math.round(dx)); emit(EV_REL, REL_Y, Math.round(dy)); syn(); },
                click() { emit(EV_KEY, BTN_LEFT, 1); syn(); emit(EV_KEY, BTN_LEFT, 0); syn(); },
                scroll(delta) { emit(EV_REL, REL_WHEEL, Math.round(delta / 10)); syn(); },
                zoom(delta) {
                    emit(EV_KEY, KEY_LEFTCTRL, 1); syn();
                    emit(EV_REL, REL_WHEEL, Math.round(delta / 10)); syn();
                    emit(EV_KEY, KEY_LEFTCTRL, 0); syn();
                }
            };
            console.log("Linux uinput driver initialized.");
        }
    } catch (e) { console.log("Failed to init Linux driver:", e.message); }
}

console.log(`\n--- Rein Cross-Platform signaling Server ---`);
console.log(`Listening on ws://0.0.0.0:${port}\n`);

wss.on('connection', (ws) => {
    let currentRoom = null;
    ws.on('message', (data) => {
        try {
            const parsed = JSON.parse(data.toString());
            const { type, roomId, payload } = parsed;
            if (type === 'join') {
                currentRoom = roomId;
                if (!rooms.has(roomId)) rooms.set(roomId, new Set());
                rooms.get(roomId).add(ws);
            } else if (type === 'input' && driver) {
                if (payload.type === 'move') driver.move(payload.dx, payload.dy);
                else if (payload.type === 'click') driver.click();
                else if (payload.type === 'scroll') driver.scroll(payload.delta);
                else if (payload.type === 'zoom') driver.zoom(payload.delta);
            } else if (currentRoom && rooms.has(currentRoom)) {
                rooms.get(currentRoom).forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'signal', payload }));
                });
            }
        } catch (err) { }
    });
    ws.on('close', () => { if (currentRoom && rooms.has(currentRoom)) rooms.get(currentRoom).delete(ws); });
});
