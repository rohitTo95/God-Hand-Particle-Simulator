import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import ParticleSystem from './components/ParticleSystem';
import HandTracker from './components/HandTracker';
import UIOverlay from './components/UIOverlay';
import { useStore } from './store';

const SceneContent: React.FC = () => {
    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <ParticleSystem />
            <OrbitControls 
                enablePan={false} 
                minDistance={10} 
                maxDistance={100} 
                autoRotate={false}
                autoRotateSpeed={0.5}
            />
            {/* Visual guide for center */}
            <mesh visible={false}>
                <sphereGeometry args={[0.5]} />
                <meshBasicMaterial color="white" wireframe />
            </mesh>
        </>
    );
}

const App: React.FC = () => {
  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Background UI & Hand Tracker */}
      <HandTracker />
      <UIOverlay />

      {/* 3D Scene */}
      <Canvas
        camera={{ position: [0, 0, 30], fov: 60 }}
        dpr={[1, 2]} // Handle high DPI screens
        gl={{ antialias: false, alpha: false }} // Optimization
      >
        <Suspense fallback={null}>
            <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default App;
