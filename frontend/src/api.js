const API_BASE = '/api';

export const api = {
  // Events & Uploads
  async listEvents() {
    const res = await fetch(`${API_BASE}/upload/events`);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  async createEvent(data) {
    const res = await fetch(`${API_BASE}/upload/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create event');
    return res.json();
  },

  async getEventDetails(eventId) {
    const res = await fetch(`${API_BASE}/upload/${eventId}`);
    if (!res.ok) throw new Error('Failed to fetch event details');
    return res.json();
  },

  async generateDemoDataset(eventId, count = 55) {
    const res = await fetch(`${API_BASE}/upload/${eventId}/generate-demo-dataset?count=${count}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to generate demo dataset');
    return res.json();
  },

  async uploadPhotos(eventId, files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${API_BASE}/upload/${eventId}/photos`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload photos');
    return res.json();
  },

  // Culling Pipeline Orchestration
  async startCulling(eventId) {
    const res = await fetch(`${API_BASE}/culling/${eventId}/start`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to start culling pipeline');
    }
    return res.json();
  },

  async getCullingStatus(eventId) {
    const res = await fetch(`${API_BASE}/culling/${eventId}/status`);
    if (!res.ok) throw new Error('Failed to fetch culling status');
    return res.json();
  },

  async getCullingResults(eventId) {
    const res = await fetch(`${API_BASE}/culling/${eventId}/results`);
    if (!res.ok) throw new Error('Failed to fetch culling results');
    return res.json();
  },

  // HITL Batching Endpoints
  async getPendingBatch(eventId) {
    const res = await fetch(`${API_BASE}/hitl/${eventId}/pending-batch`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to fetch pending batch');
    }
    return res.json();
  },

  async resumeHitlBatch(eventId, decision) {
    const res = await fetch(`${API_BASE}/hitl/${eventId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to resume batch decision');
    }
    return res.json();
  },

  // Recycle Bin & Safe Recovery
  async listRecycleBin(eventId) {
    const res = await fetch(`${API_BASE}/recycle-bin/${eventId}`);
    if (!res.ok) throw new Error('Failed to fetch recycle bin items');
    return res.json();
  },

  async restorePhotos(eventId, photoIds) {
    const res = await fetch(`${API_BASE}/recycle-bin/${eventId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_ids: photoIds }),
    });
    if (!res.ok) throw new Error('Failed to restore photos');
    return res.json();
  },

  async purgeRecycleBin(eventId) {
    const res = await fetch(`${API_BASE}/recycle-bin/${eventId}/purge`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to purge recycle bin');
    return res.json();
  },

  // Health
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to fetch health');
    return res.json();
  },
};
