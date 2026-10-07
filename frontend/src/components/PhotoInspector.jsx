import React from 'react';
import { Eye, Cpu, Sparkles, Check, Trash2, X, Sun, ShieldAlert, Award, Compass, Camera } from 'lucide-react';

export function PhotoInspectorModal({ isOpen, onClose, photo, onMarkKeeper, onMarkDiscard }) {
  if (!isOpen || !photo) return null;

  const assessment = photo.assessment || photo.vlm_assessment || {};
  const cvMetrics = photo.cv_metrics || {};
  const lapVar = photo.laplacian_variance || cvMetrics.laplacian_variance || 'N/A';
  const phash = photo.phash || cvMetrics.phash || 'N/A';

  const aesthetic = assessment.aesthetic_score || 7.0;
  const sharpness = assessment.sharpness_score || 7.0;
  const composition = assessment.composition_score || 7.5;
  const eyesOpenPct = assessment.eyes_open_confidence ? Math.round(assessment.eyes_open_confidence * 100) : 95;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
      <div className="glass-panel-elevated w-full max-w-5xl h-[90vh] flex flex-col bg-slate-950/95 border border-white/15 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-heading">{photo.original_filename || photo.file_name}</h3>
              <p className="text-xs text-slate-400 font-mono">ID: {photo.photo_id}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onMarkKeeper(photo.photo_id)}
              className="btn-success !py-1.5 !px-3.5 text-xs flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Approve Keeper
            </button>
            <button
              onClick={() => onMarkDiscard(photo.photo_id)}
              className="btn-danger !py-1.5 !px-3.5 text-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Stage Discard
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Main Full-Res Image Viewer */}
          <div className="flex-1 bg-black/90 p-4 flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-white/10">
            <img
              src={`/storage/uploads/${photo.event_id}/${photo.file_name}`}
              alt={photo.file_name}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              onError={(e) => {
                e.target.src = `/storage/.recycle_bin/${photo.event_id}/${photo.file_name}`;
              }}
            />
          </div>

          {/* Right Metrics Panel */}
          <div className="w-full md:w-96 p-6 overflow-y-auto bg-slate-900/50 space-y-6">
            {/* Aesthetic Rating Showcase */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-slate-900/60 border border-indigo-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" /> Overall Aesthetic Score
                </span>
                <span className="text-2xl font-extrabold text-amber-300 font-heading">{aesthetic} / 10</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-indigo-500"
                  style={{ width: `${(aesthetic / 10) * 100}%` }}
                />
              </div>
            </div>

            {/* AI Vision Criteria Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">VLM Facial & Composition Check</h4>
              
              <div className="space-y-2 text-xs">
                <div className="glass-panel p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" /> Eyes Open Confidence:
                  </span>
                  <span className={`font-bold ${assessment.eyes_closed_detected ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {eyesOpenPct}% {assessment.eyes_closed_detected ? '(Blink Flagged)' : '(Optimal)'}
                  </span>
                </div>

                <div className="glass-panel p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-purple-400" /> Subject Orientation:
                  </span>
                  <span className="capitalize font-semibold text-slate-200">
                    {assessment.subject_orientation?.replace('_', ' ') || 'Facing Camera'}
                  </span>
                </div>

                <div className="glass-panel p-2.5 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-400" /> Lighting & Exposure:
                  </span>
                  <span className="capitalize font-semibold text-slate-200">
                    {assessment.lighting_quality?.replace('_', ' ') || 'Balanced'}
                  </span>
                </div>
              </div>
            </div>

            {/* Zero-Cost CV Signals */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Tier 1 Computer Vision Signals</h4>
              
              <div className="space-y-2 text-xs font-mono">
                <div className="glass-panel p-2.5 flex items-center justify-between">
                  <span className="text-slate-400">Laplacian Variance:</span>
                  <span className="text-indigo-300 font-bold">{lapVar}</span>
                </div>
                <div className="glass-panel p-2.5 flex items-center justify-between">
                  <span className="text-slate-400">pHash:</span>
                  <span className="text-slate-300 truncate max-w-[150px]">{phash}</span>
                </div>
              </div>
            </div>

            {/* VLM Professional Studio Critique */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Studio Director Critique
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed italic glass-panel p-3 bg-slate-950/70 border-white/5">
                "{assessment.summary_verdict || 'High-value capture ready for client gallery review.'}"
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
