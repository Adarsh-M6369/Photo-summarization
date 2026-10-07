import React, { useState } from 'react';
import { Calendar, User, FolderPlus, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { api } from '../api';

export function EventSelectorModal({ isOpen, onClose, onEventCreated, onSelectEvent, events = [] }) {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [shootType, setShootType] = useState('Wedding & Reception');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('create'); // 'create' | 'list'

  if (!isOpen) return null;

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const res = await api.createEvent({
        title,
        client_name: clientName,
        shoot_type: shootType,
        notes,
      });
      if (res.event) {
        onEventCreated(res.event);
        onClose();
      }
    } catch (err) {
      alert(`Failed to create event: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel-elevated w-full max-w-xl p-6 bg-slate-900/95 border border-white/10 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Event Session Management</h2>
              <p className="text-xs text-slate-400">Create a new photo session or switch active event</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-lg bg-slate-950/60 p-1 mb-6 border border-white/5">
          <button
            onClick={() => setTab('create')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'create' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create New Event
          </button>
          <button
            onClick={() => setTab('list')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              tab === 'list' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Switch Event ({events.length})
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Event Session Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Elena & Marcus Wedding Day"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Client / Couple Name</label>
                <input
                  type="text"
                  placeholder="e.g. Elena Vance"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="glass-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Shoot Type</label>
                <select
                  value={shootType}
                  onChange={(e) => setShootType(e.target.value)}
                  className="glass-input w-full text-sm bg-slate-900"
                >
                  <option value="Wedding & Reception">Wedding & Reception</option>
                  <option value="Corporate Gala & Portrait">Corporate Gala & Portrait</option>
                  <option value="Fashion & Editorial">Fashion & Editorial</option>
                  <option value="Sports & Action Burst">Sports & Action Burst</option>
                  <option value="Family Portrait Session">Family Portrait Session</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Studio Notes</label>
              <textarea
                rows={2}
                placeholder="Special instructions, VIP subject tags, key moments..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="glass-input w-full text-sm resize-none"
              />
            </div>

            <div className="pt-3 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={loading || !title.trim()} className="btn-primary text-xs">
                {loading ? 'Creating...' : 'Initialize Event'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8">No saved events found. Create your first session above!</p>
            ) : (
              events.map((evt) => (
                <div
                  key={evt.event_id}
                  onClick={() => {
                    onSelectEvent(evt);
                    onClose();
                  }}
                  className="glass-panel p-3.5 flex items-center justify-between hover:border-indigo-500/50 hover:bg-indigo-950/20 cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">{evt.title}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                      <User className="w-3 h-3 text-indigo-400" /> {evt.client_name || 'Client'}
                      <span>•</span>
                      <Calendar className="w-3 h-3 text-slate-400" /> {evt.event_date || 'Recent'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge badge-hitl text-[11px]">
                      {evt.photo_count || 0} photos
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
