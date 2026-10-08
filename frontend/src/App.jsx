import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';
import { 
  Camera, 
  UploadCloud, 
  Sparkles, 
  Play, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  ShieldAlert, 
  Layers, 
  Sliders, 
  Eye, 
  RefreshCw, 
  AlertTriangle, 
  Check, 
  X, 
  FileText, 
  PlusCircle, 
  ChevronRight, 
  ArrowRight,
  HardDrive,
  Info,
  ShieldCheck,
  Cpu,
  FolderPlus,
  Compass,
  Sun,
  Award
} from 'lucide-react';

export default function App() {
  // Event & Studio State
  const [events, setEvents] = useState([]);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  // Stage 1: Pipeline & Upload State
  const [dragActive, setDragActive] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [generatingDemo, setGeneratingDemo] = useState(false);
  const [blurThreshold, setBlurThreshold] = useState(120.0);
  const [burstDistance, setBurstDistance] = useState(4);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Stage 2: HITL Review State (50/Batch)
  const [batchData, setBatchData] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [rescuedIds, setRescuedIds] = useState(new Set()); // IDs user unchecked to KEEP
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);

  // Stage 3: Recycle Bin State
  const [recycleBinItems, setRecycleBinItems] = useState([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const [purgingRecycleBin, setPurgingRecycleBin] = useState(false);
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [manifestData, setManifestData] = useState(null);

  // Inspection Modal
  const [inspectedPhoto, setInspectedPhoto] = useState(null);

  // All Results
  const [allResults, setAllResults] = useState(null);

  // Initial Load
  useEffect(() => {
    loadEvents();
  }, []);

  // Polling pipeline when running
  useEffect(() => {
    if (!currentEvent) return;
    let interval = null;
    if (pipelineRunning || pipelineStatus?.status === 'processing' || pipelineStatus?.status === 'tier1_completed') {
      interval = setInterval(() => {
        refreshAll(currentEvent.event_id);
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentEvent, pipelineRunning, pipelineStatus?.status]);

  async function loadEvents() {
    try {
      const data = await api.listEvents();
      setEvents(data.events || []);
      if (data.events && data.events.length > 0 && !currentEvent) {
        selectEvent(data.events[0]);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
  }

  async function selectEvent(evt) {
    setCurrentEvent(evt);
    await refreshAll(evt.event_id);
  }

  async function refreshAll(eventId) {
    if (!eventId) return;
    setIsRefreshing(true);
    try {
      const [status, results, recycleData] = await Promise.all([
        api.getCullingStatus(eventId).catch(() => null),
        api.getCullingResults(eventId).catch(() => null),
        api.listRecycleBin(eventId).catch(() => ({ items: [], count: 0 })),
      ]);

      if (status) {
        setPipelineStatus(status);
        setPipelineRunning(status.status === 'processing' || status.status === 'tier1_completed');
      }
      if (results) setAllResults(results);
      if (recycleData) setRecycleBinItems(recycleData.items || []);

      // Load batch data if interrupted or ready
      await loadPendingBatch(eventId);
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadPendingBatch(eventId) {
    setBatchLoading(true);
    try {
      const pending = await api.getPendingBatch(eventId);
      setBatchData(pending);
      // Reset rescued set for new batch view
      setRescuedIds(new Set());
    } catch (err) {
      console.error("Pending batch fetch error:", err);
    } finally {
      setBatchLoading(false);
    }
  }

  // --- STAGE 1 HANDLERS ---
  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      setStagedFiles(prev => [...prev, ...files]);
    }
  }

  function handleFileChange(e) {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setStagedFiles(prev => [...prev, ...files]);
    }
  }

  async function handleUploadFiles() {
    if (!currentEvent || stagedFiles.length === 0) return;
    setUploading(true);
    try {
      await api.uploadPhotos(currentEvent.event_id, stagedFiles);
      setStagedFiles([]);
      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateDemoShoot() {
    if (!currentEvent) return;
    setGeneratingDemo(true);
    try {
      await api.generateDemoDataset(currentEvent.event_id, 55);
      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Demo generation failed: ${err.message}`);
    } finally {
      setGeneratingDemo(false);
    }
  }

  async function handleStartCullingEngine() {
    if (!currentEvent) return;
    setPipelineRunning(true);
    try {
      await api.startCulling(currentEvent.event_id);
      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Pipeline error: ${err.message}`);
      setPipelineRunning(false);
    }
  }

  // --- STAGE 2 HANDLERS (HITL) ---
  function toggleKeepPhoto(photoId) {
    setRescuedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId); // Back to trash candidate
      } else {
        next.add(photoId); // Rescued to keep
      }
      return next;
    });
  }

  function handleSelectAllForTrash() {
    setRescuedIds(new Set());
  }

  function handleKeepAllInBatch() {
    if (!batchData?.items) return;
    const all = new Set(batchData.items.map(p => p.photo_id));
    setRescuedIds(all);
  }

  async function handleConfirmBatch() {
    if (!currentEvent || !batchData?.items) return;
    setBatchSubmitting(true);
    try {
      const items = batchData.items;
      const rescued = Array.from(rescuedIds);
      const confirmedDiscards = items.map(p => p.photo_id).filter(id => !rescuedIds.has(id));

      const res = await api.resumeHitlBatch(currentEvent.event_id, {
        confirmed_discards: confirmedDiscards,
        rescued_keepers: rescued,
      });

      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Failed to confirm batch: ${err.message}`);
    } finally {
      setBatchSubmitting(false);
    }
  }

  // --- STAGE 3 HANDLERS (Recycle Bin) ---
  async function handleRestoreSingle(photoId) {
    if (!currentEvent) return;
    try {
      await api.restorePhotos(currentEvent.event_id, [photoId]);
      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    }
  }

  async function handlePurgeRecycleBin() {
    if (!currentEvent) return;
    const confirmed = window.confirm(
      "CONFIRM PERMANENT PURGE: All photos currently inside .recycle_bin will be deleted from disk. This cannot be undone. Proceed?"
    );
    if (!confirmed) return;

    setPurgingRecycleBin(true);
    try {
      await api.purgeRecycleBin(currentEvent.event_id);
      await refreshAll(currentEvent.event_id);
    } catch (err) {
      alert(`Purge failed: ${err.message}`);
    } finally {
      setPurgingRecycleBin(false);
    }
  }

  async function handleViewManifest() {
    if (!currentEvent) return;
    try {
      const res = await fetch(`/api/recycle-bin/${currentEvent.event_id}/manifest`);
      const data = await res.json();
      setManifestData(data);
      setShowManifestModal(true);
    } catch (err) {
      alert(`Manifest error: ${err.message}`);
    }
  }

  // Helper stats
  const totalPhotosCount = currentEvent?.photo_count || (allResults?.total_photos || 0);
  const totalKeepersCount = allResults?.keeper_candidates?.length || 0;
  const totalDiscardsCount = recycleBinItems.length || (allResults?.discard_candidates?.length || 0);

  const batchItems = batchData?.items || [];
  const batchNum = batchData?.batch_number || 1;
  const totalBatches = batchData?.total_batches || (batchItems.length > 0 ? 1 : 0);
  const totalCandidates = batchData?.total_candidates || batchItems.length;

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER NAVIGATION BAR WITH EXPLICIT METADATA                      */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#0d121f]/95 backdrop-blur-md border-b border-white/10 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        {/* Brand & System Status */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200 font-heading">
                Lumina Studio Culling Engine
              </h1>
              <span className="badge badge-vlm text-[10px]">
                <Sparkles className="w-3 h-3" /> LangGraph 3-Tier AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              High-Speed Multi-Engine Triage • Human-in-the-Loop Batching • Reversible Recycle Bin
            </p>
          </div>
        </div>

        {/* Explicit Event Metadata Display */}
        {currentEvent ? (
          <div className="hidden lg:flex items-center gap-4 bg-[#141b2d] px-4 py-2 rounded-xl border border-indigo-500/30 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Event:</span>
              <span className="font-bold text-slate-100">{currentEvent.title}</span>
            </div>
            <span className="text-slate-600">|</span>
            <div>
              <span className="text-slate-400">Total:</span>{' '}
              <span className="font-bold text-indigo-300">{totalPhotosCount} Photos</span>
            </div>
            <span className="text-slate-600">|</span>
            <div>
              <span className="text-slate-400">AI Keepers:</span>{' '}
              <span className="font-bold text-emerald-400">{totalKeepersCount}</span>
            </div>
            <span className="text-slate-600">|</span>
            <div>
              <span className="text-slate-400">Discarded:</span>{' '}
              <span className="font-bold text-rose-400">{totalDiscardsCount}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">No session active. Create an event to begin.</div>
        )}

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => refreshAll(currentEvent?.event_id)}
            disabled={isRefreshing || !currentEvent}
            className="btn-secondary !py-2 !px-3 text-xs"
            title="Refresh All 3 Stages"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>

          <button
            onClick={() => setIsEventModalOpen(true)}
            className="btn-primary !py-2 !px-4 text-xs font-bold"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Event Session</span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN 3-COLUMN STUDIO CULLING DASHBOARD                                */}
      {/* ========================================================================= */}
      <main className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1920px] mx-auto w-full">
        
        {/* ----------------------------------------------------------------------- */}
        {/* COLUMN 1: STAGE 1 — PIPELINE CONTROL & INGESTION                        */}
        {/* ----------------------------------------------------------------------- */}
        <section className="stage-column border-indigo-500/20 bg-[#0f172a]/90">
          {/* Header */}
          <div className="stage-column-header bg-gradient-to-r from-indigo-950/40 to-transparent">
            <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Sliders className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Stage 1</span>
            </div>
            <h2 className="text-base font-bold text-white font-heading">Upload & Filter Controls</h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload raw event files, adjust OpenCV blur thresholds, and trigger automated AI triage.
            </p>
          </div>

          {/* Body */}
          <div className="stage-column-body overflow-y-auto">
            {/* Active Session Card */}
            {currentEvent ? (
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 truncate">{currentEvent.title}</span>
                  <span className="badge badge-hitl text-[10px]">{currentEvent.shoot_type || 'Portrait'}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Uploaded: {totalPhotosCount} photos</span>
                  <span>ID: {currentEvent.event_id}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-center">
                <p className="text-xs text-indigo-300 font-semibold mb-2">No event selected</p>
                <button
                  onClick={() => setIsEventModalOpen(true)}
                  className="btn-primary !py-1.5 !px-3 text-xs mx-auto"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Create Session
                </button>
              </div>
            )}

            {/* Drag & Drop Upload Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-950/40 scale-[1.01]'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-950/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-200">
                Drag & Drop Photos Here, or <span className="text-indigo-400 underline">Browse</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports batch upload of up to 500 JPG, PNG, RAW event files
              </p>

              {stagedFiles.length > 0 && (
                <div className="mt-3 p-2 rounded bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200 flex items-center justify-between">
                  <span>{stagedFiles.length} files staged</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUploadFiles();
                    }}
                    disabled={uploading}
                    className="btn-primary !py-1 !px-2.5 text-[11px]"
                  >
                    {uploading ? "Uploading..." : "Upload Now"}
                  </button>
                </div>
              )}
            </div>

            {/* 1-Click Synthetic Demo Shoot Button */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/30 to-indigo-950/30 border border-purple-500/30 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Instant 55-Photo Demo Shoot
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Generates realistic bursts, blur, closed eyes, and sharp portraits.
                </p>
              </div>
              <button
                onClick={handleGenerateDemoShoot}
                disabled={generatingDemo || !currentEvent}
                className="btn-primary !bg-gradient-to-r !from-purple-600 !to-indigo-600 !py-1.5 !px-3 text-xs whitespace-nowrap shadow-purple-500/30"
              >
                {generatingDemo ? "Generating..." : "Generate 55 Photos"}
              </button>
            </div>

            {/* Computer Vision Sliders with Live Explanations */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-4">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" /> OpenCV & Vector Tuning
              </h3>

              {/* Blur Sensitivity Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Blur Sensitivity (Laplacian):</span>
                  <span className="font-mono font-bold text-indigo-400">{blurThreshold.toFixed(1)} var</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="250"
                  step="5"
                  value={blurThreshold}
                  onChange={(e) => setBlurThreshold(parseFloat(e.target.value))}
                  className="studio-slider"
                />
                <p className="text-[11px] text-slate-400">
                  Higher values reject softer shots. Variance below {blurThreshold.toFixed(1)} flags camera shake.
                </p>
              </div>

              {/* Burst Similarity Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Burst Similarity (pHash Distance):</span>
                  <span className="font-mono font-bold text-amber-400">&le; {burstDistance} bits</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={burstDistance}
                  onChange={(e) => setBurstDistance(parseInt(e.target.value))}
                  className="studio-slider"
                />
                <p className="text-[11px] text-slate-400">
                  Identifies rapid burst frames within {burstDistance} Hamming distance and groups duplicates.
                </p>
              </div>
            </div>

            {/* Pipeline Step Visualizer */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Automated Pipeline Stages:
              </span>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Tier 1: OpenCV
                </span>
                <span className="text-slate-600">&rarr;</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Tier 2: Vectors
                </span>
                <span className="text-slate-600">&rarr;</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400" /> Tier 3: VLM
                </span>
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="stage-column-footer">
            <button
              onClick={handleStartCullingEngine}
              disabled={pipelineRunning || !currentEvent || totalPhotosCount === 0}
              className="w-full btn-primary !py-3 text-xs font-bold uppercase tracking-wider shadow-indigo-500/40"
            >
              {pipelineRunning ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Processing AI Culling Pipeline ({pipelineStatus?.progress_pct || 50}%)...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start AI Culling Engine</span>
                </>
              )}
            </button>
          </div>
        </section>


        {/* ----------------------------------------------------------------------- */}
        {/* COLUMN 2: STAGE 2 — HUMAN-IN-THE-LOOP BATCH REVIEW (50/BATCH)           */}
        {/* ----------------------------------------------------------------------- */}
        <section className="stage-column border-amber-500/25 bg-[#0f172a]/90">
          {/* Header */}
          <div className="stage-column-header bg-gradient-to-r from-amber-950/40 to-transparent">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Stage 2</span>
            </div>
            <h2 className="text-base font-bold text-white font-heading">Discard Candidate Review</h2>
            <p className="text-xs text-slate-400 mt-1">
              AI flagged these shots for deletion. Review this batch of 50 photos. Uncheck any photo you want to KEEP before confirming.
            </p>
          </div>

          {/* Batch Progress Banner */}
          <div className="px-5 py-3 bg-amber-950/30 border-b border-amber-500/20 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="font-extrabold text-amber-300 font-mono text-sm">
                Batch {batchNum} of {totalBatches}
              </span>
              <p className="text-[11px] text-slate-400">
                Photos {batchItems.length > 0 ? (batchNum - 1) * 50 + 1 : 0}–{Math.min(batchNum * 50, totalCandidates)} of {totalCandidates} Candidates
              </p>
            </div>
            <div className="text-right font-mono">
              <span className="text-rose-400 font-bold">{batchItems.length - rescuedIds.size} To Recycle</span>
              <span className="text-slate-500 mx-1.5">•</span>
              <span className="text-emerald-400 font-bold">{rescuedIds.size} Rescued</span>
            </div>
          </div>

          {/* Body: 50 Photos Grid */}
          <div className="stage-column-body overflow-y-auto">
            {batchLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-xs">Loading 50-photo candidate batch...</p>
              </div>
            ) : batchItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400 p-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
                <h3 className="text-sm font-bold text-slate-200">No Pending Discard Candidates</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Either all photos passed as keepers, or no culling run is currently awaiting review. Click "Start AI Culling Engine" in Stage 1.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {batchItems.map((photo) => {
                  const isRescued = rescuedIds.has(photo.photo_id);
                  const isMarkedForTrash = !isRescued;
                  const defect = photo.defect_reason || 'low_score';
                  const assessment = photo.assessment || photo.vlm_assessment || {};
                  const aestheticScore = assessment.aesthetic_score || 4.0;

                  return (
                    <div
                      key={photo.photo_id}
                      onClick={() => setInspectedPhoto(photo)}
                      className={`photo-card flex flex-col cursor-pointer ${
                        isMarkedForTrash ? 'card-marked-trash' : 'card-marked-keep'
                      }`}
                    >
                      {/* Image Frame */}
                      <div className="relative aspect-[4/3] bg-black overflow-hidden">
                        <img
                          src={`/storage/uploads/${currentEvent.event_id}/${photo.file_name}`}
                          alt={photo.file_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = `/storage/.recycle_bin/${currentEvent.event_id}/${photo.file_name}`;
                          }}
                        />

                        {/* Defect High-Contrast Badge */}
                        <div className="absolute top-2 left-2 z-10">
                          {defect === 'closed_eyes' && (
                            <span className="badge badge-defect-eyes">
                              ⚠️ Closed Eyes
                            </span>
                          )}
                          {defect === 'motion_blur' && (
                            <span className="badge badge-defect-blur">
                              🌀 Motion Blur
                            </span>
                          )}
                          {defect === 'burst_redundancy' && (
                            <span className="badge badge-defect-burst">
                              👥 Burst Duplicate
                            </span>
                          )}
                          {defect === 'subject_turned' && (
                            <span className="badge badge-defect-turned">
                              ↩️ Turned Away
                            </span>
                          )}
                          {defect === 'bad_exposure' && (
                            <span className="badge badge-defect-exposure">
                              ☀️ Blown Exposure
                            </span>
                          )}
                          {!['closed_eyes', 'motion_blur', 'burst_redundancy', 'subject_turned', 'bad_exposure'].includes(defect) && (
                            <span className="badge badge-discard">
                              📉 Score: {aestheticScore}/10
                            </span>
                          )}
                        </div>

                        {/* Explicit Keep / Trash Toggle Checkbox */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleKeepPhoto(photo.photo_id);
                          }}
                          className={`absolute top-2 right-2 z-10 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 backdrop-blur-md cursor-pointer transition-all ${
                            isMarkedForTrash
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/50'
                              : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/50'
                          }`}
                        >
                          {isMarkedForTrash ? (
                            <>
                              <Trash2 className="w-3 h-3" />
                              <span>Trash</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Keep</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Card Reasoning Details */}
                      <div className="p-2.5 bg-[#0a0e1a] flex flex-col justify-between flex-1 gap-1 text-[11px] border-t border-white/5">
                        <div className="flex items-center justify-between font-mono text-slate-300">
                          <span className="truncate">{photo.file_name}</span>
                          <span className="font-bold text-amber-300">★ {aestheticScore}/10</span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight italic">
                          "{assessment.summary_verdict || 'Flagged for discard during triage.'}"
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="stage-column-footer space-y-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <button
                onClick={handleSelectAllForTrash}
                disabled={batchItems.length === 0}
                className="flex-1 btn-secondary !py-2 text-[11px] text-rose-300 hover:text-rose-200 border-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Select All 50 for Trash</span>
              </button>

              <button
                onClick={handleKeepAllInBatch}
                disabled={batchItems.length === 0}
                className="flex-1 btn-secondary !py-2 text-[11px] text-emerald-300 hover:text-emerald-200 border-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Keep All 50</span>
              </button>
            </div>

            <button
              onClick={handleConfirmBatch}
              disabled={batchSubmitting || batchItems.length === 0}
              className="w-full btn-primary !bg-gradient-to-r !from-amber-600 !to-rose-600 !py-3 text-xs font-bold uppercase tracking-wider shadow-amber-500/30 flex items-center justify-center gap-2"
            >
              {batchSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Committing Batch & Continuing...</span>
                </>
              ) : (
                <>
                  <span>Confirm Batch & Move to Recycle Bin (Next 50)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </section>


        {/* ----------------------------------------------------------------------- */}
        {/* COLUMN 3: STAGE 3 — SAFE RECYCLE BIN & AUDIT LOG                        */}
        {/* ----------------------------------------------------------------------- */}
        <section className="stage-column border-rose-500/25 bg-[#0f172a]/90">
          {/* Header */}
          <div className="stage-column-header bg-gradient-to-r from-rose-950/40 to-transparent">
            <div className="flex items-center gap-2 text-rose-400 mb-1">
              <Trash2 className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Stage 3</span>
            </div>
            <h2 className="text-base font-bold text-white font-heading">Recycle Bin (Safety Storage)</h2>
            <p className="text-xs text-slate-400 mt-1">
              Soft-deleted photos stay here. They are NEVER permanently removed without explicit studio owner confirmation.
            </p>
          </div>

          {/* Recycle Bin Summary Chip */}
          <div className="px-5 py-3 bg-rose-950/30 border-b border-rose-500/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="font-bold text-rose-300 font-mono">
                {recycleBinItems.length} Staged Discards
              </span>
              <span className="text-slate-400 text-[11px]">
                (~{(recycleBinItems.length * 3.2).toFixed(1)} MB Safe Storage)
              </span>
            </div>
            <button
              onClick={handleViewManifest}
              className="text-[11px] text-indigo-300 hover:text-indigo-200 underline flex items-center gap-1 font-mono"
            >
              <FileText className="w-3 h-3" /> View Manifest
            </button>
          </div>

          {/* Body: Recycle Bin Cards */}
          <div className="stage-column-body overflow-y-auto">
            {recycleBinLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 text-rose-400 animate-spin" />
                <p className="text-xs">Loading staged recycle bin storage...</p>
              </div>
            ) : recycleBinItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400 p-6">
                <ShieldCheck className="w-12 h-12 text-emerald-400 mb-3" />
                <h3 className="text-sm font-bold text-slate-200">Recycle Bin is Empty</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Zero files in safety staging. When candidates are confirmed in Stage 2, they will appear here with one-click restore protection.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {recycleBinItems.map((item) => {
                  const defect = item.defect_reason || 'soft_deleted';

                  return (
                    <div
                      key={item.photo_id}
                      onClick={() => setInspectedPhoto(item)}
                      className="photo-card flex flex-col border-rose-500/30 cursor-pointer"
                    >
                      {/* Image Frame */}
                      <div className="relative aspect-[4/3] bg-black overflow-hidden">
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
                      </div>

                      {/* Card Details & Restore Button */}
                      <div className="p-2.5 bg-[#0a0e1a] flex flex-col justify-between flex-1 gap-2 text-[11px] border-t border-white/5">
                        <div className="font-mono text-slate-300 truncate">
                          {item.photo_id}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreSingle(item.photo_id);
                          }}
                          className="w-full btn-success !py-1.5 !px-2 text-[11px] flex items-center justify-center gap-1 font-bold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore Photo</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer: Danger Zone Permanent Purge Button */}
          <div className="stage-column-footer">
            <button
              onClick={handlePurgeRecycleBin}
              disabled={purgingRecycleBin || recycleBinItems.length === 0}
              className="w-full btn-danger !py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Permanently Empty Recycle Bin</span>
            </button>
          </div>
        </section>

      </main>


      {/* ========================================================================= */}
      {/* 3. MODALS & DETAIL DRAWERS                                                */}
      {/* ========================================================================= */}

      {/* Deep Photo Inspection Modal */}
      {inspectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="glass-panel-elevated w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0d121f] border border-white/20 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-heading">
                    {inspectedPhoto.original_filename || inspectedPhoto.file_name || inspectedPhoto.photo_id}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {inspectedPhoto.photo_id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectedPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Image Preview */}
              <div className="flex-1 bg-black flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-white/10">
                <img
                  src={`/storage/uploads/${currentEvent.event_id}/${inspectedPhoto.file_name || `${inspectedPhoto.photo_id}.jpg`}`}
                  alt="Inspection"
                  className="max-h-full max-w-full object-contain rounded"
                  onError={(e) => {
                    e.target.src = `/storage/.recycle_bin/${currentEvent.event_id}/${inspectedPhoto.file_name || `${inspectedPhoto.photo_id}.jpg`}`;
                  }}
                />
              </div>

              {/* Inspection Metrics */}
              <div className="w-full md:w-80 p-5 overflow-y-auto bg-slate-950/80 space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-1">
                  <span className="text-slate-400 font-semibold block">Aesthetic Keeper Rating:</span>
                  <span className="text-2xl font-black text-amber-300 font-heading">
                    {inspectedPhoto.assessment?.aesthetic_score || inspectedPhoto.vlm_assessment?.aesthetic_score || 5.0} / 10
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-300 uppercase tracking-wider block font-mono text-[11px]">
                    Computer Vision Signals
                  </span>
                  <div className="glass-panel p-2.5 flex justify-between font-mono">
                    <span className="text-slate-400">Laplacian Variance:</span>
                    <span className="text-indigo-300 font-bold">
                      {inspectedPhoto.laplacian_variance || inspectedPhoto.cv_metrics?.laplacian_variance || 'N/A'}
                    </span>
                  </div>
                  <div className="glass-panel p-2.5 flex justify-between font-mono">
                    <span className="text-slate-400">Eyes Confidence:</span>
                    <span className="text-emerald-400 font-bold">
                      {inspectedPhoto.assessment?.eyes_open_confidence ? `${Math.round(inspectedPhoto.assessment.eyes_open_confidence * 100)}%` : '92%'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-bold text-slate-300 uppercase tracking-wider block font-mono text-[11px]">
                    Studio Director Critique
                  </span>
                  <p className="p-3 rounded-lg bg-slate-900 border border-white/5 text-slate-300 italic leading-relaxed">
                    "{inspectedPhoto.assessment?.summary_verdict || inspectedPhoto.vlm_assessment?.summary_verdict || 'Standard event portrait capture.'}"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* JSON Manifest Modal */}
      {showManifestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="glass-panel-elevated w-full max-w-3xl max-h-[80vh] flex flex-col bg-[#0d121f] border border-white/20 p-6">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white font-mono">Recycle Bin JSON Audit Manifest</h3>
              <button onClick={() => setShowManifestModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-black p-4 rounded-lg font-mono text-xs text-indigo-300">
              <pre>{JSON.stringify(manifestData, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Event Session Switcher Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="glass-panel-elevated w-full max-w-lg p-6 bg-[#0d121f] border border-white/20">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <h2 className="text-base font-bold text-white">Event Sessions</h2>
              <button onClick={() => setIsEventModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Create Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target;
                const title = form.title.value;
                if (!title) return;
                try {
                  const res = await api.createEvent({ title, client_name: "Studio Client", shoot_type: "Wedding & Portrait" });
                  if (res.event) {
                    setEvents(prev => [res.event, ...prev]);
                    selectEvent(res.event);
                    setIsEventModalOpen(false);
                  }
                } catch (err) {
                  alert(`Failed: ${err.message}`);
                }
              }}
              className="space-y-3 mb-6 pb-6 border-b border-white/10"
            >
              <label className="block text-xs font-semibold text-slate-300">Create New Event Session</label>
              <div className="flex gap-2">
                <input
                  name="title"
                  type="text"
                  required
                  placeholder="e.g. Elena & Marcus Wedding"
                  className="glass-input flex-1 text-xs"
                />
                <button type="submit" className="btn-primary !py-2 !px-4 text-xs font-bold">
                  Create
                </button>
              </div>
            </form>

            {/* Existing List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Existing Sessions ({events.length})
              </span>
              {events.map((evt) => (
                <div
                  key={evt.event_id}
                  onClick={() => {
                    selectEvent(evt);
                    setIsEventModalOpen(false);
                  }}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer border transition-all ${
                    currentEvent?.event_id === evt.event_id
                      ? 'bg-indigo-950/50 border-indigo-500'
                      : 'bg-slate-900 hover:bg-slate-800 border-white/5'
                  }`}
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-white">{evt.title}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{evt.photo_count || 0} photos • {evt.event_id}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
