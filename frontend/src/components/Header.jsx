import React from 'react';
import { Camera, Sparkles, ShieldCheck, Cpu, HardDrive, RefreshCw, PlusCircle, Trash2 } from 'lucide-react';

export function Header({ currentEvent, onOpenUpload, onOpenNewEvent, onOpenRecycleBin, recycleBinCount = 0, onRefresh, isRefreshing }) {
  return (
    <header className="glass-panel sticky top-0 z-40 px-6 py-4 mb-8 flex items-center justify-between border-b border-white/10">
      {/* Brand Title */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Camera className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200">
              LuminaCull Studio
            </h1>
            <span className="badge badge-vlm text-[10px] uppercase font-bold tracking-wider">
              <Sparkles className="w-3 h-3" /> LangGraph HITL
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Multi-Tier AI Culling • OpenCV + Vector DBSCAN + Gemini/Pixtral VLM
          </p>
        </div>
      </div>

      {/* Active Event Badge & Status */}
      <div className="hidden md:flex items-center gap-4">
        {currentEvent ? (
          <div className="glass-panel px-4 py-2 flex items-center gap-3 border-indigo-500/30 bg-indigo-950/20">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <p className="text-xs font-semibold text-slate-200">{currentEvent.title}</p>
              <p className="text-[11px] text-indigo-300 font-mono">
                {currentEvent.photo_count || 0} Photos • {currentEvent.client_name || 'Studio Client'}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">No active event selected</div>
        )}

        <div className="flex items-center gap-2 border-l border-white/10 pl-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-white/5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> VLM 2.5
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-white/5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Clerk Auth
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          title="Refresh Data"
          className="btn-secondary !p-2.5"
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onOpenRecycleBin}
          className="btn-secondary !py-2 !px-3.5 flex items-center gap-2 text-rose-300 border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-950/30"
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span className="hidden sm:inline text-xs font-medium">Recycle Bin</span>
          {recycleBinCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 text-[10px] font-bold">
              {recycleBinCount}
            </span>
          )}
        </button>

        <button
          onClick={onOpenNewEvent}
          className="btn-secondary !py-2 !px-3.5 text-xs font-medium"
        >
          <PlusCircle className="w-4 h-4 text-indigo-400" />
          <span className="hidden sm:inline">New Event</span>
        </button>

        <button
          onClick={onOpenUpload}
          className="btn-primary !py-2 !px-4 text-xs font-semibold"
        >
          <HardDrive className="w-4 h-4" />
          <span>Upload Batch</span>
        </button>
      </div>
    </header>
  );
}
