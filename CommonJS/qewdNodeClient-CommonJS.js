const io = require('socket.io-client');

class QEWDNodeClient {
  constructor(host = 'http://localhost:8080', options = {}) {
    this.host = host;
    this.socket = null;
    this.token = null;
    this.jwt = options.jwt || false; // Optional JWT for authentication
    this.messageCallbacks = new Map();
    this.requestId = 0;
    this.application = options.application || 'hello-world'; // Default or passed in
  }

  handleResponse = (message) => {
    console.log('QEWDNodeClient: Received ewdjs message:', JSON.stringify(message, null, 2));
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QEWDNodeClient: Connection timeout - qewd-session-token not received within 10 seconds.'));
        if (this.socket) {
          this.socket.disconnect(); // Clean up socket if connection timed out
        }
      }, 10000); // 10-second timeout for connection and token

      this.socket = io(this.host, {
        transports: ['websocket'], // Force WebSocket
        query: {
          application: this.application
        },
        // It might be necessary to allow older server versions if QEWD's Socket.IO is very old.
        // However, ~2.4.0 client should be compatible with 2.x server.
        // allowEIO3: true, // Uncomment if you suspect EIO protocol mismatch with an older v2 server
      });

      this.socket.on('connect', (message) => {
        console.log('QEWDNodeClient: Socket connected to QEWD server. Sending ewd-register...',JSON.stringify(message, null, 2));
        // Send ewd-register message immediately upon connection
        this.socket.emit('ewdjs', {
          type: 'ewd-register',
          application: this.application,
          jwt: this.jwt
          // ajax: true // Temporarily removed for testing
        });
        // The promise will be resolved by the 'ewd-message' handler when 'ewd-register' response is received
      });

      // Remove the 'qewd-session-token' listener as the token comes via 'ewd-register' response
      // this.socket.on('qewd-session-token', (data) => { ... });
      
      this.socket.on('disconnect', (reason) => {
        clearTimeout(timeout); // Clear timeout if disconnect happens before token
        console.log('QEWDNodeClient: Disconnected from QEWD server:', reason);
        this.token = null; // Clear token on disconnect
        // Potentially reject pending operations or notify the client application
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('QEWDNodeClient: Connection Error:', error);
        reject(error);
      });

      this.socket.on('error', (error) => { // General error handler
        clearTimeout(timeout);
        console.error('QEWDNodeClient: Socket Error:', error);
        // Don't necessarily reject the main connect promise here unless it's a connection-fatal error
        // Individual operations might fail.
      });

      // Generic message handler from QEWD
      this.socket.on('ewdjs', (message) => {
        console.log('QEWDNodeClient: Received ewd-message:', JSON.stringify(message, null, 2));
        
        // Handle the response to 'ewd-register'
        if (message.type === 'ewd-register' && message.message && message.message.token) {
          clearTimeout(timeout); // Clear the connection timeout
          this.token = message.message.token;
          console.log('QEWDNodeClient: Session token received from ewd-register response:', this.token);
          resolve(); // Resolve the main connect() promise
          return; // Registration handled
        }

        let callbackObj;
        let messageTypeToMatch = message.type;

        // Check if the response is nested under a 'response' property
        // and if that nested response has a 'type' we are waiting for.
        if (message.response && message.response.type && this.messageCallbacks.has(message.response.type)) {
          messageTypeToMatch = message.response.type;
          callbackObj = this.messageCallbacks.get(messageTypeToMatch);
          if (callbackObj) {
            console.log(`QEWDNodeClient: Matched nested response for type ${messageTypeToMatch}`);
            callbackObj.resolve(message.response.message || message.response); // Use nested message
            this.messageCallbacks.delete(messageTypeToMatch);
          }
        } else if (this.messageCallbacks.has(messageTypeToMatch)) {
          // Standard direct message type match
          callbackObj = this.messageCallbacks.get(messageTypeToMatch);
          if (callbackObj) {
            console.log(`QEWDNodeClient: Matched direct message for type ${messageTypeToMatch}`);
            callbackObj.resolve(message.message || message); // Resolve with the payload
            this.messageCallbacks.delete(messageTypeToMatch);
          }
        } else if (message.type === 'ewd-error') {
            console.error('QEWDNodeClient: Received ewd-error:', message);
            // If there's a callback expecting an error or a generic error callback
            // This part might need refinement based on how you want to handle errors vs specific responses
        } else {
          console.log('QEWDNodeClient: Received unhandled ewd-message or no matching callback for type:', messageTypeToMatch);
        }
      });
    });
  }

  sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('QEWDNodeClient: Not connected to server.'));
      }

      const message = {
        type: type,
        params: payload,
        token: this.token,
        application: this.application, // Ensure application is part of the message
        ajax: true // Mimic qewd-client behavior
      };
      
      console.log('QEWDNodeClient: Sending message:', message);
      this.socket.emit('ewd-message', message);

      // Store callback for this message type (can be refined for unique request IDs)
      // For now, assuming one pending request per type, or use a unique identifier
      this.messageCallbacks.set(type, { resolve, reject, timestamp: Date.now() });

      // Timeout for the response
      setTimeout(() => {
        if (this.messageCallbacks.has(type)) {
          this.messageCallbacks.delete(type);
          reject(new Error(`QEWDNodeClient: Timeout waiting for response to message type "${type}"`));
        }
      }, 10000); // 10-second timeout
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('QEWDNodeClient: Disconnected.');
    }
  }
}

module.exports = QEWDNodeClient;
