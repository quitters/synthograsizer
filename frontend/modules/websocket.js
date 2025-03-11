/**
 * WebSocket service for real-time communication with the backend
 */
class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.messageCallbacks = new Map();
    this.connectionCallbacks = {
      onConnect: [],
      onDisconnect: []
    };
  }

  /**
   * Connect to the WebSocket server
   * @param {string} url - WebSocket server URL
   * @returns {Promise} - Resolves when connected, rejects on error
   */
  connect(url = 'ws://localhost:8000/ws') {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.connectionCallbacks.onConnect.forEach(callback => callback());
          resolve();
        };

        this.socket.onclose = (event) => {
          console.log('WebSocket disconnected', event);
          this.isConnected = false;
          this.connectionCallbacks.onDisconnect.forEach(callback => callback(event));
          this.attemptReconnect(url);
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (!this.isConnected) {
            reject(error);
          }
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type && this.messageCallbacks.has(message.type)) {
              this.messageCallbacks.get(message.type).forEach(callback => {
                callback(message.data || message);
              });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect to the WebSocket server
   * @param {string} url - WebSocket server URL
   */
  attemptReconnect(url) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
        this.connect(url).catch(() => {
          // Error handled in connect method
        });
      }, delay);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.socket && this.isConnected) {
      this.socket.close();
    }
  }

  /**
   * Send a message to the WebSocket server
   * @param {string} type - Message type
   * @param {object} data - Message data
   * @returns {boolean} - True if message was sent, false otherwise
   */
  send(type, data = {}) {
    if (!this.isConnected) {
      console.warn('Cannot send message, WebSocket not connected');
      return false;
    }

    try {
      const message = JSON.stringify({
        type,
        data
      });
      this.socket.send(message);
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  /**
   * Register a callback for a specific message type
   * @param {string} type - Message type
   * @param {function} callback - Callback function
   */
  on(type, callback) {
    if (!this.messageCallbacks.has(type)) {
      this.messageCallbacks.set(type, []);
    }
    this.messageCallbacks.get(type).push(callback);
  }

  /**
   * Remove a callback for a specific message type
   * @param {string} type - Message type
   * @param {function} callback - Callback function to remove
   */
  off(type, callback) {
    if (this.messageCallbacks.has(type)) {
      const callbacks = this.messageCallbacks.get(type);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Register a callback for connection events
   * @param {string} event - Event type ('connect' or 'disconnect')
   * @param {function} callback - Callback function
   */
  onConnection(event, callback) {
    if (event === 'connect') {
      this.connectionCallbacks.onConnect.push(callback);
    } else if (event === 'disconnect') {
      this.connectionCallbacks.onDisconnect.push(callback);
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();
export default websocketService;
