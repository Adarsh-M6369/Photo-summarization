import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, AlertTriangle, FileText, Check, ShieldCheck, X, RefreshCw } from 'lucide-react';
import { api } from '../api';

export function RecycleBinExplorer({ isOpen, onClose, currentEvent, onItemRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [purging, setPurging] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [manifestData, setManifestData] = useState(null);

  useEffect(() => {
    if (isOpen && currentEvent) {
      loadRecycleBin();
    }
  }, [isOpen, currentEvent]);

  async function loadRecycleBin() {
    setLoading(true);
    try {
      const data = await api.listRecycleBin(currentEvent.event_id);
      setItems(data.items || []);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to load recycle bin:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(items.map(i => i.photo_id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleRestoreSelected() {
    if (selectedIds.size === 0) return;
    setRestoring(true);
    try {
      const ids = Array.from(selectedIds);
      await api.restorePhotos(currentEvent.event_id, ids);
      onItemRestored();
      await loadRecycleBin();
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  }

  async function handleRestoreSingle(photoId) {
    setRestoring(true);
    try {
      await api.restorePhotos(currentEvent.event_id, [photoId]);
      onItemRestored();
      await loadRecycleBin();
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  }

  async function handlePurge() {
    const confirm = window.confirm(
      "WARNING: This will permanently delete all photos currently in the .recycle_bin for this event. This action cannot be undone. Are you sure?"
    );
    if (!confirm) return;

    setPurging(true);
    try {
      await api.purgeRecycleBin(currentEvent.event_id);
      onItemRestored();
      await loadRecycleBin();
    } catch (err) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      setPurging(false);
    }
  }

  async function handleViewManifest() {
    try {
      const res = await fetch(`/api/recycle-bin/${currentEvent.event_id}/manifest`);
      const json = await res.json();
      setManifestData(json);
      setShowManifest(true);
    } catch (err) {
      alert(`Failed to fetch manifest: ${err.message}`);
    }
  }

  if (!isOpen || !currentEvent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-lg">
      <div className="glass-panel-elevated w-full max-w-6xl h-[88vh] flex flex-col bg-slate-950/95 border border-rose-500/30">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Staged Recycle Bin Explorer</h2>
                <span className="badge badge-discard text-xs">{items.length} Staged Discards</span>
              </div>
              <p className="text-xs text-slate-400">
                Safe staged storage directory (.recycle_bin/{currentEvent.event_id}/) with JSON audit manifest
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleViewManifest}
              className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> View JSON Manifest
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-slate-900/40 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={selectedIds.size === items.length ? deselectAll : selectAll}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              {selectedIds.size === items.length ? "Deselect All" : "Select All"}
            </button>
            <span className="text-slate-400">
              {selectedIds.size} of {items.length} selected
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRestoreSelected}
              disabled={selectedIds.size === 0 || restoring}
              className="btn-success !py-1.5 !px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restore Selected ({selectedIds.size})
            </button>
            <button
              onClick={handlePurge}
              disabled={items.length === 0 || purging}
              className="btn-danger !py-1.5 !px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Permanently Purge All
            </button>
          </div>
        </div>

        {/* Content Body Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 text-rose-400 animate-spin" />
              <p className="text-sm">Loading staged recycle bin items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ShieldCheck className="w-12 h-12 text-emerald-400 mb-3" />
              <h3 className="text-base font-bold text-slate-200">Recycle Bin is Empty</h3>
              <p className="text-xs text-slate-400 max-w-md mt-1">
                No discarded photos currently staged. Keepers are safely stored in the approved directory.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.photo_id);
                const defect = item.defect_reason || 'low_score';

                return (
                  <div
                    key={item.photo_id}
                    onClick={() => toggleSelect(item.photo_id)}
                    className={`photo-card flex flex-col ${
                      isSelected ? 'ring-2 ring-emerald-400 border-emerald-500' : 'border-slate-800'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                      <img
                        src={`/storage/.recycle_bin/${currentEvent.event_id}/${item.photo_id}.jpg`}
                        alt={item.photo_id}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = `/storage/uploads/${currentEvent.event_id}/${item.photo_id}.jpg`;
                        }}
                      />

                      {/* Defect badge */}
                      <div className="absolute top-2 left-2 z-10">
                        <span className="badge badge-discard text-[10px]">
                          {defect}
                        </span>
                      </div>

                      {/* Select checkbox */}
                      <div className={`absolute top-2 right-2 p-1 rounded-md backdrop-blur-md ${
                        isSelected ? 'bg-emerald-500 text-white' : 'bg-black/60 text-slate-400'
                      }`}>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900/90 flex flex-col justify-between flex-1 gap-2 text-xs border-t border-white/5">
                      <div>
                        <p className="font-mono text-[11px] text-slate-300 truncate">{item.photo_id}</p>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          Discarded: {item.discarded_at ? new Date(item.discarded_at).toLocaleTimeString() : 'Recent'}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreSingle(item.photo_id);
                        }}
                        className="w-full py-1 rounded bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-300 hover:border-emerald-500/40 text-[11px] text-slate-300 border border-white/5 flex items-center justify-center gap-1 transition-all"
                      >
                        <RotateCcw className="w-3 h-3 text-emerald-400" /> Restore Photo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* JSON Manifest Modal */}
        {showManifest && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="glass-panel-elevated w-full max-w-3xl max-h-[80vh] flex flex-col bg-slate-900 border border-white/10 p-6">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                <h3 className="text-sm font-bold text-white font-mono">Recycle Bin JSON Audit Manifest</h3>
                <button onClick={() => setShowManifest(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-lg font-mono text-xs text-indigo-300">
                <pre>{JSON.stringify(manifestData, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
