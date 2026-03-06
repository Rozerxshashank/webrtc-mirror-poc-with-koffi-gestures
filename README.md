# WebRTC Mirror PoC (with Gestures)

## Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

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
