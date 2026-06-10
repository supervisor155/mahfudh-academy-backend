/**
 * WebRTC Configuration — ICE servers for NAT traversal
 *
 * STUN: Discovers public IP address (free Google STUN servers)
 * TURN: Relays media when direct P2P fails (optional, requires paid service)
 */

module.exports = {
  iceServers: [
    // Google's free STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },

    // Optional: Add your own TURN server for better reliability
    // Recommended services: Twilio STUN/TURN, Xirsys, or self-hosted coturn
    // Example:
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: process.env.TURN_USERNAME,
    //   credential: process.env.TURN_CREDENTIAL
    // }
  ],
  iceTransportPolicy: 'all', // 'relay' to force TURN, 'all' to try STUN first
};
