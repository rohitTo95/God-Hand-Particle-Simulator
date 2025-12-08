import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';
import { HandData } from '../types';

const HandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { setHandTrackingReady, handDataRef } = useStore();
  const [error, setError] = useState<string | null>(null);
  
  // History for velocity calculation
  const historyRef = useRef<{
    lastLeftPos: { x: number, y: number } | null;
    lastRightPos: { x: number, y: number } | null;
    lastDistance: number;
    timestamp: number;
  }>({ lastLeftPos: null, lastRightPos: null, lastDistance: 0, timestamp: 0 });

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrameId: number;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });

        startWebcam();
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
        setError("Failed to load hand tracking model.");
      }
    };

    const startWebcam = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Camera not supported.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480, facingMode: "user" } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', predictWebcam);
        }
        setHandTrackingReady(true);
      } catch (err) {
        console.error(err);
        setError("Camera access denied.");
      }
    };

    const predictWebcam = () => {
      if (!handLandmarker || !videoRef.current) return;
      
      const startTimeMs = performance.now();
      if (videoRef.current.currentTime > 0) {
        const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);
        processResults(results, startTimeMs);
      }
      
      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    const processResults = (results: any, time: number) => {
      const data: HandData = {
        left: null,
        right: null,
        distance: 0,
        centerX: 0,
        centerY: 0,
        centerZ: 0,
        rotation: 0,
        gesture: 'IDLE'
      };

      // Helper to convert screen coords (0-1) to roughly world coords (-10 to 10)
      const toWorld = (val: number, isX = false) => (val - 0.5) * (isX ? -30 : -20); // Flip X for mirror effect

      if (results.landmarks) {
        // Identify hands. Multi-hand landmarks don't guarantee order.
        const hands = results.landmarks;
        
        let leftHandLm = null;
        let rightHandLm = null;

        if (hands.length === 1) {
            const h = hands[0];
            const avgX = h[0].x; // Wrist
            if (avgX > 0.5) leftHandLm = h; // Mirror view: user's left is screen right
            else rightHandLm = h;
        } else if (hands.length === 2) {
            // Sort by x. Small x is Right (screen left), Large x is Left (screen right)
            const h1 = hands[0];
            const h2 = hands[1];
            if (h1[0].x < h2[0].x) {
                rightHandLm = h1;
                leftHandLm = h2;
            } else {
                rightHandLm = h2;
                leftHandLm = h1;
            }
        }

        if (leftHandLm) {
            // Index 9 is middle finger knuckle, 0 is wrist
            data.left = {
                x: toWorld(leftHandLm[9].x, true),
                y: toWorld(leftHandLm[9].y),
                z: 0, 
                isOpen: isHandOpen(leftHandLm)
            };
        }
        
        if (rightHandLm) {
            data.right = {
                x: toWorld(rightHandLm[9].x, true),
                y: toWorld(rightHandLm[9].y),
                z: 0,
                isOpen: isHandOpen(rightHandLm)
            };
        }

        // Gesture Logic
        if (data.left && data.right) {
            const dx = data.right.x - data.left.x; // Right hand X is usually positive, Left negative.
            const dy = data.right.y - data.left.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            data.distance = dist;
            data.centerX = (data.left.x + data.right.x) / 2;
            data.centerY = (data.left.y + data.right.y) / 2;
            
            // Calculate rotation (angle of vector between hands)
            // Normal horizontal hands: dy=0. Angle ~ 0.
            // Right hand above left: angle positive?
            data.rotation = Math.atan2(dy, dx);

            // CONTROL MODE: Both hands closed (Fists)
            if (!data.left.isOpen && !data.right.isOpen) {
                data.gesture = 'CONTROL';
            } else {
                // Dynamic gestures
                const dt = (time - historyRef.current.timestamp) / 1000; // seconds
                
                if (dt > 0.05) { 
                    const prevDist = historyRef.current.lastDistance;
                    const distRate = (dist - prevDist) / dt;

                    // Detect Collapse (High negative closing speed + small distance)
                    if (distRate < -15 && dist < 5) {
                        data.gesture = 'COLLAPSE';
                    }
                    // Detect Expand
                    else if (distRate > 5 && dist > 5) {
                        data.gesture = 'EXPAND';
                    }
                    // Detect Compress
                    else if (distRate < -2 && dist > 3) {
                        data.gesture = 'COMPRESS';
                    }
                    // Detect Planet Circle (Hands holding a ball)
                    else if (Math.abs(distRate) < 2 && dist > 3 && dist < 12) {
                        data.gesture = 'CIRCLE';
                    } else {
                        data.gesture = 'IDLE';
                    }

                    historyRef.current = {
                        lastLeftPos: { x: data.left.x, y: data.left.y },
                        lastRightPos: { x: data.right.x, y: data.right.y },
                        lastDistance: dist,
                        timestamp: time
                    };
                } else {
                     // Keep previous gesture if time step is too small, but override if CONTROL (stateless)
                     if (handDataRef.current.gesture !== 'CONTROL') {
                         data.gesture = handDataRef.current.gesture;
                     }
                }
            }
        }
      }

      // Update global ref
      handDataRef.current = data;
    };

    // Heuristic for open hand: Tips of fingers are far from wrist
    // Improved slightly to prevent false positives for fist
    const isHandOpen = (landmarks: any[]) => {
        const wrist = landmarks[0];
        // Check Middle Finger Tip (12) and Index Finger Tip (8)
        const middleTip = landmarks[12];
        const indexTip = landmarks[8];
        
        const distMiddle = Math.sqrt(Math.pow(wrist.x - middleTip.x, 2) + Math.pow(wrist.y - middleTip.y, 2));
        const distIndex = Math.sqrt(Math.pow(wrist.x - indexTip.x, 2) + Math.pow(wrist.y - indexTip.y, 2));
        
        // Threshold around 0.15 seems okay for "Open" vs "Closed" in normalized coords
        // Usually a fist is < 0.1 for tips to wrist
        return (distMiddle > 0.15 || distIndex > 0.15); 
    };

    setupMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [setHandTrackingReady, handDataRef]);

  return (
    <div className="absolute bottom-4 left-4 z-50 w-48 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg bg-black/50 backdrop-blur-sm">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto opacity-80" />
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-xs p-2 text-center">{error}</div>}
      <div className="absolute bottom-0 w-full bg-black/60 text-[10px] text-white/70 px-2 py-1 text-center">
        Camera Feed
      </div>
    </div>
  );
};

export default HandTracker;