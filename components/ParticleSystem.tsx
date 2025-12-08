import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { generateParticles } from '../utils/shapes';
import { HandData } from '../types';

const ParticleSystem: React.FC = () => {
  const { config, handDataRef } = useStore();
  const pointsRef = useRef<THREE.Points>(null);
  
  // Buffers
  const count = config.count;
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const velocities = useMemo(() => new Float32Array(count * 3), [count]);
  const originalPositions = useMemo(() => new Float32Array(count * 3), [count]); // Target shapes
  const colors = useMemo(() => new Float32Array(count * 3), [count]);
  
  // Simulation State
  const simState = useRef({
    explosionTime: -100, // Time when explosion triggered
    planetMode: false,
    planetCenter: new THREE.Vector3(),
    time: 0,
    targetScale: 1,
    currentScale: 1,
    targetRotationY: 0,
    currentRotationY: 0,
    targetRotationZ: 0,
    currentRotationZ: 0,
  });

  // Initialize particles based on shape
  useEffect(() => {
    const newPositions = generateParticles(count, config.shape);
    const colorObj = new THREE.Color(config.color);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = newPositions[i * 3];
      positions[i * 3 + 1] = newPositions[i * 3 + 1];
      positions[i * 3 + 2] = newPositions[i * 3 + 2];

      originalPositions[i * 3] = newPositions[i * 3];
      originalPositions[i * 3 + 1] = newPositions[i * 3 + 1];
      originalPositions[i * 3 + 2] = newPositions[i * 3 + 2];

      velocities[i * 3] = (Math.random() - 0.5) * 0.1;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;

      // Slight color variation
      colors[i * 3] = colorObj.r + (Math.random() - 0.5) * 0.1;
      colors[i * 3 + 1] = colorObj.g + (Math.random() - 0.5) * 0.1;
      colors[i * 3 + 2] = colorObj.b + (Math.random() - 0.5) * 0.1;
    }

    if (pointsRef.current) {
        pointsRef.current.geometry.attributes.position.needsUpdate = true;
        pointsRef.current.geometry.attributes.color.needsUpdate = true;
    }
  }, [config.shape, config.count, config.color, positions, velocities, originalPositions, colors]);


  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    
    const { left, right, gesture, centerX, centerY, distance, rotation } = handDataRef.current;
    const s = simState.current;
    s.time += delta;

    // --- SYSTEM TRANSFORMS (CONTROL MODE) ---
    if (gesture === 'CONTROL') {
        // Zoom: Map distance to scale. 
        // Base distance approx 10. Range 5-20.
        // Scale 0.5 to 2.0
        const scaleFactor = Math.min(Math.max(distance / 10, 0.3), 3.0);
        s.targetScale = scaleFactor;
        
        // Rotation Y: Map centerX (-15 to 15) to rotation (-PI to PI)
        s.targetRotationY = (centerX / 15) * Math.PI;

        // Rotation Z (Steering): Map rotation angle directly
        // Usually steering is -PI/2 to PI/2
        s.targetRotationZ = rotation;
    }

    // Smooth Interpolation for Transforms
    const lerpFactor = delta * 5;
    s.currentScale += (s.targetScale - s.currentScale) * lerpFactor;
    s.currentRotationY += (s.targetRotationY - s.currentRotationY) * lerpFactor;
    s.currentRotationZ += (s.targetRotationZ - s.currentRotationZ) * lerpFactor;

    // Apply Transforms to Group
    pointsRef.current.scale.setScalar(s.currentScale);
    pointsRef.current.rotation.y = s.currentRotationY;
    pointsRef.current.rotation.z = s.currentRotationZ;
    // We can also rotate X based on centerY, but let's keep it simple (Orbit Y + Roll Z)

    // --- PHYSICS PREP ---
    // We need to transform Hand Coordinates (World Space) into Local Space of the particle system
    // because the particles are being simulated in their local space (positions array).
    
    const worldToLocalMatrix = pointsRef.current.matrixWorld.clone().invert();
    
    const getLocalHandPos = (h: {x:number, y:number, z:number}) => {
        const v = new THREE.Vector3(h.x, h.y, h.z);
        return v.applyMatrix4(worldToLocalMatrix);
    };
    
    const lPos = left ? getLocalHandPos(left) : null;
    const rPos = right ? getLocalHandPos(right) : null;
    const centerPos = getLocalHandPos({x: centerX, y: centerY, z: 0});

    // --- GAME LOGIC ---

    // Gesture Triggers
    if (gesture === 'COLLAPSE' && s.time - s.explosionTime > 1.0) {
      s.explosionTime = s.time;
      s.planetMode = false; // Break planet
    }
    if (gesture === 'CIRCLE' && !s.planetMode) {
        s.planetMode = true;
        s.planetCenter.copy(centerPos);
    }
    // If hands move far apart, break planet mode
    if (gesture === 'EXPAND' && s.planetMode) {
        s.planetMode = false;
    }
    
    const explosionAge = s.time - s.explosionTime;
    const isExploding = explosionAge < 1.5 && explosionAge > 0;

    // --- PARTICLE LOOP ---
    // Physics constants
    const damping = config.friction;
    const returnForce = 0.5 * delta;
    
    // Check if hands are "active" for physics (Open hands only)
    const isPhysicsActive = gesture !== 'CONTROL'; 

    const posAttr = pointsRef.current.geometry.attributes.position;
    
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      let px = positions[idx];
      let py = positions[idx + 1];
      let pz = positions[idx + 2];
      
      let vx = velocities[idx];
      let vy = velocities[idx + 1];
      let vz = velocities[idx + 2];

      // 1. Base Inertia & Damping
      vx *= damping;
      vy *= damping;
      vz *= damping;

      // 2. Shape Holding Force
      if (!s.planetMode && !isExploding) {
          const tx = originalPositions[idx];
          const ty = originalPositions[idx + 1];
          const tz = originalPositions[idx + 2];
          vx += (tx - px) * returnForce * 0.5;
          vy += (ty - py) * returnForce * 0.5;
          vz += (tz - pz) * returnForce * 0.5;
      }

      // 3. Hand Influence (Only if Physics Active)
      if (isPhysicsActive) {
          // Left Hand
          if (lPos) {
            const dx = lPos.x - px;
            const dy = lPos.y - py;
            const dz = lPos.z - pz;
            const d2 = dx*dx + dy*dy + dz*dz + 0.1;
            const d = Math.sqrt(d2);
            
            const force = left!.isOpen ? -10.0 : 30.0; 
            
            // Adjust interaction radius for scale? 
            // Since we transformed hand to local space, interaction radius should be in local units (approx 8)
            if (d < 8) {
                const f = (force * delta) / d;
                vx += dx * f;
                vy += dy * f;
                vz += dz * f;
            }
          }
          
          // Right Hand
          if (rPos) {
            const dx = rPos.x - px;
            const dy = rPos.y - py;
            const dz = rPos.z - pz;
            const d2 = dx*dx + dy*dy + dz*dz + 0.1;
            const d = Math.sqrt(d2);
            
            const force = right!.isOpen ? -10.0 : 30.0;
            
            if (d < 8) {
                const f = (force * delta) / d;
                vx += dx * f;
                vy += dy * f;
                vz += dz * f;
            }
          }
      }

      // 4. Gesture Effects
      
      // PLANET MODE
      if (s.planetMode) {
        const dx = s.planetCenter.x - px;
        const dy = s.planetCenter.y - py;
        const dz = s.planetCenter.z - pz;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        const gForce = (150 * delta) / (d + 1);
        vx += (dx / d) * gForce;
        vy += (dy / d) * gForce;
        vz += (dz / d) * gForce;

        const swirlSpeed = 20 * delta / (d + 0.5);
        vx += -dz * swirlSpeed;
        vz += dx * swirlSpeed;
      }

      // EXPAND / COMPRESS
      if (!s.planetMode && isPhysicsActive) {
          if (gesture === 'EXPAND') {
             const dx = px - centerPos.x;
             const dy = py - centerPos.y;
             const dz = pz - centerPos.z;
             const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
             const factor = 20 * delta / d;
             vx += dx * factor;
             vy += dy * factor;
             vz += dz * factor;
          } else if (gesture === 'COMPRESS') {
             const dx = centerPos.x - px;
             const dy = centerPos.y - py;
             const dz = centerPos.z - pz;
             const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
             const factor = 15 * delta / d;
             vx += dx * factor;
             vy += dy * factor;
             vz += dz * factor;
          }
      }

      // EXPLOSION
      if (isExploding) {
          const dx = px - centerPos.x;
          const dy = py - centerPos.y;
          const dz = pz - centerPos.z;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
          
          const waveRadius = explosionAge * 30;
          const distToWave = Math.abs(d - waveRadius);
          
          if (distToWave < 5) {
              const blast = (100 * delta) / (d + 1);
              vx += (dx/d) * blast;
              vy += (dy/d) * blast;
              vz += (dz/d) * blast;
              
              vx += (Math.random()-0.5) * 50 * delta;
              vy += (Math.random()-0.5) * 50 * delta;
              vz += (Math.random()-0.5) * 50 * delta;
          }
      }

      // Update
      px += vx;
      py += vy;
      pz += vz;

      positions[idx] = px;
      positions[idx + 1] = py;
      positions[idx + 2] = pz;
      
      velocities[idx] = vx;
      velocities[idx + 1] = vy;
      velocities[idx + 2] = vz;
    }

    posAttr.needsUpdate = true;
  });

  // Custom Shader Material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(config.color) },
        uSize: { value: config.size * 30.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (10.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (r > 0.5) discard;
          float glow = 1.0 - (r * 2.0);
          glow = pow(glow, 1.5); 
          gl_FragColor = vec4(vColor, glow);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }, [config.color, config.size]);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
            attach="attributes-color"
            count={colors.length / 3}
            array={colors}
            itemSize={3}
        />
      </bufferGeometry>
      <primitive object={shaderMaterial} attach="material" />
    </points>
  );
};

export default ParticleSystem;