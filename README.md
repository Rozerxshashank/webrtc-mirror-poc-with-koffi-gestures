# WebRTC Mirror PoC (with Gestures)

## Cross-Platform Support
- **Windows**: Works out of the box.
- **Linux (Wayland/X11)**: Supported via `uinput`.
- **macOS**: Supported via `CoreGraphics`.

## Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Linux Permissions (Required for Trackpad)**:
   On Linux, the signaling server needs permission to access `/dev/uinput` to simulate mouse movements.
   ```bash
   # Add your user to the input group
   sudo usermod -aG input $USER
   # Update udev rules
   echo 'KERNEL=="uinput", MODE="0660", GROUP="input"' | sudo tee /etc/udev/rules.d/99-uinput.rules
   # Restart udev
   sudo udevadm control --reload-rules && sudo udevadm trigger
   ```
   *Note: You may need to logout and login for group changes to take effect.*

3. **macOS / LAN Permissions**:
   - **Accessibility**: Grant Accessibility permissions to your terminal (Settings > Privacy & Security > Accessibility).
   - **Secure Context (Required)**: Browsers block screen sharing on insecure IPs. To test over LAN:
     1. Open Chrome and go to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
     2. Add your sender URL: `http://10.110.153.74:3000`
     3. Select **Enabled** and Relaunch.

## Run
1. **Start Signaling Server**:
   ```bash
   node signaling_server.js
   ```
2. **Start Static Server**:
   ```bash
   node serve.js
   ```
3. **Open Sender**: `http://localhost:3000/sender.html`
4. **Open Receiver**: `http://[YOUR_IP]:3000/receiver.html`
