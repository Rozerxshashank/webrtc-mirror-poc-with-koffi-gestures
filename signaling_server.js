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
    const INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004, MOUSEEVENTF_WHEEL = 0x0800;
    const KEYEVENTF_KEYUP = 0x0002, VK_CONTROL = 0x11;
    const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
    const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
    const SetCursorPos = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', { dx: 'long', dy: 'long', mouseData: 'uint32_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', { wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t' });
    const INPUT = koffi.struct('INPUT', { type: 'uint32_t', u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT }) });
    const SendInput = user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');

    driver = {
        move(dx, dy) {
            const pt = { x: 0, y: 0 };
            GetCursorPos(pt);
            SetCursorPos(pt.x + Math.round(dx), pt.y + Math.round(dy));
        },
        click() {
            SendInput(2, [{ type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTDOWN, time: 0, dwExtraInfo: 0 } } }, { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTUP, time: 0, dwExtraInfo: 0 } } }], koffi.sizeof(INPUT));
        },
        scroll(delta) {
            SendInput(1, [{ type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: Math.round(delta), dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } }], koffi.sizeof(INPUT));
        },
        zoom(delta) {
            SendInput(3, [
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: Math.round(delta), dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } }
            ], koffi.sizeof(INPUT));
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

        const fd = open('/dev/uinput', 1 | 2048);
        if (fd >= 0) {
            [0, 1, 2].forEach(ev => ioctl_int(fd, 0x40045564, ev));
            [272, 29].forEach(key => ioctl_int(fd, 0x40045565, key));
            [0, 1, 8].forEach(rel => ioctl_int(fd, 0x40045566, rel));

            const setup = { id_bustype: 0x03, id_vendor: 0x1234, id_product: 0x5678, id_version: 1, name: Array.from('rein-webrtc-input').map(c => c.charCodeAt(0)).concat(new Array(62).fill(0)), ff_effects_max: 0 };
            ioctl_ptr(fd, 0x405c5503, setup);
            ioctl_int(fd, 0x5501, 0);

            const emit = (t, c, v) => write_event(fd, { tv_sec: 0, tv_usec: 0, type: t, code: c, value: v }, koffi.sizeof(input_event));
            driver = {
                move(dx, dy) { emit(2, 0, Math.round(dx)); emit(2, 1, Math.round(dy)); emit(0, 0, 0); },
                click() { emit(1, 272, 1); emit(0, 0, 0); emit(1, 272, 0); emit(0, 0, 0); },
                scroll(delta) { emit(2, 8, Math.round(delta / 10)); emit(0, 0, 0); },
                zoom(delta) { emit(1, 29, 1); emit(0, 0, 0); emit(2, 8, Math.round(delta / 10)); emit(0, 0, 0); emit(1, 29, 0); emit(0, 0, 0); }
            };
        }
    } catch (e) { console.log("Linux init failed:", e.message); }
} else if (platform === 'darwin') {
    try {
        const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
        const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
        const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
        const CGEventSourceCreate = cg.func('void* CGEventSourceCreate(int stateID)');
        const CGEventCreateMouseEvent = cg.func('void* CGEventCreateMouseEvent(void *source, int mouseType, CGPoint mouseCursorPosition, int mouseButton)');
        const CGEventCreateScrollWheelEvent = cg.func('void* CGEventCreateScrollWheelEvent(void *source, int units, uint32_t wheelCount, int32_t wheel1)');
        const CGEventPost = cg.func('void CGEventPost(int tap, void *event)');
        const CGEventSetFlags = cg.func('void CGEventSetFlags(void *event, uint64_t flags)');
        const CFRelease = cf.func('void CFRelease(void *cf)');
        const CGEventCreate = cg.func('void* CGEventCreate(void *source)');
        const CGEventGetLocation = cg.func('CGPoint CGEventGetLocation(void *event)');

        function getMousePos() {
            const ev = CGEventCreate(null);
            const pos = CGEventGetLocation(ev);
            CFRelease(ev);
            return pos;
        }

        const source = CGEventSourceCreate(0);
        const kCmdFlag = 0x00100000;

        driver = {
            move(dx, dy) {
                const pos = getMousePos();
                const target = { x: pos.x + dx, y: pos.y + dy };
                const ev = CGEventCreateMouseEvent(source, 5, target, 0);
                CGEventPost(0, ev); CFRelease(ev);
            },
            click() {
                const pos = getMousePos();
                const down = CGEventCreateMouseEvent(source, 1, pos, 0);
                const up = CGEventCreateMouseEvent(source, 2, pos, 0);
                CGEventPost(0, down); CFRelease(down);
                CGEventPost(0, up); CFRelease(up);
            },
            scroll(delta) {
                // Line units (1) for scrolling
                const ev = CGEventCreateScrollWheelEvent(source, 1, 1, Math.round(delta / 2) || (delta > 0 ? 1 : -1));
                CGEventPost(0, ev); CFRelease(ev);
            },
            zoom(delta) {
                // Use Line units (1) for Zoom too, but with Command flag
                const ev = CGEventCreateScrollWheelEvent(source, 1, 1, Math.round(delta / 2) || (delta > 0 ? 1 : -1));
                CGEventSetFlags(ev, kCmdFlag);
                CGEventPost(0, ev); CFRelease(ev);
            }
        };
        console.log("macOS CoreGraphics driver initialized.");
    } catch (e) { console.log("macOS init failed:", e.message); }
}

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
