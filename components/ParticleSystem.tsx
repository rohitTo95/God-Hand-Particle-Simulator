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
    
    const { left, right, gesture, centerX, centerY, centerZ, distance, rotation } = handDataRef.current;
    const s = simState.current;
    s.time += delta;

    // Clamp delta to prevent physics explosions on frame drops
    const clampedDelta = Math.min(delta, 0.05);

    // --- SYSTEM TRANSFORMS (CONTROL MODE) ---
    if (gesture === 'CONTROL') {
        // Zoom: Map distance to scale with better responsiveness
        // Distance typically ranges from 5-20 units
        const normalizedDist = (distance - 5) / 15; // 0 to 1 range
        const scaleFactor = 0.4 + normalizedDist * 2.2; // 0.4 to 2.6 range
        s.targetScale = Math.max(0.3, Math.min(3.0, scaleFactor));
        
        // Rotation Y: Map centerX with deadzone for stability
        const deadzone = 1.5;
        let rotY = 0;
        if (Math.abs(centerX) > deadzone) {
            rotY = ((centerX - Math.sign(centerX) * deadzone) / 12) * Math.PI;
        }
        s.targetRotationY = Math.max(-Math.PI, Math.min(Math.PI, rotY));

        // Rotation Z (Steering): Map rotation angle with smoothing
        s.targetRotationZ = rotation * 0.8; // Slightly dampen for stability
    }

    // Smooth Interpolation for Transforms with adaptive speed
    const baseLerp = clampedDelta * 4;
    const controlLerp = gesture === 'CONTROL' ? baseLerp * 1.5 : baseLerp * 0.5;
    
    s.currentScale += (s.targetScale - s.currentScale) * controlLerp;
    s.currentRotationY += (s.targetRotationY - s.currentRotationY) * controlLerp;
    s.currentRotationZ += (s.targetRotationZ - s.currentRotationZ) * controlLerp;

    // Apply Transforms to Group
    pointsRef.current.scale.setScalar(s.currentScale);
    pointsRef.current.rotation.y = s.currentRotationY;
    pointsRef.current.rotation.z = s.currentRotationZ;

    // --- PHYSICS PREP ---
    const worldToLocalMatrix = pointsRef.current.matrixWorld.clone().invert();
    
    const getLocalHandPos = (h: {x:number, y:number, z:number}) => {
        const v = new THREE.Vector3(h.x, h.y, h.z);
        return v.applyMatrix4(worldToLocalMatrix);
    };
    
    const lPos = left ? getLocalHandPos(left) : null;
    const rPos = right ? getLocalHandPos(right) : null;
    const centerPos = getLocalHandPos({x: centerX, y: centerY, z: centerZ || 0});

    // Dynamic interaction radius based on current scale
    const baseInteractionRadius = 12;
    const interactionRadius = baseInteractionRadius / s.currentScale;

    // --- GAME LOGIC ---

    // CIRCLE/Planet mode activation
    if (gesture === 'CIRCLE' && !s.planetMode) {
        s.planetMode = true;
        s.planetCenter.copy(centerPos);
    }
    
    // Update planet center smoothly while in CIRCLE mode
    if (gesture === 'CIRCLE' && s.planetMode) {
        s.planetCenter.lerp(centerPos, clampedDelta * 4);
    }
    
    // Exit planet mode when not in CIRCLE gesture
    if (gesture !== 'CIRCLE' && s.planetMode) {
        // Give a short grace period before exiting
        if (gesture === 'EXPAND' || gesture === 'COMPRESS') {
            s.planetMode = false;
        }
    }

    // Explosion trigger
    if (gesture === 'COLLAPSE' && s.time - s.explosionTime > 1.5) {
      s.explosionTime = s.time;
      s.planetMode = false;
    }
    
    const explosionAge = s.time - s.explosionTime;
    const isExploding = explosionAge < 2.0 && explosionAge > 0;

    // --- PARTICLE LOOP ---
    const damping = config.friction;
    const returnForce = 0.5 * clampedDelta;
    
    // Check if either hand is pinched
    const leftPinched = left?.isPinched ?? false;
    const rightPinched = right?.isPinched ?? false;
    const anyPinched = leftPinched || rightPinched;

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

      // 2. Shape Holding Force (only when IDLE, not during active gestures)
      if (!s.planetMode && !isExploding && gesture === 'IDLE') {
          const tx = originalPositions[idx];
          const ty = originalPositions[idx + 1];
          const tz = originalPositions[idx + 2];
          vx += (tx - px) * returnForce * 0.6;
          vy += (ty - py) * returnForce * 0.6;
          vz += (tz - pz) * returnForce * 0.6;
      }

      // 3. PLANET MODE - Create a proper 3D FILLED SPHERE
      if (s.planetMode && gesture === 'CIRCLE') {
        // Planet center - use X,Y from hands, Z at scene center
        const planetX = s.planetCenter.x;
        const planetY = s.planetCenter.y;
        const planetZ = 0;
        
        const dx = planetX - px;
        const dy = planetY - py;
        const dz = planetZ - pz;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
        
        // Target sphere radius
        const targetRadius = 5;
        
        // Calculate where this particle should be distributed within the sphere
        // Use particle index to create unique target positions for volume fill
        const particlePhase = (i * 2.399) % (Math.PI * 2); // Golden angle spread
        const particleLayer = ((i * 0.618) % 1.0); // Golden ratio for layers
        
        // MAIN GRAVITATIONAL PULL - Always pull toward center
        const pullStrength = 200 * clampedDelta;
        const pullForce = pullStrength / (d + 0.5);
        
        vx += (dx / d) * pullForce;
        vy += (dy / d) * pullForce;
        vz += (dz / d) * pullForce;
        
        // SPHERE VOLUME DISTRIBUTION
        // Push particles to fill the volume, not just the surface
        if (d < targetRadius) {
          // Inside the sphere - apply gentle random forces to distribute
          const distributeForce = 5 * clampedDelta;
          
          // Random direction based on particle ID for consistent distribution
          const randX = Math.sin(i * 1.1 + s.time * 0.5);
          const randY = Math.cos(i * 1.3 + s.time * 0.3);
          const randZ = Math.sin(i * 1.7 + s.time * 0.4);
          
          vx += randX * distributeForce;
          vy += randY * distributeForce;
          vz += randZ * distributeForce;
          
          // Push away from center if too close (prevent point collapse)
          if (d < targetRadius * 0.2) {
            const pushOut = 30 * clampedDelta;
            vx -= (dx / d) * pushOut;
            vy -= (dy / d) * pushOut;
            vz -= (dz / d) * pushOut;
          }
        } else {
          // Outside the sphere - pull in faster
          const extraPull = 100 * clampedDelta / (d + 1);
          vx += (dx / d) * extraPull;
          vy += (dy / d) * extraPull;
          vz += (dz / d) * extraPull;
        }
        
        // GENTLE SWIRL - much slower, just for visual appeal, won't create ring
        const gentleSwirl = 3 * clampedDelta;
        vx += -dy * gentleSwirl * 0.1;
        vy += dx * gentleSwirl * 0.1;
        
        // Z-AXIS SPREAD - push particles into Z depth to prevent flat plane
        const zSpread = (Math.sin(i * 0.1 + s.time) * 0.5 + 0.5) * targetRadius;
        const targetZ = planetZ + (zSpread - targetRadius * 0.5);
        const zDiff = targetZ - pz;
        vz += zDiff * 3 * clampedDelta;
        
        // Add controlled noise for organic look
        const noise = 2 * clampedDelta;
        vx += (Math.random() - 0.5) * noise;
        vy += (Math.random() - 0.5) * noise;
        vz += (Math.random() - 0.5) * noise;
      }
      // 4. COMPRESS - Pull particles toward hand positions when pinching
      else if (gesture === 'COMPRESS' && anyPinched) {
        // Pull toward the center point between hands (or single hand)
        const dx = centerPos.x - px;
        const dy = centerPos.y - py;
        const dz = centerPos.z - pz;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
        
        const pullForce = 50 * clampedDelta / (d + 0.3);
        vx += dx * pullForce;
        vy += dy * pullForce;
        vz += dz * pullForce;
      }
      // 5. EXPAND - Scatter particles outward when releasing pinch
      else if (gesture === 'EXPAND') {
        const dx = px - centerPos.x;
        const dy = py - centerPos.y;
        const dz = pz - centerPos.z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
        
        const pushForce = 35 * clampedDelta;
        vx += (dx / d) * pushForce;
        vy += (dy / d) * pushForce;
        vz += (dz / d) * pushForce;
        
        // Add some randomness for scatter effect
        vx += (Math.random() - 0.5) * 15 * clampedDelta;
        vy += (Math.random() - 0.5) * 15 * clampedDelta;
        vz += (Math.random() - 0.5) * 15 * clampedDelta;
      }
      // 6. Hand influence during IDLE (subtle interaction)
      else if (gesture === 'IDLE') {
        // Left Hand interaction
        if (lPos) {
          const dx = lPos.x - px;
          const dy = lPos.y - py;
          const dz = lPos.z - pz;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
          
          if (d < interactionRadius) {
            // Pinched = attract, Open = gentle repel
            const baseForce = leftPinched ? 25.0 : -8.0;
            const falloff = Math.max(0, 1 - (d / interactionRadius));
            const f = (baseForce * falloff * clampedDelta) / (d + 0.3);
            vx += dx * f;
            vy += dy * f;
            vz += dz * f;
          }
        }
        
        // Right Hand interaction
        if (rPos) {
          const dx = rPos.x - px;
          const dy = rPos.y - py;
          const dz = rPos.z - pz;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
          
          if (d < interactionRadius) {
            const baseForce = rightPinched ? 25.0 : -8.0;
            const falloff = Math.max(0, 1 - (d / interactionRadius));
            const f = (baseForce * falloff * clampedDelta) / (d + 0.3);
            vx += dx * f;
            vy += dy * f;
            vz += dz * f;
          }
        }
      }

      // 7. EXPLOSION effect
      if (isExploding) {
          const dx = px - centerPos.x;
          const dy = py - centerPos.y;
          const dz = pz - centerPos.z;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
          
          const waveRadius = explosionAge * 25;
          const waveWidth = 6;
          const distToWave = Math.abs(d - waveRadius);
          
          if (distToWave < waveWidth) {
              const waveFalloff = 1 - (distToWave / waveWidth);
              const blast = (120 * clampedDelta * waveFalloff) / (d + 0.5);
              vx += (dx/d) * blast;
              vy += (dy/d) * blast;
              vz += (dz/d) * blast;
              
              const turbulence = 40 * clampedDelta * waveFalloff;
              vx += (Math.random()-0.5) * turbulence;
              vy += (Math.random()-0.5) * turbulence;
              vz += (Math.random()-0.5) * turbulence;
          }
      }

      // Velocity clamping
      const maxVel = 2.5;
      const velMag = Math.sqrt(vx*vx + vy*vy + vz*vz);
      if (velMag > maxVel) {
          const scale = maxVel / velMag;
          vx *= scale;
          vy *= scale;
          vz *= scale;
      }

      // Update positions
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