const { WebSocketServer, WebSocket } = require('ws');
const koffi = require('koffi');
const os = require('os');

const port = 8080;
const wss = new WebSocketServer({ port });
const rooms = new Map();

let driver = null;
if (os.platform() === 'win32') {
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

    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
        dx: 'long', dy: 'long', mouseData: 'uint32_t',
        dwFlags: 'uint32_t', time: 'uint32_t', dwExtraInfo: 'uintptr_t'
    });
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
        wVk: 'uint16_t', wScan: 'uint16_t', dwFlags: 'uint32_t',
        time: 'uint32_t', dwExtraInfo: 'uintptr_t'
    });
    const INPUT = koffi.struct('INPUT', {
        type: 'uint32_t',
        u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT })
    });
    const SendInput = user32.func('unsigned int __stdcall SendInput(unsigned int cInputs, INPUT *pInputs, int cbSize)');
    const SZ = koffi.sizeof(INPUT);

    driver = {
        move(dx, dy) {
            const pt = { x: 0, y: 0 };
            GetCursorPos(pt);
            SetCursorPos(pt.x + Math.round(dx), pt.y + Math.round(dy));
        },
        click() {
            SendInput(2, [
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTDOWN, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: 0, dwFlags: MOUSEEVENTF_LEFTUP, time: 0, dwExtraInfo: 0 } } }
            ], SZ);
        },
        scroll(delta) {
            const amount = Math.round(delta);
            SendInput(1, [
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: amount, dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } }
            ], SZ);
        },
        zoom(delta) {
            const amount = Math.round(delta);
            SendInput(3, [
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_MOUSE, u: { mi: { dx: 0, dy: 0, mouseData: amount, dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } } },
                { type: INPUT_KEYBOARD, u: { ki: { wVk: VK_CONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } }
            ], SZ);
        }
    };
}

console.log(`\n--- Rein Input-Aware Signaling Server ---`);
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
                return;
            }

            if (type === 'input') {
                if (driver) {
                    if (payload.type === 'move') driver.move(payload.dx, payload.dy);
                    else if (payload.type === 'click') driver.click();
                    else if (payload.type === 'scroll') driver.scroll(payload.delta);
                    else if (payload.type === 'zoom') driver.zoom(payload.delta);
                }
                return;
            }

            if (currentRoom && rooms.has(currentRoom)) {
                const recipients = rooms.get(currentRoom);
                recipients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'signal', payload }));
                    }
                });
            }
        } catch (err) { }
    });

    ws.on('close', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
        }
    });
});
