import { create } from 'zustand';
import { ShapeType, ParticleConfig, HandData } from './types';
import * as THREE from 'three';

interface AppState {
  config: ParticleConfig;
  setConfig: (partial: Partial<ParticleConfig>) => void;
  handDataRef: { current: HandData }; // Mutable ref for high-frequency updates
  setHandData: (data: HandData) => void;
  isHandTrackingReady: boolean;
  setHandTrackingReady: (ready: boolean) => void;
}

const DEFAULT_CONFIG: ParticleConfig = {
  count: 200000,
  color: '#00ffff',
  size: 0.05,
  gravityStrength: 0.5,
  friction: 0.96,
  shape: ShapeType.SPHERE,
  collisionEnabled: false,
};

// Initial neutral hand data
const initialHandData: HandData = {
  left: null,
  right: null,
  distance: 0,
  centerX: 0,
  centerY: 0,
  centerZ: 0,
  rotation: 0,
  gesture: 'IDLE',
};

export const useStore = create<AppState>((set) => ({
  config: DEFAULT_CONFIG,
  setConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),
  handDataRef: { current: initialHandData },
  setHandData: (data) => {
    // We update the ref directly for the loop, but usually we don't trigger state updates 
    // for hand positions to avoid React re-renders. 
    // This function might be used if we need reactive UI updates based on hands.
  },
  isHandTrackingReady: false,
  setHandTrackingReady: (ready) => set({ isHandTrackingReady: ready }),
}));