// Environment configuration for chat interface container
const CONFIG = {
  // For browser environment (when process is not available)
  getBrowserConfig: function() {
    // Try to get from window object if set by environment
    return {
      FRONTEND_URL: window.CHAT_CONFIG?.FRONTEND_URL || 'http://localhost:3000',
      AGENT_URL: window.CHAT_CONFIG?.AGENT_URL || 'http://localhost:3001',
      AGENT_EMBEDDED_URL: window.CHAT_CONFIG?.AGENT_EMBEDDED_URL || 'http://localhost:3001/embedded',
      AGENT_SCRIPT_URL: window.CHAT_CONFIG?.AGENT_SCRIPT_URL || 'http://localhost:3001/hiddenframe.js'
    };
  }
};

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}