import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';
import { HandData } from '../types';

// Smoothing filter class for hand positions
class SmoothingFilter {
  private history: { x: number; y: number; z: number }[] = [];
  private readonly windowSize: number;

  constructor(windowSize = 5) {
    this.windowSize = windowSize;
  }

  add(point: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    this.history.push({ ...point });
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    return this.getSmoothed();
  }

  getSmoothed(): { x: number; y: number; z: number } {
    if (this.history.length === 0) return { x: 0, y: 0, z: 0 };
    
    let totalWeight = 0;
    let sumX = 0, sumY = 0, sumZ = 0;
    
    this.history.forEach((point, i) => {
      const weight = i + 1;
      totalWeight += weight;
      sumX += point.x * weight;
      sumY += point.y * weight;
      sumZ += point.z * weight;
    });

    return {
      x: sumX / totalWeight,
      y: sumY / totalWeight,
      z: sumZ / totalWeight
    };
  }

  reset() {
    this.history = [];
  }
}

// Gesture detector based on finger pinch states
class GestureDetector {
  private currentGesture: HandData['gesture'] = 'IDLE';
  private gestureStartTime = 0;
  private pinchHistory: { leftPinched: boolean; rightPinched: boolean; distance: number }[] = [];
  private readonly historySize = 10;
  private pendingGesture: HandData['gesture'] = 'IDLE';
  private pendingCount = 0;
  private readonly confirmationThreshold = 4;

  addFrame(leftPinched: boolean, rightPinched: boolean, distance: number) {
    this.pinchHistory.push({ leftPinched, rightPinched, distance });
    if (this.pinchHistory.length > this.historySize) {
      this.pinchHistory.shift();
    }
  }

  // Check if recently transitioned from pinched to open
  wasRecentlyReleased(): boolean {
    if (this.pinchHistory.length < 4) return false;
    const recent = this.pinchHistory.slice(-4);
    // Was pinched in earlier frames, now released
    const wasPinched = recent[0].leftPinched || recent[0].rightPinched;
    const nowReleased = !recent[3].leftPinched && !recent[3].rightPinched;
    return wasPinched && nowReleased;
  }

  // Check if recently transitioned from open to pinched
  wasRecentlyPinched(): boolean {
    if (this.pinchHistory.length < 4) return false;
    const recent = this.pinchHistory.slice(-4);
    // Was open in earlier frames, now pinched
    const wasOpen = !recent[0].leftPinched && !recent[0].rightPinched;
    const nowPinched = recent[3].leftPinched || recent[3].rightPinched;
    return wasOpen && nowPinched;
  }

  detectGesture(
    left: { x: number; y: number; z: number; isOpen: boolean; isPinched: boolean } | null,
    right: { x: number; y: number; z: number; isOpen: boolean; isPinched: boolean } | null,
    distance: number,
    time: number
  ): HandData['gesture'] {
    const leftPinched = left?.isPinched ?? false;
    const rightPinched = right?.isPinched ?? false;
    const leftOpen = left?.isOpen ?? false;
    const rightOpen = right?.isOpen ?? false;
    const bothHands = left !== null && right !== null;
    
    this.addFrame(leftPinched, rightPinched, distance);
    
    let detectedGesture: HandData['gesture'] = 'IDLE';

    if (bothHands) {
      // COMPRESS: Either hand is pinching (fingers closed together)
      if (leftPinched || rightPinched) {
        detectedGesture = 'COMPRESS';
      }
      // EXPAND: Both hands open (fingers spread) - release after pinch
      else if (leftOpen && rightOpen && this.wasRecentlyReleased()) {
        detectedGesture = 'EXPAND';
      }
      // CIRCLE/PLANET MODE: Both hands open, stable distance (forming a sphere shape)
      else if (leftOpen && rightOpen && distance > 5 && distance < 18) {
        detectedGesture = 'CIRCLE';
      }
      // COLLAPSE: Hands very close together and moving inward fast
      else if (distance < 4) {
        detectedGesture = 'COLLAPSE';
      }
    } else if (left || right) {
      // Single hand gestures
      const hand = left || right;
      if (hand?.isPinched) {
        detectedGesture = 'COMPRESS';
      } else if (hand?.isOpen) {
        detectedGesture = 'IDLE';
      }
    }

    // Apply hysteresis
    if (detectedGesture === this.pendingGesture) {
      this.pendingCount++;
    } else {
      this.pendingGesture = detectedGesture;
      this.pendingCount = 1;
    }

    // COMPRESS and COLLAPSE are instant
    if (detectedGesture === 'COMPRESS' || detectedGesture === 'COLLAPSE') {
      this.currentGesture = detectedGesture;
      this.gestureStartTime = time;
    }
    // EXPAND is instant when detected (after release)
    else if (detectedGesture === 'EXPAND') {
      this.currentGesture = detectedGesture;
      this.gestureStartTime = time;
    }
    // CIRCLE needs confirmation
    else if (this.pendingCount >= this.confirmationThreshold) {
      if (this.currentGesture !== this.pendingGesture) {
        this.currentGesture = this.pendingGesture;
        this.gestureStartTime = time;
      }
    }
    // Quick transition from COMPRESS to IDLE/EXPAND
    else if (this.currentGesture === 'COMPRESS' && !leftPinched && !rightPinched) {
      if (this.pendingCount >= 2) {
        this.currentGesture = this.pendingGesture;
        this.gestureStartTime = time;
      }
    }

    return this.currentGesture;
  }

