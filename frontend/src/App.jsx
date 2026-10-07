import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { EventSelectorModal } from './components/EventSelector';
import { UploadModal } from './components/UploadModal';
import { PipelineTracker } from './components/PipelineTracker';
import { HitlBatchModal } from './components/HitlBatchModal';
import { RecycleBinExplorer } from './components/RecycleBinExplorer';
import { PhotoInspectorModal } from './components/PhotoInspector';
import { BurstClusterView } from './components/BurstClusterView';
import { api } from './api';

import { 
  CheckCircle2, 
  Trash2, 
  Image as ImageIcon, 
  Layers, 
  Search, 
  SlidersHorizontal, 
  Eye, 
  Sparkles,
  ArrowUpDown,
  Filter,
  Check,
  AlertCircle
} from 'lucide-react';

export default function App() {
  const [events, setEvents] = useState([]);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);
  const [recycleBinCount, setRecycleBinCount] = useState(0);

  // Photos & Analysis results
  const [resultsData, setResultsData] = useState(null);
  const [activeTab, setActiveTab] = useState('keepers'); // 'keepers' | 'discards' | 'all' | 'bursts'
  const [searchQuery, setSearchQuery] = useState('');
  const [defectFilter, setDefectFilter] = useState('all');
  const [sortBy, setSortBy] = useState('aesthetic'); // 'aesthetic' | 'sharpness' | 'filename'

  // Modals & Drawers
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isHitlModalOpen, setIsHitlModalOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [inspectedPhoto, setInspectedPhoto] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initial Load
  useEffect(() => {
    loadEvents();
  }, []);

  // Poll status when pipeline is running
  useEffect(() => {
    if (!currentEvent) return;

    let interval = null;
    if (pipelineStatus?.status === 'processing' || pipelineStatus?.status === 'tier1_completed') {
      interval = setInterval(() => {
        checkStatus(currentEvent.event_id);
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentEvent, pipelineStatus?.status]);

  async function loadEvents() {
    try {
      const data = await api.listEvents();
      setEvents(data.events || []);
      if (data.events && data.events.length > 0 && !currentEvent) {
        selectEvent(data.events[0]);
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    }
  }

  async function selectEvent(evt) {
    setCurrentEvent(evt);
    await checkStatus(evt.event_id);
    await loadResults(evt.event_id);
    await loadRecycleCount(evt.event_id);
  }

  async function checkStatus(eventId) {
    try {
      const status = await api.getCullingStatus(eventId);
      setPipelineStatus(status);
      if (status.is_interrupted) {
        // Open HITL Review automatically if paused for approval
        setIsHitlModalOpen(true);
      }
    } catch (err) {
      console.error("Status check failed:", err);
    }
  }

  async function loadResults(eventId) {
    try {
      const res = await api.getCullingResults(eventId);
      setResultsData(res);
    } catch (err) {
      console.error("Failed to load culling results:", err);
    }
  }

  async function loadRecycleCount(eventId) {
    try {
      const data = await api.listRecycleBin(eventId);
      setRecycleBinCount(data.count || 0);
    } catch (err) {
      console.error("Recycle bin count error:", err);
    }
  }

  async function handleStartCulling() {
    if (!currentEvent) return;
    setIsStartingPipeline(true);
    try {
      await api.startCulling(currentEvent.event_id);
      await checkStatus(currentEvent.event_id);
    } catch (err) {
      alert(`Failed to start culling: ${err.message}`);
    } finally {
      setIsStartingPipeline(false);
    }
  }

  async function handleRefresh() {
    if (!currentEvent) return;
    setIsRefreshing(true);
    await Promise.all([
      checkStatus(currentEvent.event_id),
      loadResults(currentEvent.event_id),
      loadRecycleCount(currentEvent.event_id),
    ]);
    setIsRefreshing(false);
  }

  // Filter and sort photos
  const rawKeepers = resultsData?.keeper_candidates || [];
  const rawDiscards = resultsData?.discard_candidates || [];
  const allPhotos = [...rawKeepers, ...rawDiscards];

  function getDisplayPhotos() {
    let source = [];
    if (activeTab === 'keepers') source = rawKeepers;
    else if (activeTab === 'discards') source = rawDiscards;
    else if (activeTab === 'all') source = allPhotos;

    return source
      .filter((p) => {
        if (searchQuery) {
          const name = p.original_filename || p.file_name || '';
          if (!name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        }
        if (defectFilter !== 'all') {
          if (p.defect_reason !== defectFilter) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const scoreA = a.assessment?.aesthetic_score || a.aesthetic_score || 0;
        const scoreB = b.assessment?.aesthetic_score || b.aesthetic_score || 0;
        if (sortBy === 'aesthetic') return scoreB - scoreA;
        if (sortBy === 'sharpness') {
          const sA = a.laplacian_variance || 0;
          const sB = b.laplacian_variance || 0;
          return sB - sA;
        }
        return (a.file_name || '').localeCompare(b.file_name || '');
      });
  }

  const displayPhotos = getDisplayPhotos();

  return (
    <div className="min-h-screen pb-16">
      {/* Top Brand Header */}
      <Header
        currentEvent={currentEvent}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenNewEvent={() => setIsEventModalOpen(true)}
        onOpenRecycleBin={() => setIsRecycleBinOpen(true)}
        recycleBinCount={recycleBinCount}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* If no event created yet */}
        {!currentEvent ? (
          <div className="glass-panel-elevated p-12 text-center my-12 max-w-xl mx-auto border-indigo-500/30">
            <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-pulse-glow" />
            <h2 className="text-2xl font-bold text-white mb-2 font-heading">Welcome to LuminaCull Studio</h2>
            <p className="text-sm text-slate-400 mb-6">
              Automated high-speed 3-tier event culling with OpenCV blur filtering, vector pose clustering, and VLM facial validation.
            </p>
            <button
              onClick={() => setIsEventModalOpen(true)}
              className="btn-primary mx-auto text-sm"
            >
              Create First Event Session
            </button>
          </div>
        ) : (
          <>
            {/* Multi-Tier Culling Orchestration & HITL Tracker */}
            <PipelineTracker
              statusData={pipelineStatus}
              onStartCulling={handleStartCulling}
              isStarting={isStartingPipeline}
              onOpenHitlBatch={() => setIsHitlModalOpen(true)}
              totalPhotos={currentEvent.photo_count || allPhotos.length}
            />

            {/* Gallery Controls & Tab Navigation */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
              {/* Tab Pills */}
              <div className="flex items-center rounded-xl bg-slate-900/80 p-1 border border-white/5">
                <button
                  onClick={() => setActiveTab('keepers')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'keepers'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Keepers ({rawKeepers.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('discards')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'discards'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Discards ({rawDiscards.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('bursts')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'bursts'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Burst Sequences ({resultsData?.burst_clusters?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'all'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>All Uploads ({allPhotos.length})</span>
                </button>
              </div>

              {/* Search & Filters */}
              {activeTab !== 'bursts' && (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search photo filename..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="glass-input !py-1.5 !pl-9 text-xs w-48 bg-slate-900/90"
                    />
                  </div>

                  {/* Defect Filter */}
                  {activeTab === 'discards' && (
                    <select
                      value={defectFilter}
                      onChange={(e) => setDefectFilter(e.target.value)}
                      className="glass-input !py-1.5 text-xs bg-slate-900 text-slate-200"
                    >
                      <option value="all">All Defects</option>
                      <option value="motion_blur">Motion Blur</option>
                      <option value="closed_eyes">Eyes Closed</option>
                      <option value="burst_redundancy">Burst Duplicate</option>
                      <option value="bad_exposure">Bad Exposure</option>
                      <option value="low_aesthetic_quality">Low Aesthetic</option>
                    </select>
                  )}

                  {/* Sort By */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="glass-input !py-1.5 text-xs bg-slate-900 text-slate-200"
                  >
                    <option value="aesthetic">Sort: Aesthetic Score</option>
                    <option value="sharpness">Sort: Laplacian Sharpness</option>
                    <option value="filename">Sort: Filename</option>
                  </select>
                </div>
              )}
            </div>

            {/* Gallery Grid or Burst View */}
            {activeTab === 'bursts' ? (
              <BurstClusterView
                clusters={resultsData?.burst_clusters || []}
                allPhotos={allPhotos}
                onInspectPhoto={(photo) => setInspectedPhoto(photo)}
                currentEvent={currentEvent}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {displayPhotos.length === 0 ? (
                  <div className="col-span-full glass-panel p-16 text-center text-slate-400">
                    <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-200">No Photos In This View</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {allPhotos.length === 0
                        ? "Upload photos or generate a demo dataset to begin culling."
                        : "No items match your active search or defect filter."}
                    </p>
                  </div>
                ) : (
                  displayPhotos.map((photo) => {
                    const isDiscard = rawDiscards.some((p) => p.photo_id === photo.photo_id);
                    const aesthetic = photo.assessment?.aesthetic_score || photo.aesthetic_score;
                    const defect = photo.defect_reason;

                    return (
                      <div
                        key={photo.photo_id}
                        onClick={() => setInspectedPhoto(photo)}
                        className={`photo-card flex flex-col group ${
                          isDiscard ? 'border-rose-500/30' : 'border-emerald-500/30'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                          <img
                            src={`/storage/uploads/${currentEvent.event_id}/${photo.file_name}`}
                            alt={photo.file_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              e.target.src = `/storage/.recycle_bin/${currentEvent.event_id}/${photo.file_name}`;
                            }}
                          />

                          {/* Badge tag */}
                          <div className="absolute top-2 left-2 z-10">
                            {isDiscard ? (
                              <span className="badge badge-discard text-[10px]">
                                {defect || 'Discard'}
                              </span>
                            ) : (
                              <span className="badge badge-keeper text-[10px]">
                                Keeper
                              </span>
                            )}
                          </div>

                          {/* Aesthetic score badge top right */}
                          {aesthetic && (
                            <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/10">
                              ★ {aesthetic}/10
                            </div>
                          )}
                        </div>

                        {/* Card Info */}
                        <div className="p-2.5 bg-slate-900/90 flex items-center justify-between text-xs border-t border-white/5">
                          <span className="truncate font-mono text-slate-300 text-[11px]">
                            {photo.file_name || photo.original_filename}
                          </span>
                          <Eye className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals & Sub-Screens */}
      <EventSelectorModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        events={events}
        onSelectEvent={selectEvent}
        onEventCreated={(evt) => {
          setEvents((prev) => [evt, ...prev]);
          selectEvent(evt);
        }}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        currentEvent={currentEvent}
        onUploadSuccess={() => {
          if (currentEvent) selectEvent(currentEvent);
        }}
      />

      <HitlBatchModal
        isOpen={isHitlModalOpen}
        onClose={() => setIsHitlModalOpen(false)}
        currentEvent={currentEvent}
        onBatchResumed={() => {
          if (currentEvent) {
            checkStatus(currentEvent.event_id);
            loadResults(currentEvent.event_id);
            loadRecycleCount(currentEvent.event_id);
          }
        }}
      />

      <RecycleBinExplorer
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
        currentEvent={currentEvent}
        onItemRestored={() => {
          if (currentEvent) {
            loadResults(currentEvent.event_id);
            loadRecycleCount(currentEvent.event_id);
          }
        }}
      />

      <PhotoInspectorModal
        isOpen={Boolean(inspectedPhoto)}
        onClose={() => setInspectedPhoto(null)}
        photo={inspectedPhoto}
        onMarkKeeper={async (pid) => {
          if (!currentEvent) return;
          try {
            await api.restorePhotos(currentEvent.event_id, [pid]);
            await handleRefresh();
            setInspectedPhoto(null);
          } catch (e) {
            alert(e.message);
          }
        }}
        onMarkDiscard={async (pid) => {
          if (!currentEvent) return;
          try {
            await fetch('/api/mcp/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tool_name: 'move_to_recycle_bin',
                arguments: {
                  event_id: currentEvent.event_id,
                  photo_id: pid,
                  defect_reason: 'manual_studio_override',
                },
              }),
            });
            await handleRefresh();
            setInspectedPhoto(null);
          } catch (e) {
            alert(e.message);
          }
        }}
      />
    </div>
  );
}
