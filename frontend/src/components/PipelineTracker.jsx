import React from 'react';
import { Play, Sparkles, CheckCircle, Cpu, Eye, GitBranch, Layers, UserCheck, AlertTriangle } from 'lucide-react';

export function PipelineTracker({ statusData, onStartCulling, isStarting, onOpenHitlBatch, totalPhotos = 0 }) {
  const status = statusData?.status || 'not_started';
  const progressPct = statusData?.progress_pct || 0;
  const isInterrupted = statusData?.is_interrupted || false;
  const isRunning = status === 'processing' || status === 'tier1_completed';
  const isCompleted = status === 'completed';

  const totalKeepers = statusData?.total_keepers || 0;
  const totalDiscards = statusData?.total_discards || 0;

  return (
    <div className="glass-panel-elevated p-6 mb-8 border border-white/10 bg-slate-900/80">
      {/* Upper Pipeline Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white font-heading">AI Culling Engine Orchestration</h2>
            {isInterrupted ? (
              <span className="badge badge-hitl animate-pulse text-xs">
                <UserCheck className="w-3.5 h-3.5" /> HITL Batch Interrupted (Needs Approval)
              </span>
            ) : isRunning ? (
              <span className="badge badge-vlm animate-pulse text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Pipeline Running ({progressPct}%)
              </span>
            ) : isCompleted ? (
              <span className="badge badge-keeper text-xs">
                <CheckCircle className="w-3.5 h-3.5" /> Culling Complete
              </span>
            ) : (
              <span className="badge badge-burst text-xs">Ready to Cull</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated 3-Tier Multi-Engine Architecture with LangGraph Human-in-the-Loop 50-Photo Batch Checkpoints
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-3">
          {isInterrupted ? (
            <button
              onClick={onOpenHitlBatch}
              className="btn-primary !bg-gradient-to-r !from-cyan-500 !to-indigo-600 text-xs font-bold py-2.5 px-5 shadow-cyan-500/30 animate-bounce"
            >
              <UserCheck className="w-4 h-4" /> Review Batch 50 Photos
            </button>
          ) : (
            <button
              onClick={onStartCulling}
              disabled={isRunning || isStarting || totalPhotos === 0}
              className="btn-primary text-xs font-bold py-2.5 px-5"
            >
              {isRunning || isStarting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Processing AI Culling...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Start Multi-Tier Culling
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 3-Tier Architecture Flow Visualizer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Tier 1 Box */}
        <div className={`glass-panel p-4 rounded-xl border transition-all ${
          progressPct >= 25 ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-white/5 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Tier 1 • Zero-Cost CV</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-100">OpenCV Laplacian & pHash</h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Detects severe motion blur, camera shake variance, and DCT perceptual hash burst duplicates.
          </p>
        </div>

        {/* Tier 2 Box */}
        <div className={`glass-panel p-4 rounded-xl border transition-all ${
          progressPct >= 45 ? 'border-purple-500/50 bg-purple-950/20' : 'border-white/5 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Tier 2 • Vector Grouping</span>
            <GitBranch className="w-4 h-4 text-purple-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-100">DBSCAN Pose Clustering</h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Embeds multi-scale perceptual features to group near-identical poses and rank top keepers.
          </p>
        </div>

        {/* Tier 3 Box */}
        <div className={`glass-panel p-4 rounded-xl border transition-all ${
          progressPct >= 60 ? 'border-pink-500/50 bg-pink-950/20' : 'border-white/5 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">Tier 3 • VLM Analysis</span>
            <Eye className="w-4 h-4 text-pink-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-100">Gemini & Mistral Pixtral</h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Deep facial analysis (blinks, gaze, turned head) and professional studio aesthetic rating (1-10).
          </p>
        </div>

        {/* HITL Box */}
        <div className={`glass-panel p-4 rounded-xl border transition-all ${
          isInterrupted
            ? 'border-cyan-400 bg-cyan-950/30 shadow-lg shadow-cyan-500/20'
            : isCompleted
            ? 'border-emerald-500/50 bg-emerald-950/20'
            : 'border-white/5 opacity-70'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isInterrupted ? 'text-cyan-300 font-extrabold' : 'text-emerald-400'}`}>
              HITL Checkpoint
            </span>
            <UserCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <h4 className="text-sm font-semibold text-slate-100">50-Photo Batch Review</h4>
          <p className="text-[11px] text-slate-400 mt-1">
            LangGraph interrupts for studio owner approval before staging discards into .recycle_bin/.
          </p>
        </div>
      </div>

      {/* Dynamic Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400 font-mono">
          <span>Overall Pipeline Progress</span>
          <span className="text-indigo-300 font-bold">{progressPct}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden border border-white/10 p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-500 shadow-glow"
            style={{ width: `${Math.max(progressPct, 2)}%` }}
          />
        </div>
      </div>

      {/* Decision Summary Counters */}
      {(totalKeepers > 0 || totalDiscards > 0) && (
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-slate-400">Keepers Selected:</span>
              <span className="font-bold text-emerald-300 text-sm">{totalKeepers}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-slate-400">Discard Candidates:</span>
              <span className="font-bold text-rose-300 text-sm">{totalDiscards}</span>
            </div>
          </div>
          <div className="text-slate-400 italic text-[11px]">
            Zero photos deleted permanently • Staged with JSON manifest in .recycle_bin/
          </div>
        </div>
      )}
    </div>
  );
}
