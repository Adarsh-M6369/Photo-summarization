import React, { useState, useEffect, useRef } from 'react';
import { api } from './api';
import { 
  Camera, 
  UploadCloud, 
  Sparkles, 
  Trash2, 
  RotateCcw, 
  Check, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Eye, 
  RefreshCw, 
  FolderPlus,
  AlertTriangle,
  Info
} from 'lucide-react';

export default function App() {
  // Wizard Step: 1 = Upload, 2 = Scanning, 3 = Final Decision
  const [currentStep, setCurrentStep] = useState(1);

  // Active Event & Files State
  const [eventId, setEventId] = useState(null);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [isSampleLoading, setIsSampleLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  // Step 2: Scan State
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessageIndex, setScanMessageIndex] = useState(0);
  const scanMessages = [
    "Checking image sharpness...",
    "Finding duplicate burst shots...",
    "Checking facial expressions...",
    "Evaluating lighting and exposure...",
    "Sorting keepers from discard candidates..."
  ];

  // Step 3: Photos & Decisions State
  const [photos, setPhotos] = useState([]); // List of photo objects
  const [decisions, setDecisions] = useState({}); // { [photo_id]: 'keep' | 'delete' }
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'keep' | 'delete'
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  // Recycle Bin Drawer State
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [recycleBinItems, setRecycleBinItems] = useState([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);

  // Cycle scan messages during Step 2
  useEffect(() => {
    let timer = null;
    if (currentStep === 2) {
      timer = setInterval(() => {
        setScanMessageIndex((prev) => (prev + 1) % scanMessages.length);
      }, 1800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentStep]);

  // Load Recycle Bin counts on load or when opened
  useEffect(() => {
    if (eventId) {
      loadRecycleBin(eventId);
    }
  }, [eventId, isRecycleBinOpen]);

  async function loadRecycleBin(targetEventId) {
    if (!targetEventId) return;
    setRecycleBinLoading(true);
    try {
      const data = await api.listRecycleBin(targetEventId);
      setRecycleBinItems(data.items || []);
    } catch (err) {
      console.error("Failed to load recycle bin:", err);
    } finally {
      setRecycleBinLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 1: FILE HANDLING & VALIDATION (Min 2, Max 100)
  // ---------------------------------------------------------------------------
  function handleFileSelection(files) {
    const validImageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    const combined = [...stagedFiles, ...validImageFiles];

    if (combined.length > 100) {
      setUploadError("Maximum 100 photos allowed per session. Truncated to 100.");
      const sliced = combined.slice(0, 100);
      setStagedFiles(sliced);
      generatePreviews(sliced);
    } else {
      setUploadError('');
      setStagedFiles(combined);
      generatePreviews(combined);
    }
  }

  function generatePreviews(files) {
    const previews = files.map((file, idx) => ({
      id: `${file.name}-${idx}-${Date.now()}`,
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2),
      url: URL.createObjectURL(file),
      file: file,
    }));
    setFilePreviews(previews);
  }

  function handleRemoveFile(indexToRemove) {
    const updated = stagedFiles.filter((_, idx) => idx !== indexToRemove);
    setStagedFiles(updated);
    generatePreviews(updated);
    if (updated.length < 2) {
      setUploadError("Please add at least 2 photos.");
    } else {
      setUploadError('');
    }
  }

  function handleClearAllFiles() {
    setStagedFiles([]);
    setFilePreviews([]);
    setUploadError('');
  }

  // 1-Click Sample Dataset (20 Photos)
  async function handleLoadSamplePhotos() {
    setIsSampleLoading(true);
    setUploadError('');
    try {
      const evtRes = await api.createEvent({
        title: "Wedding Shoot Session",
        client_name: "Sample Client",
        shoot_type: "Portrait & Wedding",
      });
      const newEvtId = evtRes.event_id;
      setEventId(newEvtId);

      // Generate 20 demo photos
      await api.generateDemoDataset(newEvtId, 20);

      // Transition to Step 2 Scan
      startAutomaticScan(newEvtId, 20);
    } catch (err) {
      setUploadError(`Failed to load sample dataset: ${err.message}`);
    } finally {
      setIsSampleLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: START ANALYSIS & AUTO-PROGRESS
  // ---------------------------------------------------------------------------
  async function handleStartAnalysis() {
    if (stagedFiles.length < 2) {
      setUploadError("Please add at least 2 photos before analyzing.");
      return;
    }
    if (stagedFiles.length > 100) {
      setUploadError("Maximum 100 photos allowed per session.");
      return;
    }

    try {
      // 1. Create Event
      const evtRes = await api.createEvent({
        title: `Shoot Session (${stagedFiles.length} Photos)`,
        client_name: "Studio Client",
        shoot_type: "Event Shoot",
      });
      const newEvtId = evtRes.event_id;
      setEventId(newEvtId);

      // 2. Upload Files
      await api.uploadPhotos(newEvtId, stagedFiles);

      // 3. Start Scan
      startAutomaticScan(newEvtId, stagedFiles.length);
    } catch (err) {
      setUploadError(`Upload failed: ${err.message}`);
    }
  }

  async function startAutomaticScan(targetEventId, totalCount) {
    setCurrentStep(2);
    setScanProgress(15);

    try {
      // Trigger backend culling pipeline
      await api.startCulling(targetEventId);

      // Poll progress smoothly
      let progress = 20;
      const interval = setInterval(async () => {
        progress = Math.min(progress + 15, 90);
        setScanProgress(progress);

        try {
          const status = await api.getCullingStatus(targetEventId);
          if (status.status === 'completed' || status.is_interrupted || progress >= 90) {
            clearInterval(interval);
            setScanProgress(100);

            // Fetch final results and transition to Step 3
            setTimeout(async () => {
              await loadStep3Results(targetEventId);
            }, 600);
          }
        } catch (e) {
          console.error("Status poll error:", e);
        }
      }, 1000);
    } catch (err) {
      console.error("Scan error:", err);
      // Fallback: load results anyway
      setTimeout(async () => {
        setScanProgress(100);
        await loadStep3Results(targetEventId);
      }, 2000);
    }
  }

  async function loadStep3Results(targetEventId) {
    try {
      const results = await api.getCullingResults(targetEventId);
      const keepers = results.keeper_candidates || [];
      const discards = results.discard_candidates || [];
      const combined = [...keepers, ...discards];

      // Build initial pre-selected decisions:
      // Keepers default to 'keep', Discard candidates default to 'delete'
      const initialDecisions = {};
      discards.forEach(p => { initialDecisions[p.photo_id] = 'delete'; });
      keepers.forEach(p => { initialDecisions[p.photo_id] = 'keep'; });

      setPhotos(combined);
      setDecisions(initialDecisions);
      setCurrentStep(3);
    } catch (err) {
      console.error("Failed to load results:", err);
      alert("Error loading photo analysis. Please retry.");
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3: FINAL DECISION TOGGLE & SAVE
  // ---------------------------------------------------------------------------
  function setPhotoDecision(photoId, decision) {
    setDecisions(prev => ({
      ...prev,
      [photoId]: decision,
    }));
  }

  async function handleSaveSelection() {
    if (!eventId || photos.length === 0) return;
    setIsSaving(true);
    setSaveSuccessMessage('');

    try {
      const toDelete = photos.filter(p => decisions[p.photo_id] === 'delete').map(p => p.photo_id);
      const toKeep = photos.filter(p => decisions[p.photo_id] === 'keep').map(p => p.photo_id);

      // Move deleted photos to recycle bin
      for (const pid of toDelete) {
        await fetch('/api/mcp/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: 'move_to_recycle_bin',
            arguments: {
              event_id: eventId,
              photo_id: pid,
              defect_reason: 'user_confirmed_discard',
            },
          }),
        });
      }

      // Restore/Keep approved photos
      if (toKeep.length > 0) {
        await api.restorePhotos(eventId, toKeep).catch(() => null);
      }

      // Refresh recycle bin count
      await loadRecycleBin(eventId);

      setSaveSuccessMessage(`Successfully saved! Moved ${toDelete.length} photos to the Recycle Bin. ${toKeep.length} photos kept in your gallery.`);
    } catch (err) {
      alert(`Save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // Restore Photo from Recycle Bin
  async function handleRestoreFromRecycleBin(photoId) {
    if (!eventId) return;
    try {
      await api.restorePhotos(eventId, [photoId]);
      // Update local decisions if in Step 3
      setDecisions(prev => ({ ...prev, [photoId]: 'keep' }));
      await loadRecycleBin(eventId);
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    }
  }

  async function handlePurgeRecycleBin() {
    if (!eventId) return;
    const confirm = window.confirm("Are you sure you want to permanently delete all photos in the Recycle Bin? This cannot be undone.");
    if (!confirm) return;

    try {
      await api.purgeRecycleBin(eventId);
      await loadRecycleBin(eventId);
    } catch (err) {
      alert(`Purge failed: ${err.message}`);
    }
  }

  function handleStartNewSession() {
    setCurrentStep(1);
    setStagedFiles([]);
    setFilePreviews([]);
    setPhotos([]);
    setDecisions({});
    setEventId(null);
    setUploadError('');
    setSaveSuccessMessage('');
  }

  // Decision counts for Step 3
  const keepingCount = photos.filter(p => decisions[p.photo_id] === 'keep').length;
  const deletingCount = photos.filter(p => decisions[p.photo_id] === 'delete').length;

  const filteredPhotos = photos.filter(p => {
    if (activeFilter === 'keep') return decisions[p.photo_id] === 'keep';
    if (activeFilter === 'delete') return decisions[p.photo_id] === 'delete';
    return true;
  });

  const isUploadValid = stagedFiles.length >= 2 && stagedFiles.length <= 100;

  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100 selection:bg-indigo-500 selection:text-white">
      
      {/* ========================================================================= */}
      {/* TOP HEADER & WIZARD STEP INDICATOR                                        */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#0d121f]/95 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-lg">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white font-heading tracking-tight">
              Lumina Photo Culling
            </h1>
            <p className="text-xs text-slate-400">
              Clean, automatic photo culling for photographers
            </p>
          </div>
        </div>

        {/* Wizard Step Progression Bar */}
        <div className="hidden md:flex items-center gap-3 bg-[#141b2d] px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold">
          <span className={`flex items-center gap-1.5 ${currentStep === 1 ? 'text-indigo-400 font-bold' : currentStep > 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 1 ? 'bg-indigo-600 text-white' : currentStep > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              1
            </span>
            Upload
          </span>

          <span className="text-slate-600">➔</span>

          <span className={`flex items-center gap-1.5 ${currentStep === 2 ? 'text-indigo-400 font-bold' : currentStep > 2 ? 'text-emerald-400' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 2 ? 'bg-indigo-600 text-white animate-pulse' : currentStep > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              2
            </span>
            Auto-Scan
          </span>

          <span className="text-slate-600">➔</span>

          <span className={`flex items-center gap-1.5 ${currentStep === 3 ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${currentStep === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              3
            </span>
            Final Decision
          </span>
        </div>

        {/* Recycle Bin Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRecycleBinOpen(true)}
            className="btn-secondary !py-2 !px-3.5 text-xs text-rose-300 border-rose-500/25 hover:border-rose-500/50 hover:bg-rose-950/30"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Recycle Bin ({recycleBinItems.length})</span>
          </button>

          {currentStep === 3 && (
            <button
              onClick={handleStartNewSession}
              className="btn-secondary !py-2 !px-3 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Session</span>
            </button>
          )}
        </div>
      </header>


      {/* ========================================================================= */}
      {/* STEP 1: UPLOAD PHOTOS (STRICT 2 TO 100 LIMIT)                             */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col justify-center animate-scale-up">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-white font-heading">Step 1: Upload Event Photos</h2>
            <p className="text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
              Select between 2 and 100 photos from your shoot to review.
            </p>
          </div>

          {/* Upload Card */}
          <div className="glass-panel-elevated p-8 space-y-6">
            
            {/* Quick 1-Click Sample Dataset Button */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-900/60 border border-indigo-500/30 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" /> Quick Demo Testing
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  No photos on hand? Instantly load 20 realistic event photos with blurs, bursts, and portraits.
                </p>
              </div>
              <button
                onClick={handleLoadSamplePhotos}
                disabled={isSampleLoading}
                className="btn-primary !py-2 !px-4 text-xs whitespace-nowrap"
              >
                {isSampleLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading 20 Photos...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Load 20 Sample Photos</span>
                  </>
                )}
              </button>
            </div>

            {/* Drag & Drop Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleFileSelection(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/70 hover:bg-indigo-950/20 rounded-2xl p-10 text-center cursor-pointer transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files) handleFileSelection(e.target.files);
                }}
                className="hidden"
              />
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                Drag and drop your photos here, or <span className="text-indigo-400 underline">browse files</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Accepted formats: JPG, PNG, WebP • Limits: 2 to 100 photos
              </p>
            </div>

            {/* Error Message */}
            {uploadError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Counter Chip & Clear All */}
            {stagedFiles.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Selected:</span>
                  <span className={`font-mono font-bold px-2.5 py-0.5 rounded-full ${
                    isUploadValid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {stagedFiles.length} / 100 photos
                  </span>
                  {!isUploadValid && stagedFiles.length < 2 && (
                    <span className="text-rose-400 text-xs">(Need at least 2 photos)</span>
                  )}
                </div>
                <button
                  onClick={handleClearAllFiles}
                  className="text-xs text-slate-400 hover:text-rose-300 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Thumbnail Preview Grid */}
            {filePreviews.length > 0 && (
              <div className="max-h-64 overflow-y-auto pr-1 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                {filePreviews.map((preview, idx) => (
                  <div key={preview.id} className="relative group aspect-square rounded-lg overflow-hidden bg-black border border-white/10">
                    <img src={preview.url} alt={preview.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:bg-rose-600 transition-colors"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Step 1 Action Button */}
            <div className="pt-4 border-t border-white/10">
              <button
                onClick={handleStartAnalysis}
                disabled={!isUploadValid}
                className="w-full btn-primary !py-3.5 text-sm font-bold flex items-center justify-center gap-2"
              >
                <span>Analyze Photos ({stagedFiles.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              {!isUploadValid && (
                <p className="text-center text-[11px] text-slate-500 mt-2">
                  Select between 2 and 100 photos to proceed to analysis.
                </p>
              )}
            </div>

          </div>
        </main>
      )}


      {/* ========================================================================= */}
      {/* STEP 2: AUTOMATIC SCANNING & QUALITY CHECK                                */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <main className="flex-1 max-w-xl w-full mx-auto p-6 flex flex-col justify-center items-center text-center animate-scale-up">
          <div className="glass-panel-elevated p-10 w-full space-y-8">
            
            {/* Animated Scanning Ring */}
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
              <div
                className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"
                style={{ animationDuration: '1.2s' }}
              />
              <Sparkles className="w-10 h-10 text-indigo-400 animate-pulse" />
            </div>

            {/* Header & Subtitle */}
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-white font-heading">Step 2: Checking Photo Quality</h2>
              <p className="text-xs text-slate-400">
                Please wait while we inspect focus, lighting, closed eyes, and duplicates.
              </p>
            </div>

            {/* Clean Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Analyzing batch photos...</span>
                <span className="text-indigo-400 font-bold">{scanProgress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>

            {/* Status Message Ticker (Clean natural language) */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 font-mono text-xs text-indigo-300 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{scanMessages[scanMessageIndex]}</span>
            </div>

            <p className="text-[11px] text-slate-500">
              The screen will automatically advance to Step 3 when finished.
            </p>
          </div>
        </main>
      )}


      {/* ========================================================================= */}
      {/* STEP 3: FINAL REVIEW & DECISION                                           */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28 animate-scale-up">
          
          {/* Header & Filter Chips */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-xl font-bold text-white font-heading">Step 3: Final Decision</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Review your photos below. The system has pre-sorted them, but you have the final say.
              </p>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 bg-[#141b2d] p-1 rounded-xl border border-white/10 text-xs">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  activeFilter === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Photos ({photos.length})
              </button>

              <button
                onClick={() => setActiveFilter('keep')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  activeFilter === 'keep' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Recommended to Keep ({keepingCount})
              </button>

              <button
                onClick={() => setActiveFilter('delete')}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
                  activeFilter === 'delete' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Recommended to Delete ({deletingCount})
              </button>
            </div>
          </div>

          {/* Success Notification if Saved */}
          {saveSuccessMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{saveSuccessMessage}</span>
              </div>
              <button
                onClick={() => setIsRecycleBinOpen(true)}
                className="text-xs text-white underline font-bold whitespace-nowrap"
              >
                Open Recycle Bin
              </button>
            </div>
          )}

          {/* Photo Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredPhotos.map((photo) => {
              const currentDecision = decisions[photo.photo_id] || 'keep';
              const isMarkedKeep = currentDecision === 'keep';
              const isMarkedDelete = currentDecision === 'delete';

              const assessment = photo.assessment || photo.vlm_assessment || {};
              const defect = photo.defect_reason;

              // Plain English badge labels
              let badgeLabel = "Good Shot";
              let badgeClass = "badge-good";

              if (defect === 'closed_eyes') {
                badgeLabel = "Eyes Closed";
                badgeClass = "badge-eyes";
              } else if (defect === 'motion_blur') {
                badgeLabel = "Blurry";
                badgeClass = "badge-blurry";
              } else if (defect === 'burst_redundancy') {
                badgeLabel = "Duplicate Shot";
                badgeClass = "badge-duplicate";
              } else if (defect === 'bad_exposure') {
                badgeLabel = "Poor Lighting";
                badgeClass = "badge-lighting";
              } else if (defect) {
                badgeLabel = "Low Quality";
                badgeClass = "badge-blurry";
              }

              return (
                <div
                  key={photo.photo_id}
                  className={`photo-card rounded-xl overflow-hidden flex flex-col transition-all ${
                    isMarkedKeep ? 'card-keep' : 'card-delete'
                  }`}
                >
                  {/* Photo Image */}
                  <div className="relative aspect-[4/3] bg-black overflow-hidden">
                    <img
                      src={`/storage/uploads/${eventId}/${photo.file_name}`}
                      alt={photo.file_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = `/storage/.recycle_bin/${eventId}/${photo.file_name}`;
                      }}
                    />

                    {/* Quality Badge Overlay */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-md ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Plain English Critique Text */}
                  <div className="p-2.5 bg-[#0a0e1a] flex-1 flex flex-col justify-between gap-2 text-xs border-t border-white/5">
                    <div>
                      <p className="font-mono text-slate-300 truncate text-[11px]">{photo.file_name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 italic">
                        {assessment.summary_verdict || (defect ? "Flagged for removal." : "Sharp and clear portrait.")}
                      </p>
                    </div>

                    {/* Explicit Two-Button Toggle: [ Keep ] / [ Delete ] */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        onClick={() => setPhotoDecision(photo.photo_id, 'keep')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                          isMarkedKeep
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/40 border border-emerald-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Keep</span>
                      </button>

                      <button
                        onClick={() => setPhotoDecision(photo.photo_id, 'delete')}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                          isMarkedDelete
                            ? 'bg-rose-600 text-white shadow-md shadow-rose-600/40 border border-rose-400'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Action Bar */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0d121f]/95 backdrop-blur-md border-t border-white/10 px-6 py-4 shadow-2xl">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Summary Counts */}
              <div className="flex items-center gap-4 text-xs font-semibold font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300">Keeping:</span>
                  <span className="font-bold text-emerald-400 text-sm">{keepingCount} photos</span>
                </div>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="text-slate-300">Moving to Trash:</span>
                  <span className="font-bold text-rose-400 text-sm">{deletingCount} photos</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveSelection}
                  disabled={isSaving || photos.length === 0}
                  className="btn-primary !bg-gradient-to-r !from-indigo-600 !to-rose-600 !py-3 !px-6 text-xs font-bold uppercase tracking-wider shadow-lg flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Decisions...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Move Deleted to Recycle Bin</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

        </main>
      )}


      {/* ========================================================================= */}
      {/* RECYCLE BIN DRAWER / MODAL                                                */}
      {/* ========================================================================= */}
      {isRecycleBinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="glass-panel-elevated w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#0d121f] border border-rose-500/30 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-heading">
                    Recycle Bin ({recycleBinItems.length} Photos)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Soft-deleted photos stay here. They will not be removed without confirmation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRecycleBinOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photos List / Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {recycleBinLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-rose-400" />
                  <span>Loading recycle bin...</span>
                </div>
              ) : recycleBinItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-xs">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold text-slate-200">Recycle Bin is Empty</p>
                  <p className="text-slate-500 mt-1">No soft-deleted photos currently staged.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {recycleBinItems.map((item) => (
                    <div key={item.photo_id} className="photo-card rounded-xl overflow-hidden flex flex-col border-rose-500/30">
                      <div className="aspect-[4/3] bg-black overflow-hidden relative">
                        <img
                          src={`/storage/.recycle_bin/${eventId || item.event_id}/${item.photo_id}.jpg`}
                          alt={item.photo_id}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = `/storage/uploads/${eventId || item.event_id}/${item.photo_id}.jpg`;
                          }}
                        />
                      </div>
                      <div className="p-2 bg-[#0a0e1a] flex flex-col gap-2">
                        <span className="font-mono text-slate-300 text-[11px] truncate">{item.photo_id}</span>
                        <button
                          onClick={() => handleRestoreFromRecycleBin(item.photo_id)}
                          className="btn-success !py-1 !px-2 text-[11px] font-bold w-full flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore Photo</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {recycleBinItems.length > 0 && (
              <div className="px-6 py-3.5 border-t border-white/10 bg-slate-950/80 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Total: {recycleBinItems.length} photos staged safely
                </span>
                <button
                  onClick={handlePurgeRecycleBin}
                  className="btn-danger !py-1.5 !px-3 text-xs"
                >
                  Permanently Empty Recycle Bin
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
