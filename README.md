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

3. **macOS Permissions**:
   On macOS, you may need to grant **Accessibility** permissions to the terminal (e.g., Terminal or iTerm2) running the signaling server.

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
