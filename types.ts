import * as THREE from 'three';

export enum ShapeType {
  SPHERE = 'Sphere',
  CUBE = 'Cube',
  HEART = 'Heart',
  FLOWER = 'Flower',
  SATURN = 'Saturn',
  BUDDHA = 'Buddha', // Simplified Meditating Figure
  GALAXY = 'Galaxy',
}

export interface ParticleConfig {
  count: number;
  color: string;
  size: number;
  gravityStrength: number;
  friction: number;
  shape: ShapeType;
  collisionEnabled: boolean;
}

export interface HandData {
  left: { x: number; y: number; z: number; isOpen: boolean } | null;
  right: { x: number; y: number; z: number; isOpen: boolean } | null;
  distance: number; // Distance between hands
  centerX: number;
  centerY: number;
  centerZ: number;
  rotation: number; // Angle between hands in radians
  gesture: 'IDLE' | 'EXPAND' | 'COMPRESS' | 'CIRCLE' | 'COLLAPSE' | 'CONTROL';
}