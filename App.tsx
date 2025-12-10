import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import ParticleSystem from './components/ParticleSystem';
import HandTracker from './components/HandTracker';
import UIOverlay from './components/UIOverlay';

const SceneContent: React.FC = () => {
    return (
        <>
            <ambientLight intensity={0.9} />
            <pointLight position={[10, 10, 10]} intensity={10} />
            <Stars radius={100} depth={50} count={1000} factor={4} saturation={0} fade={true} speed={1} />
            <ParticleSystem />
            <OrbitControls 
                enablePan={false} 
                minDistance={10} 
                maxDistance={100} 
                autoRotate={true}
                autoRotateSpeed={0.6}
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
