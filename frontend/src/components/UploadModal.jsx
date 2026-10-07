import React, { useState, useRef } from 'react';
import { UploadCloud, Sparkles, Image as ImageIcon, CheckCircle2, AlertCircle, X, Layers } from 'lucide-react';
import { api } from '../api';

export function UploadModal({ isOpen, onClose, currentEvent, onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [generatingDemo, setGeneratingDemo] = useState(false);
  const [demoCount, setDemoCount] = useState(55);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  if (!isOpen || !currentEvent) return null;

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selected = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      setFiles(prev => [...prev, ...selected]);
    }
  }

  function handleFileChange(e) {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      setFiles(prev => [...prev, ...selected]);
    }
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress(20);
    try {
      setUploadProgress(50);
      const res = await api.uploadPhotos(currentEvent.event_id, files);
      setUploadProgress(100);
      onUploadSuccess();
      onClose();
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateDemo() {
    setGeneratingDemo(true);
    try {
      await api.generateDemoDataset(currentEvent.event_id, demoCount);
      onUploadSuccess();
      onClose();
    } catch (err) {
      alert(`Demo dataset generation failed: ${err.message}`);
    } finally {
      setGeneratingDemo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel-elevated w-full max-w-2xl p-6 bg-slate-900/95 border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Upload Raw Event Photos</h2>
              <p className="text-xs text-slate-400">
                Target Event: <span className="text-indigo-300 font-semibold">{currentEvent.title}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1-Click Synthetic Demo Shoot Generator */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/40 to-slate-900/60 border border-indigo-500/30 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-slate-100">Instant Demo Shoot Generator</h3>
            </div>
            <p className="text-xs text-slate-400">
              Instantly populates {demoCount} realistic event photos (burst bursts, camera shake, closed eyes, and sharp keepers) to test the 3-Tier AI pipeline immediately.
            </p>
          </div>
          <button
            onClick={handleGenerateDemo}
            disabled={generatingDemo || uploading}
            className="btn-primary !bg-gradient-to-r !from-purple-600 !to-indigo-600 text-xs whitespace-nowrap shadow-purple-500/30"
          >
            {generatingDemo ? (
              <>
                <Layers className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate {demoCount} Photos
              </>
            )}
          </button>
        </div>

        {/* Drag & Drop File Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-indigo-500 bg-indigo-950/30 scale-[1.01]'
              : 'border-slate-700 hover:border-slate-500 bg-slate-950/40'
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
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3">
            <UploadCloud className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Drag & drop raw burst photos here, or <span className="text-indigo-400 underline">browse files</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports batch ingestion of up to 500 JPG, PNG, and RAW portrait photos
          </p>
        </div>

        {/* Selected Files Preview & Stats */}
        {files.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-slate-950/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <ImageIcon className="w-4 h-4 text-indigo-400" />
              <span>{files.length} photo files staged for upload</span>
            </div>
            <button
              onClick={() => setFiles([])}
              className="text-xs text-rose-400 hover:underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="btn-primary text-xs"
          >
            {uploading ? `Uploading (${uploadProgress}%)...` : `Upload ${files.length} Photos`}
          </button>
        </div>
      </div>
    </div>
  );
}
