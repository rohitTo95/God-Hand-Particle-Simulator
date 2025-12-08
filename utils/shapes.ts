import * as THREE from 'three';
import { ShapeType } from '../types';

// Helper for random point in sphere
const randomInSphere = (radius: number) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi)
  );
};

export const generateParticles = (count: number, type: ShapeType): Float32Array => {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    let p = new THREE.Vector3();

    switch (type) {
      case ShapeType.SPHERE:
        p = randomInSphere(10);
        break;

      case ShapeType.CUBE:
        p.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        );
        break;

      case ShapeType.HEART:
        // Parametric heart
        const t = Math.random() * Math.PI * 2;
        const hR = Math.random() * 2; // thickness
        // Heart curve
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        // Add volume
        p.set(x, y, (Math.random() - 0.5) * 4);
        p.multiplyScalar(0.5); // Scale down
        // Randomize inside
        p.add(randomInSphere(0.5));
        break;

      case ShapeType.FLOWER:
        // Phyllotaxis
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = 0.5 * Math.sqrt(i);
        p.set(
            radius * Math.cos(angle), 
            radius * Math.sin(angle), 
            (Math.random() - 0.5) * (radius * 0.5) // Slight depth
        );
        p.multiplyScalar(0.4); 
        break;

      case ShapeType.SATURN:
        if (Math.random() > 0.4) {
          // Planet
          p = randomInSphere(4);
        } else {
          // Ring
          const rRing = 6 + Math.random() * 6;
          const thetaRing = Math.random() * Math.PI * 2;
          p.set(
            rRing * Math.cos(thetaRing),
            (Math.random() - 0.5) * 0.5, // Thin ring
            rRing * Math.sin(thetaRing)
          );
          // Tilt ring
          p.applyAxisAngle(new THREE.Vector3(1, 0, 1).normalize(), Math.PI / 6);
        }
        break;

      case ShapeType.GALAXY:
          const arms = 3;
          const spin = i / count * arms * Math.PI * 2;
          const dist = Math.random() * 15;
          p.set(
              Math.cos(spin + dist) * dist,
              (Math.random() - 0.5) * (20 / (dist + 1)), // Bulge at center
              Math.sin(spin + dist) * dist
          );
          break;

      case ShapeType.BUDDHA:
        // Approximated Meditating Figure using SDF logic (simplified constructive geometry)
        // We will rejection sample points to fit a rough shape
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 20) {
          const tryP = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 6
          );
          
          // Head (Sphere)
          const head = tryP.distanceTo(new THREE.Vector3(0, 4, 0)) < 1.5;
          // Body (Capsule/Sphere)
          const body = tryP.distanceTo(new THREE.Vector3(0, 0, 0)) < 3.5;
          // Legs (Crossed - roughly two flattened spheres at bottom)
          const legs = (tryP.y < -2 && tryP.y > -5 && Math.abs(tryP.x) < 4 && Math.abs(tryP.z) < 3);

          if (head || body || legs) {
            p = tryP;
            valid = true;
          }
          attempts++;
        }
        if (!valid) p = randomInSphere(3); // Fallback
        break;
        
      default:
        p = randomInSphere(10);
    }

    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }

  return positions;
};
