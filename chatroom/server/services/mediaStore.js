/**
 * Media Store - Tracks all generated media (images, future: videos)
 * Provides retrieval by ID and export functionality
 */

class MediaStore {
  constructor() {
    this.media = new Map();
    this.sessionId = null;
  }

  /**
   * Start a new session, optionally clearing previous media
   */
  startSession(sessionId, clearPrevious = true) {
    if (clearPrevious) {
      this.media.clear();
    }
    this.sessionId = sessionId;
  }

  /**
   * Add media to the store
   * @param {Object} mediaItem - Media item to store
   * @param {string} mediaItem.id - Unique ID
   * @param {string} mediaItem.type - 'image' or 'video'
   * @param {string} mediaItem.data - Base64 encoded data
   * @param {string} mediaItem.mimeType - MIME type
   * @param {string} mediaItem.prompt - Generation prompt
   * @param {string} mediaItem.agentId - ID of agent that generated it
   * @param {string} mediaItem.agentName - Name of agent
   * @param {string} [mediaItem.referenceIds] - IDs of reference images used
   */
  add(mediaItem) {
    const item = {
      ...mediaItem,
      createdAt: new Date().toISOString(),
      sessionId: this.sessionId
    };
    this.media.set(mediaItem.id, item);
    return item;
  }

  /**
   * Get media by ID
   */
  get(id) {
    return this.media.get(id);
  }

  /**
   * Get all media items
   */
  getAll() {
    return Array.from(this.media.values());
  }

  /**
   * Get all images
   */
  getAllImages() {
    return this.getAll().filter(m => m.type === 'image');
  }

  /**
   * Get all videos (for future use)
   */
  getAllVideos() {
    return this.getAll().filter(m => m.type === 'video');
  }

  /**
   * Get media count
   */
  count() {
    return this.media.size;
  }

  /**
   * Get images count
   */
  imageCount() {
    return this.getAllImages().length;
  }

  /**
   * Clear all media
   */
  clear() {
    this.media.clear();
  }

  /**
   * Export all media as an array suitable for ZIP creation
   * Returns array of {filename, data, mimeType}
   */
  exportForZip() {
    const exports = [];
    let imageIndex = 1;
    let videoIndex = 1;

    for (const item of this.media.values()) {
      let filename;
      let extension;

      // Determine file extension from MIME type
      switch (item.mimeType) {
        case 'image/png':
          extension = 'png';
          break;
        case 'image/jpeg':
          extension = 'jpg';
          break;
        case 'image/webp':
          extension = 'webp';
          break;
        case 'image/gif':
          extension = 'gif';
          break;
        case 'video/mp4':
          extension = 'mp4';
          break;
        case 'video/webm':
          extension = 'webm';
          break;
        default:
          extension = item.type === 'video' ? 'mp4' : 'png';
      }

      if (item.type === 'image') {
        filename = `image_${String(imageIndex).padStart(3, '0')}_${sanitizeFilename(item.prompt || 'generated')}.${extension}`;
        imageIndex++;
      } else if (item.type === 'video') {
        filename = `video_${String(videoIndex).padStart(3, '0')}_${sanitizeFilename(item.prompt || 'generated')}.${extension}`;
        videoIndex++;
      }

      exports.push({
        id: item.id,
        filename,
        data: item.data,
        mimeType: item.mimeType,
        prompt: item.prompt,
        agentName: item.agentName,
        createdAt: item.createdAt
      });
    }

    return exports;
  }

  /**
   * Get summary of stored media
   */
  getSummary() {
    const images = this.getAllImages();
    const videos = this.getAllVideos();

    return {
      totalCount: this.media.size,
      imageCount: images.length,
      videoCount: videos.length,
      sessionId: this.sessionId,
      items: this.getAll().map(m => ({
        id: m.id,
        type: m.type,
        prompt: m.prompt?.slice(0, 100),
        agentName: m.agentName,
        createdAt: m.createdAt
      }))
    };
  }
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

// Export singleton instance
export const mediaStore = new MediaStore();