  reset() {
    this.currentGesture = 'IDLE';
    this.pinchHistory = [];
    this.pendingCount = 0;
    this.pendingGesture = 'IDLE';
  }
}

const HandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setHandTrackingReady, handDataRef } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string>('IDLE');
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugInfo, setDebugInfo] = useState({ left: false, right: false });
  
  const leftFilter = useRef(new SmoothingFilter(5));
  const rightFilter = useRef(new SmoothingFilter(5));
  const gestureDetector = useRef(new GestureDetector());
  const lastUIUpdate = useRef(0);

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
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
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
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 }, 
            facingMode: "user",
            frameRate: { ideal: 30 }
          } 
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
        drawLandmarks(results);
      }
      
      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    const drawLandmarks = (results: any) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks) {
        for (const landmarks of results.landmarks) {
          // Draw finger tips
          const tipIndices = [4, 8, 12, 16, 20];
          tipIndices.forEach(idx => {
            const lm = landmarks[idx];
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 6, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0, 255, 200, 0.9)';
            ctx.fill();
          });

          // Draw palm center
          const palm = landmarks[9];
          ctx.beginPath();
          ctx.arc(palm.x * canvas.width, palm.y * canvas.height, 10, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 100, 255, 0.8)';
          ctx.fill();

          // Draw thumb tip specially (pinch reference)
          const thumb = landmarks[4];
          ctx.beginPath();
          ctx.arc(thumb.x * canvas.width, thumb.y * canvas.height, 8, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
          ctx.fill();
        }
      }
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

      const toWorld = (val: number, isX = false) => (val - 0.5) * (isX ? -30 : -20);

      if (results.landmarks && results.landmarks.length > 0) {
        const hands = results.landmarks;
        
        let leftHandLm = null;
        let rightHandLm = null;

        if (hands.length === 1) {
          const h = hands[0];
          const avgX = h[0].x;
          if (avgX > 0.5) leftHandLm = h;
          else rightHandLm = h;
        } else if (hands.length >= 2) {
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

        // Process left hand
        if (leftHandLm) {
          const rawPos = {
            x: toWorld(leftHandLm[9].x, true),
            y: toWorld(leftHandLm[9].y),
            z: leftHandLm[9].z * -10
          };
          const smoothedPos = leftFilter.current.add(rawPos);
          data.left = {
            ...smoothedPos,
            isOpen: isHandOpen(leftHandLm),
            isPinched: isHandPinched(leftHandLm)
          };
        } else {
          leftFilter.current.reset();
        }
        
        // Process right hand
        if (rightHandLm) {
          const rawPos = {
            x: toWorld(rightHandLm[9].x, true),
            y: toWorld(rightHandLm[9].y),
            z: rightHandLm[9].z * -10
          };
          const smoothedPos = rightFilter.current.add(rawPos);
          data.right = {
            ...smoothedPos,
            isOpen: isHandOpen(rightHandLm),
            isPinched: isHandPinched(rightHandLm)
          };
        } else {
          rightFilter.current.reset();
        }

        // Calculate distance and center
        if (data.left && data.right) {
          const dx = data.right.x - data.left.x;
          const dy = data.right.y - data.left.y;
          const dz = data.right.z - data.left.z;
          
          data.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          data.centerX = (data.left.x + data.right.x) / 2;
          data.centerY = (data.left.y + data.right.y) / 2;
          data.centerZ = (data.left.z + data.right.z) / 2;
          data.rotation = Math.atan2(dy, dx);
        }

        // Detect gesture
        data.gesture = gestureDetector.current.detectGesture(
          data.left,
          data.right,
          data.distance,
          time
        );
      } else {
        leftFilter.current.reset();
        rightFilter.current.reset();
        gestureDetector.current.reset();
      }

      handDataRef.current = data;

      // Throttled UI update
      if (time - lastUIUpdate.current > 100) {
        setCurrentGesture(data.gesture);
        setHandsDetected(results.landmarks?.length || 0);
        setDebugInfo({
          left: data.left?.isPinched ?? false,
          right: data.right?.isPinched ?? false
        });
        lastUIUpdate.current = time;
      }
    };

    // Detect if all fingers are pinched together (closed fist / grabbing)
    const isHandPinched = (landmarks: any[]): boolean => {
      const palm = landmarks[9]; // Middle finger MCP
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];

      // Calculate average distance of all fingertips to palm center
      const tips = [thumbTip, indexTip, middleTip, ringTip, pinkyTip];
      let avgDist = 0;
      
      for (const tip of tips) {
        const dist = Math.sqrt(
          Math.pow(palm.x - tip.x, 2) + 
          Math.pow(palm.y - tip.y, 2)
        );
        avgDist += dist;
      }
      avgDist /= tips.length;

      // Also check if fingertips are close to each other (grouped)
      const indexToThumb = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) + 
        Math.pow(thumbTip.y - indexTip.y, 2)
      );

      // Pinched if fingertips are close to palm AND to each other
      return avgDist < 0.12 || indexToThumb < 0.06;
    };

    // Detect if hand is open (fingers spread)
    const isHandOpen = (landmarks: any[]): boolean => {
      const wrist = landmarks[0];
      
      const fingerTips = [
        { tip: landmarks[8], pip: landmarks[6] },
        { tip: landmarks[12], pip: landmarks[10] },
        { tip: landmarks[16], pip: landmarks[14] },
        { tip: landmarks[20], pip: landmarks[18] }
      ];

      let extendedFingers = 0;
      
      for (const finger of fingerTips) {
        const tipDist = Math.sqrt(
          Math.pow(wrist.x - finger.tip.x, 2) + 
          Math.pow(wrist.y - finger.tip.y, 2)
        );
        const pipDist = Math.sqrt(
          Math.pow(wrist.x - finger.pip.x, 2) + 
          Math.pow(wrist.y - finger.pip.y, 2)
        );
        
        if (tipDist > pipDist + 0.02) {
          extendedFingers++;
        }
      }

      // Thumb check
      const thumbTip = landmarks[4];
      const thumbBase = landmarks[2];
      const thumbDist = Math.sqrt(
        Math.pow(thumbBase.x - thumbTip.x, 2) + 
        Math.pow(thumbBase.y - thumbTip.y, 2)
      );
      if (thumbDist > 0.06) {
        extendedFingers++;
      }

      return extendedFingers >= 3;
    };

    setupMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [setHandTrackingReady, handDataRef]);

  const getGestureStyle = (gesture: string) => {
    const styles: Record<string, { bg: string; text: string; glow: string; icon: string }> = {
      'IDLE': { bg: 'bg-gray-600/80', text: 'text-gray-300', glow: '', icon: '✋' },
      'CONTROL': { bg: 'bg-purple-600/90', text: 'text-purple-100', glow: 'shadow-lg shadow-purple-500/50', icon: '🎮' },
      'EXPAND': { bg: 'bg-green-600/90', text: 'text-green-100', glow: 'shadow-lg shadow-green-500/50', icon: '💥' },
      'COMPRESS': { bg: 'bg-orange-600/90', text: 'text-orange-100', glow: 'shadow-lg shadow-orange-500/50', icon: '✊' },
      'CIRCLE': { bg: 'bg-blue-600/90', text: 'text-blue-100', glow: 'shadow-lg shadow-blue-500/50', icon: '🌍' },
      'COLLAPSE': { bg: 'bg-red-600/90', text: 'text-red-100', glow: 'shadow-lg shadow-red-500/50 animate-pulse', icon: '💫' }
    };
    return styles[gesture] || styles['IDLE'];
  };

  const gestureStyle = getGestureStyle(currentGesture);

  return (
    <div className="absolute bottom-4 left-4 z-50 w-60 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black/70 backdrop-blur-md">
      <div className="relative">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-auto opacity-90 scale-x-[-1]" 
        />
        <canvas 
          ref={canvasRef}
          className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none"
        />
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-400 text-xs p-3 text-center">
            <div>
              <div className="text-red-500 text-lg mb-1">⚠️</div>
              {error}
            </div>
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-2">
        {/* Hands detected + pinch status */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/60">Hands:</span>
          <div className="flex gap-2">
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200 ${
              handsDetected >= 1 ? (debugInfo.left ? 'bg-orange-500 text-white' : 'bg-green-500 text-white') : 'bg-gray-700 text-gray-500'
            }`}>L {debugInfo.left ? '✊' : '✋'}</div>
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all duration-200 ${
              handsDetected >= 2 ? (debugInfo.right ? 'bg-orange-500 text-white' : 'bg-green-500 text-white') : 'bg-gray-700 text-gray-500'
            }`}>R {debugInfo.right ? '✊' : '✋'}</div>
          </div>
        </div>

        {/* Current gesture display */}
        <div className={`rounded-lg px-3 py-2 text-center transition-all duration-300 ${gestureStyle.bg} ${gestureStyle.glow}`}>
          <span className={`text-sm font-bold tracking-wide ${gestureStyle.text}`}>
            {gestureStyle.icon} {currentGesture}
          </span>
        </div>

        {/* Gesture hints */}
        <div className="text-[9px] text-white/50 leading-relaxed space-y-0.5">
          <div>✊ Pinch fingers → Compress</div>
          <div>✋ Open hand → Scatter/Expand</div>
          <div>🤲 Both hands open → Planet mode</div>
        </div>
      </div>
    </div>
  );
};

export default HandTracker;