import React, { useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Check, Undo2, ArrowRight, Eye, Sparkles, X, AlertOctagon, HelpCircle } from 'lucide-react';
import { api } from '../api';

export function HitlBatchModal({ isOpen, onClose, currentEvent, onBatchResumed }) {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Track IDs marked for discard vs rescued as keeper
  // Defaults to all candidates marked for discard
  const [rescuedIds, setRescuedIds] = useState(new Set());
  const [inspectedPhoto, setInspectedPhoto] = useState(null);

  useEffect(() => {
    if (isOpen && currentEvent) {
      loadPendingBatch();
    }
  }, [isOpen, currentEvent]);

  async function loadPendingBatch() {
    setLoading(true);
    try {
      const data = await api.getPendingBatch(currentEvent.event_id);
      setBatchData(data);
      setRescuedIds(new Set()); // Reset rescued for new batch
      if (data.items && data.items.length > 0) {
        setInspectedPhoto(data.items[0]);
      }
    } catch (err) {
      console.error("Failed to load pending batch:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleRescue(photoId) {
    setRescuedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }

  function handleRescueAll() {
    if (!batchData?.items) return;
    const all = new Set(batchData.items.map(p => p.photo_id));
    setRescuedIds(all);
  }

  function handleDiscardAll() {
    setRescuedIds(new Set());
  }

  async function handleResume() {
    if (!batchData?.items) return;
    setSubmitting(true);
    try {
      const items = batchData.items;
      const rescued = Array.from(rescuedIds);
      const confirmedDiscards = items.map(p => p.photo_id).filter(id => !rescuedIds.has(id));

      const res = await api.resumeHitlBatch(currentEvent.event_id, {
        confirmed_discards: confirmedDiscards,
        rescued_keepers: rescued,
      });

      onBatchResumed(res);
      if (!res.has_more_batches) {
        onClose();
      } else {
        // Load next batch
        await loadPendingBatch();
      }
    } catch (err) {
      alert(`Failed to resume culling workflow: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const items = batchData?.items || [];
  const batchNum = batchData?.batch_number || 1;
  const totalBatches = batchData?.total_batches || 1;
  const totalCandidates = batchData?.total_candidates || items.length;

  const discardCount = items.length - rescuedIds.size;
  const rescueCount = rescuedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-lg">
      <div className="glass-panel-elevated w-full max-w-7xl h-[92vh] flex flex-col bg-slate-950/95 border border-cyan-500/30 shadow-2xl shadow-cyan-950/50">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">
                  Human-in-the-Loop Review: Batch {batchNum} of {totalBatches}
                </h2>
                <span className="badge badge-hitl text-xs">
                  50-Photo Safety Slice
                </span>
              </div>
              <p className="text-xs text-slate-400">
                LangGraph workflow paused. Review AI discard recommendations before moving to .recycle_bin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5">
              <span className="text-rose-400 font-bold">{discardCount} Marked for Discard</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-bold">{rescueCount} Rescued Keepers</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split view (Grid Left + Inspector Right) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Photos Grid */}
          <div className="flex-1 flex flex-col p-4 overflow-hidden border-r border-white/10">
            {/* Quick Bulk Toolbar */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscardAll}
                  className="px-2.5 py-1 rounded bg-rose-950/40 text-rose-300 border border-rose-500/30 hover:bg-rose-900/50"
                >
                  Confirm All Discards
                </button>
                <button
                  onClick={handleRescueAll}
                  className="px-2.5 py-1 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50"
                >
                  Rescue All as Keepers
                </button>
              </div>
              <span className="text-slate-400 text-[11px]">
                Click photo card to inspect • Click checkbox to toggle rescue
              </span>
            </div>

            {/* Scrollable Grid */}
            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {loading ? (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <Sparkles className="w-8 h-8 text-cyan-400 animate-spin" />
                  <p className="text-sm">Loading 50-photo batch checkpoint...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="col-span-full text-center py-20 text-slate-400">
                  <Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-200">No candidates remaining in this batch.</p>
                </div>
              ) : (
                items.map((photo) => {
                  const isRescued = rescuedIds.has(photo.photo_id);
                  const isInspected = inspectedPhoto?.photo_id === photo.photo_id;
                  const defect = photo.defect_reason || 'low_aesthetic';

                  return (
                    <div
                      key={photo.photo_id}
                      onClick={() => setInspectedPhoto(photo)}
                      className={`photo-card relative group flex flex-col ${
                        isRescued ? 'selected-keeper' : 'selected-discard'
                      } ${isInspected ? 'ring-2 ring-cyan-400' : ''}`}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                        <img
                          src={photo.thumbnail_path ? `/storage/thumbnails/${photo.event_id}/${photo.photo_id}_thumb.jpg` : `/storage/uploads/${photo.event_id}/${photo.file_name}`}
                          alt={photo.file_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.target.src = `/storage/uploads/${photo.event_id}/${photo.file_name}`;
                          }}
                        />

                        {/* Defect Badge Overlay */}
                        <div className="absolute top-2 left-2 z-10">
                          {isRescued ? (
                            <span className="badge badge-keeper text-[10px]">
                              <Check className="w-3 h-3" /> Rescued
                            </span>
                          ) : (
                            <span className="badge badge-discard text-[10px]">
                              {defect === 'motion_blur' && 'Motion Blur'}
                              {defect === 'closed_eyes' && 'Closed Eyes'}
                              {defect === 'burst_redundancy' && 'Burst Dupe'}
                              {defect === 'bad_exposure' && 'Exposure Clip'}
                              {!['motion_blur', 'closed_eyes', 'burst_redundancy', 'bad_exposure'].includes(defect) && 'Low Score'}
                            </span>
                          )}
                        </div>

                        {/* Toggle Checkbox Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRescue(photo.photo_id);
                          }}
                          className={`absolute top-2 right-2 z-10 p-1.5 rounded-lg backdrop-blur-md transition-all ${
                            isRescued
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50'
                              : 'bg-black/60 text-slate-300 hover:text-white hover:bg-slate-800'
                          }`}
                          title={isRescued ? "Mark for Discard" : "Rescue Photo"}
                        >
                          {isRescued ? <Check className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Card Footer Info */}
                      <div className="p-2 bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5">
                        <span className="truncate font-mono">{photo.file_name}</span>
                        <span className="font-semibold text-slate-300">
                          {photo.assessment?.aesthetic_score ? `${photo.assessment.aesthetic_score}/10` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Side Inspector Drawer */}
          <div className="w-80 lg:w-96 p-5 overflow-y-auto bg-slate-900/70 flex flex-col justify-between">
            {inspectedPhoto ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <h3 className="text-sm font-bold text-slate-100 font-heading">AI Culling Inspector</h3>
                  <span className="font-mono text-xs text-indigo-400">{inspectedPhoto.photo_id}</span>
                </div>

                {/* Main Preview Image */}
                <div className="rounded-xl overflow-hidden aspect-[4/3] bg-black border border-white/10 relative shadow-inner">
                  <img
                    src={`/storage/uploads/${inspectedPhoto.event_id}/${inspectedPhoto.file_name}`}
                    alt="Inspection Preview"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Assessment Critique Box */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Aesthetic Rating:</span>
                    <span className="font-bold text-amber-300 text-sm">
                      {inspectedPhoto.assessment?.aesthetic_score || 5.0} / 10.0
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Eyes Open Confidence:</span>
                    <span className={`font-semibold ${
                      inspectedPhoto.assessment?.eyes_closed_detected ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      {inspectedPhoto.assessment?.eyes_open_confidence
                        ? `${Math.round(inspectedPhoto.assessment.eyes_open_confidence * 100)}%`
                        : 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Laplacian Blur Variance:</span>
                    <span className="font-mono text-slate-200">
                      {inspectedPhoto.laplacian_variance || inspectedPhoto.cv_metrics?.laplacian_variance || 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Subject Orientation:</span>
                    <span className="capitalize text-slate-200">
                      {inspectedPhoto.assessment?.subject_orientation?.replace('_', ' ') || 'Facing Camera'}
                    </span>
                  </div>

                  {/* Summary Verdict */}
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-slate-400 block mb-1 font-semibold">Studio Verdict:</span>
                    <p className="text-slate-300 leading-relaxed italic bg-slate-900/90 p-2 rounded border border-white/5">
                      "{inspectedPhoto.assessment?.summary_verdict || 'AI Evaluation completed.'}"
                    </p>
                  </div>
                </div>

                {/* Rescue / Discard Quick Action */}
                <button
                  onClick={() => toggleRescue(inspectedPhoto.photo_id)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    rescuedIds.has(inspectedPhoto.photo_id)
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                  }`}
                >
                  {rescuedIds.has(inspectedPhoto.photo_id) ? (
                    <>
                      <Check className="w-4 h-4" /> Photo Rescued as Keeper (Click to Discard)
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4" /> Rescue Photo to Keepers Pool
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 text-xs">
                Select a photo on the left to inspect detailed AI vision breakdown
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer: LangGraph Resume Execution Bar */}
        <div className="px-6 py-4 border-t border-white/10 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>
              Resuming will commit Batch {batchNum} ({discardCount} discards &rarr; .recycle_bin, {rescueCount} &rarr; approved).
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-xs"
            >
              Review Later
            </button>
            <button
              onClick={handleResume}
              disabled={submitting || items.length === 0}
              className="btn-primary !bg-gradient-to-r !from-cyan-500 !to-indigo-600 text-xs font-bold py-2.5 px-6 shadow-cyan-500/30 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Resuming LangGraph...
                </>
              ) : (
                <>
                  <span>Approve Decisions & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
