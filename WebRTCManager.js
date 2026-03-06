class WebRTCManager {
    constructor(role, roomId, onTrackCallback) {
        this.role = role;
        this.roomId = roomId;
        this.onTrackCallback = onTrackCallback;

        this.socket = null;
        this.pc = null;
        this.inputChannel = null;
        this.config = {
            iceServers: []
        };

        this.onConnectionStateChange = null;
        this.onStatusUpdate = null;
        this.onInputReceived = null;
    }

    async init() {
        this.log(`Initializing as ${this.role} for room: ${this.roomId}`);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${protocol}//${window.location.hostname}:8080`);

        this.socket.onopen = () => {
            this.log("Signaling connected.");
            this.socket.send(JSON.stringify({ type: 'join', roomId: this.roomId }));
            if (this.onStatusUpdate) this.onStatusUpdate("Connected.");
        };

        this.socket.onmessage = async (msg) => {
            const { type, payload } = JSON.parse(msg.data);
            if (type === 'signal') {
                await this.handleSignaling(payload);
            }
        };

        this.pc = new RTCPeerConnection(this.config);

        if (this.role === 'sender') {
            this.inputChannel = this.pc.createDataChannel("input", {
                ordered: false,
                maxRetransmits: 0
            });
            this.inputChannel.onmessage = (e) => {
                if (this.onInputReceived) this.onInputReceived(JSON.parse(e.data));
            };
        } else {
            this.pc.ondatachannel = (e) => {
                this.inputChannel = e.channel;
                this.log("DataChannel opened: " + e.channel.label);
            };
        }

        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.sendSignal({ candidate: e.candidate });
            }
        };

        this.pc.oniceconnectionstatechange = () => {
            if (this.onConnectionStateChange) this.onConnectionStateChange(this.pc.iceConnectionState);
        };

        if (this.role === 'receiver') {
            this.pc.ontrack = (e) => {
                if (this.onTrackCallback) this.onTrackCallback(e.streams[0]);
            };
        }
    }

    async startCapture() {
        if (this.role !== 'sender') return;

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always", frameRate: 60 },
                audio: false
            });

            stream.getTracks().forEach(track => this.pc.addTrack(track, stream));

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.sendSignal({ sdp: offer });

            return stream;
        } catch (err) {
            throw err;
        }
    }

    async handleSignaling(payload) {
        if (payload.sdp) {
            const description = new RTCSessionDescription(payload.sdp);
            await this.pc.setRemoteDescription(description);

            if (description.type === 'offer' && this.role === 'receiver') {
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.sendSignal({ sdp: answer });
            }
        } else if (payload.candidate) {
            await this.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
    }

    sendSignal(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'signal', roomId: this.roomId, payload }));
        }
    }

    sendInput(data) {
        if (this.inputChannel && this.inputChannel.readyState === "open") {
            this.inputChannel.send(JSON.stringify(data));
        }
    }

    log(msg) {
        console.log(`[WebRTC][${this.role.toUpperCase()}] ${msg}`);
    }
}
