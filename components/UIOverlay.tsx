import React from 'react';
import { useStore } from '../store';
import { ShapeType } from '../types';
import { Settings2, Hand, Info, Circle, Zap, Minimize2, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

const UIOverlay: React.FC = () => {
  const { config, setConfig, isHandTrackingReady } = useStore();
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <>
      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tighter drop-shadow-md">GOD'S HAND</h1>
          <p className="text-blue-300 text-sm opacity-80">Interactive Particle Universe</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
            {!isHandTrackingReady && (
                <div className="bg-red-500/20 text-red-200 border border-red-500/50 px-3 py-1 rounded text-xs animate-pulse">
                    Initializing Hand Tracking...
                </div>
            )}
             {isHandTrackingReady && (
                <div className="bg-green-500/20 text-green-200 border border-green-500/50 px-3 py-1 rounded text-xs">
                    System Active
                </div>
            )}
            
            <div className="bg-black/40 backdrop-blur text-white/60 p-2 rounded text-[10px] max-w-[200px] text-right pointer-events-auto">
                <p className="mb-1"><span className="text-yellow-400 font-bold">Circle</span> = Create Planet</p>
                <p className="mb-1"><span className="text-red-400 font-bold">Collapse</span> = Explosion</p>
                <p className="mb-1"><span className="text-blue-400 font-bold">Open/Close</span> = Push/Pull</p>
                <p className="border-t border-white/20 pt-1 mt-1"><span className="text-purple-400 font-bold">TWO FISTS</span> = <span className="italic">GOD MODE</span></p>
                <p className="text-[9px] opacity-70">Move to Rotate • Distance to Zoom</p>
            </div>
        </div>
      </div>

      {/* Sidebar Controls */}
      <div className={clsx(
        "absolute top-20 right-4 w-72 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 transition-all duration-300 transform",
        isOpen ? "translate-x-0 opacity-100" : "translate-x-[110%] opacity-0"
      )}>
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
            <h2 className="text-white font-semibold flex items-center gap-2">
                <Settings2 size={16} /> Configuration
            </h2>
            <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white">
                <Minimize2 size={16} />
            </button>
        </div>

        {/* Shape Selector */}
        <div className="mb-4">
            <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">Visual Template</label>
            <div className="grid grid-cols-2 gap-2">
                {Object.values(ShapeType).map((shape) => (
                    <button
                        key={shape}
                        onClick={() => setConfig({ shape })}
                        className={clsx(
                            "px-3 py-2 rounded text-xs font-medium text-left transition-colors",
                            config.shape === shape 
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                                : "bg-white/5 text-white/60 hover:bg-white/10"
                        )}
                    >
                        {shape}
                    </button>
                ))}
            </div>
        </div>

        {/* Color Picker */}
        <div className="mb-4">
             <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">Particle Color</label>
             <div className="flex gap-2">
                {['#00ffff', '#ff0055', '#ffcc00', '#ffffff', '#aa00ff', '#00ff66'].map(color => (
                    <button
                        key={color}
                        onClick={() => setConfig({ color })}
                        className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform"
                        style={{ backgroundColor: color, boxShadow: config.color === color ? `0 0 10px ${color}` : 'none' }}
                    />
                ))}
             </div>
        </div>

        {/* Sliders */}
        <div className="space-y-4">
            <div>
                <label className="flex justify-between text-xs text-white/70 mb-1">
                    <span>Gravity</span>
                    <span>{config.gravityStrength.toFixed(1)}</span>
                </label>
                <input 
                    type="range" min="0" max="2" step="0.1"
                    value={config.gravityStrength}
                    onChange={(e) => setConfig({ gravityStrength: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
                />
            </div>
            <div>
                <label className="flex justify-between text-xs text-white/70 mb-1">
                    <span>Particle Size</span>
                    <span>{config.size.toFixed(2)}</span>
                </label>
                <input 
                    type="range" min="0.05" max="0.5" step="0.01"
                    value={config.size}
                    onChange={(e) => setConfig({ size: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
                />
            </div>
        </div>
      </div>

      {/* Toggle Button */}
      {!isOpen && (
        <button 
            onClick={() => setIsOpen(true)}
            className="absolute top-20 right-4 p-3 bg-white/10 backdrop-blur rounded-lg text-white hover:bg-white/20 transition-colors"
        >
            <Settings2 size={20} />
        </button>
      )}
    </>
  );
};

export default UIOverlay;