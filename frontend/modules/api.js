/**
 * API service for communicating with the backend
 */
import { store } from '../store';

class ApiService {
  constructor() {
    this.baseUrl = 'http://localhost:8000';
  }

  /**
   * Set the base URL for API requests
   * @param {string} url - Base URL
   */
  setBaseUrl(url) {
    this.baseUrl = url;
  }

  /**
   * Make a request to the API
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise} - Resolves with response data, rejects on error
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const fetchOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(url, fetchOptions);
      
      // Handle non-2xx responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `API error: ${response.status}`);
      }
      
      // Parse JSON response if content exists
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error(`API error (${endpoint}):`, error);
      
      // Show notification for API errors
      store.dispatch('notify', {
        type: 'error',
        message: `API Error: ${error.message}`,
        duration: 5000
      });
      
      throw error;
    }
  }

  /**
   * Make a GET request to the API
   * @param {string} endpoint - API endpoint
   * @param {object} params - Query parameters
   * @returns {Promise} - Resolves with response data
   */
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  /**
   * Make a POST request to the API
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body
   * @returns {Promise} - Resolves with response data
   */
  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a PUT request to the API
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body
   * @returns {Promise} - Resolves with response data
   */
  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make a DELETE request to the API
   * @param {string} endpoint - API endpoint
   * @returns {Promise} - Resolves with response data
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Specific API methods for Synthograsizer

  /**
   * Update a knob value
   * @param {number} knobId - Knob ID
   * @param {number} value - Knob value
   * @param {string} mode - Knob mode
   * @returns {Promise} - Resolves with updated knob
   */
  async updateKnob(knobId, value, mode) {
    return this.post('/knob/update', { knob_id: knobId, value, mode });
  }

  /**
   * Update the prompt
   * @param {object} prompt - Prompt object
   * @returns {Promise} - Resolves with updated prompt
   */
  async updatePrompt(prompt) {
    return this.post('/prompt/update', prompt);
  }

  /**
   * Save the current state
   * @param {string} filename - Filename to save state to
   * @returns {Promise} - Resolves with success message
   */
  async saveState(filename) {
    return this.post('/state/save', { filename });
  }

  /**
   * Load a saved state
   * @param {string} filename - Filename to load state from
   * @returns {Promise} - Resolves with success message
   */
  async loadState(filename) {
    return this.post('/state/load', { filename });
  }

  /**
   * Switch the current mode
   * @param {string} mode - New mode
   * @returns {Promise} - Resolves with success message
   */
  async switchMode(mode) {
    return this.post('/mode/switch', { mode });
  }

  /**
   * Get the current state
   * @returns {Promise} - Resolves with current state
   */
  async getState() {
    return this.get('/state');
  }

  /**
   * Create a variable group
   * @param {object} group - Variable group
   * @returns {Promise} - Resolves with created group
   */
  async createVariableGroup(group) {
    return this.post('/variable-group/create', group);
  }

  /**
   * Get all variable groups
   * @returns {Promise} - Resolves with all variable groups
   */
  async getVariableGroups() {
    return this.get('/variable-groups');
  }
}

// Create singleton instance
const apiService = new ApiService();
export default apiService;
