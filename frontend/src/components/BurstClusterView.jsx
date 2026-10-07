import React from 'react';
import { Sparkles, Crown, Layers, CheckCircle2, ArrowRight } from 'lucide-react';

export function BurstClusterView({ clusters = [], allPhotos = [], onInspectPhoto, currentEvent }) {
  const photoMap = new Map(allPhotos.map(p => [p.photo_id, p]));

  if (clusters.length === 0) {
    return (
      <div className="glass-panel p-12 text-center text-slate-400">
        <Layers className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-slate-200">No Burst Clusters Detected</h3>
        <p className="text-xs text-slate-400 mt-1">
          When photographers capture rapid action sequences, Tier 2 vector clustering groups near-identical frames here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {clusters.map((cluster, idx) => {
        const bestPhoto = photoMap.get(cluster.best_photo_id);
        const members = cluster.members.map(id => photoMap.get(id)).filter(Boolean);

        return (
          <div key={cluster.cluster_id || idx} className="glass-panel p-5 border border-indigo-500/20 bg-slate-900/60">
            {/* Cluster Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className="badge badge-burst text-xs">
                  <Layers className="w-3.5 h-3.5" /> Burst Sequence #{idx + 1}
                </span>
                <span className="text-xs text-slate-400">
                  {cluster.total_shots} continuous shots • AI selected 1 top keeper
                </span>
              </div>
            </div>

            {/* Photo Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {members.map((photo) => {
                const isBest = photo.photo_id === cluster.best_photo_id;

                return (
                  <div
                    key={photo.photo_id}
                    onClick={() => onInspectPhoto(photo)}
                    className={`photo-card relative group flex flex-col ${
                      isBest ? 'selected-keeper ring-2 ring-emerald-400' : 'selected-discard opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                      <img
                        src={`/storage/uploads/${currentEvent.event_id}/${photo.file_name}`}
                        alt={photo.file_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />

                      {/* Best Pick Overlay Badge */}
                      <div className="absolute top-2 left-2 z-10">
                        {isBest ? (
                          <span className="badge badge-keeper text-[10px] shadow-lg">
                            <Crown className="w-3 h-3 text-amber-300" /> Best Pick
                          </span>
                        ) : (
                          <span className="badge badge-discard text-[10px]">
                            Burst Dupe
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2 bg-slate-900 flex items-center justify-between text-[11px] border-t border-white/5">
                      <span className="truncate font-mono text-slate-300">{photo.file_name}</span>
                      <span className="font-semibold text-slate-200">
                        {photo.assessment?.aesthetic_score ? `${photo.assessment.aesthetic_score}/10` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
