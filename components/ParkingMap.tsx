
import React, { useRef, useEffect } from 'react';
import { ParkingSpot, SpotStatus, Vehicle } from '../types';
import { Image as ImageIcon } from 'lucide-react';

interface ParkingMapProps {
  mediaSrc: string | null;
  mediaType: 'video' | 'image' | 'none';
  spots: ParkingSpot[];
  vehicles: Vehicle[];
  assignedSpotId: string | null;
  onImageAnalysisComplete?: (spotIds: string[]) => void;
  showDebugOverlay?: boolean;
  // Added missing props to fix TS errors in App.tsx
  isNavigating?: boolean;
  onActivityDetected?: (zoneIndex: number) => void;
  showHeatmap?: boolean;
}

const COLORS = {
  asphalt: '#1e293b',    
  green: '#10b981',
  red: '#ef4444',
  accent: '#2563eb',
  indicator: '#fbbf24'
};

const ParkingMap: React.FC<ParkingMapProps> = ({
  mediaSrc,
  mediaType,
  spots,
  vehicles,
  assignedSpotId,
  onImageAnalysisComplete,
  showDebugOverlay = false,
  // Destructure added props to maintain clean prop handling and fix intrinsic attributes errors
  isNavigating,
  onActivityDetected,
  showHeatmap
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef(0);

  // --- ROBUST UNIVERSAL DETECTION ENGINE ---
  useEffect(() => {
    // Every time mediaSrc changes, we must perform a fresh analysis
    if (mediaSrc && onImageAnalysisComplete && imageRef.current && spots.length > 0) {
      const img = imageRef.current;

      const analyze = () => {
        const anaCanvas = analysisCanvasRef.current;
        if (!anaCanvas) return;
        const ctx = anaCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Ensure we analyze at the original image's native resolution for maximum accuracy
        anaCanvas.width = img.naturalWidth || img.width;
        anaCanvas.height = img.naturalHeight || img.height;
        ctx.clearRect(0, 0, anaCanvas.width, anaCanvas.height);
        ctx.drawImage(img, 0, 0);

        const occupiedSpots: string[] = [];

        spots.forEach(spot => {
          // Calculate coordinates relative to the source image dimensions
          const x = (spot.x / 100) * anaCanvas.width;
          const y = (spot.y / 100) * anaCanvas.height;
          
          // Dynamic box sizing: optimized for a standard vehicle footprint (slightly smaller than the paint box)
          const w_px = Math.floor((48 / 800) * anaCanvas.width); 
          const h_px = Math.floor((80 / 600) * anaCanvas.height);

          try {
            const imageData = ctx.getImageData(x - w_px/2, y - h_px/2, w_px, h_px);
            const data = imageData.data;
            const pixelCount = data.length / 4;
            
            let totalIntensity = 0;
            let totalChroma = 0; // Measurement of color vibrancy (max(RGB) - min(RGB))
            let maxChroma = 0;
            let darkPixels = 0;
            let brightPixels = 0;

            // Step 1: Statistical Pixel Analysis
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i+1], b = data[i+2];
              const lum = 0.299*r + 0.587*g + 0.114*b;
              const chroma = Math.max(r,g,b) - Math.min(r,g,b);
              
              totalIntensity += lum;
              totalChroma += chroma;
              if (chroma > maxChroma) maxChroma = chroma;
              if (lum < 55) darkPixels++; // Potential shadow or dark paint
              if (lum > 200) brightPixels++; // Potential highlight or white paint
            }
            
            const avgIntensity = totalIntensity / pixelCount;
            const avgChroma = totalChroma / pixelCount;

            // Step 2: Texture & Edge Analysis (Variance)
            let varianceSum = 0;
            for (let i = 0; i < data.length; i += 4) {
              const lum = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
              varianceSum += Math.pow(lum - avgIntensity, 2);
            }
            const stdDev = Math.sqrt(varianceSum / pixelCount);

            /**
             * UNIVERSAL RECOGNITION HEURISTICS:
             * 
             * 1. THE VIBRANCY SIGNAL (Graphical Cars): 
             *    Graphical cars (like cartoons) have strong, saturated colors. 
             *    Road paint ('P', Lines) is ALWAYS grayscale (very low Chroma).
             * 
             * 2. THE TEXTURE SIGNAL (Real Photos):
             *    Cars have complex shapes (windshields, grilles, lights).
             *    Paint symbols are flat and uniform (low stdDev).
             * 
             * 3. THE SHADOW SIGNAL:
             *    Vehicles cast ambient occlusion shadows.
             */
            
            const hasVibrantColor = avgChroma > 12 || maxChroma > 45;
            const hasComplexTexture = stdDev > 9.5;
            const hasSignificantShadows = (darkPixels / pixelCount) > 0.08;
            
            // Immunity check for "P" symbols and road markings:
            // Symbols are bright, flat (low variance), and colorless.
            const isRoadPaint = avgIntensity > 165 && stdDev < 13 && avgChroma < 10;

            // Decision Matrix:
            // - If it's vibrant and textured, it's definitely a car.
            // - If it's dark and textured, it's a dark car.
            // - If it's vibrant but flat, it's likely a cartoon car.
            let occupied = false;

            if (!isRoadPaint) {
              if (hasVibrantColor && hasComplexTexture) occupied = true;
              else if (hasVibrantColor && avgIntensity < 220) occupied = true; // Saturated objects
              else if (hasComplexTexture && hasSignificantShadows) occupied = true; // Real car shadows
              else if (stdDev > 22) occupied = true; // Extremely busy area
            }

            if (occupied) {
              occupiedSpots.push(spot.id);
            }
          } catch (e) {
            console.error("Analysis slice failed", e);
          }
        });

        onImageAnalysisComplete(occupiedSpots);
      };

      // Trigger analysis only when image is fully decoded
      if (img.complete) {
        analyze();
      } else {
        img.onload = analyze;
      }
    }
  }, [mediaSrc, spots.length, onImageAnalysisComplete]); // mediaSrc is the key trigger

  // --- REAL-TIME RENDER LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);

      // Layer 1: Background Image/Asphalt
      if (mediaSrc && imageRef.current) {
        const img = imageRef.current;
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const ox = (canvas.width - img.width * scale) / 2;
        const oy = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);
      } else {
        ctx.fillStyle = COLORS.asphalt;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        for(let i=0; i<canvas.width; i+=40) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        }
      }

      // Layer 2: Parking Spots
      spots.forEach(spot => {
        const x = (spot.x / 100) * canvas.width;
        const y = (spot.y / 100) * canvas.height;
        const w = 54, h = 88;

        let color = COLORS.green;
        if (spot.status === SpotStatus.OCCUPIED) color = COLORS.red;
        if (spot.id === assignedSpotId) color = COLORS.accent;

        // Pulse effect for assigned spot
        if (spot.id === assignedSpotId) {
          ctx.shadowColor = COLORS.accent;
          ctx.shadowBlur = 10 + Math.sin(pulseRef.current) * 8;
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 4;
          ctx.strokeRect(x - w/2 - 2, y - h/2 - 2, w + 4, h + 4);
          ctx.shadowBlur = 0;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.fillStyle = color + '15';
        ctx.beginPath();
        ctx.roundRect(x - w/2, y - h/2, w, h, 6);
        ctx.stroke();
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(x - 13, y - 8, 26, 16, 3);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 9px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(spot.id, x, y + 4);

        if (showDebugOverlay && spot.status === SpotStatus.OCCUPIED) {
          ctx.fillStyle = color;
          ctx.font = 'bold 7px monospace';
          ctx.fillText('DETECTED', x, y + 20);
        }
      });

      // Layer 3: Dynamic User Vehicle
      vehicles.forEach(vehicle => {
        const vx = (vehicle.location.x / 100) * canvas.width;
        const vy = (vehicle.location.y / 100) * canvas.height;
        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate((vehicle.rotation * Math.PI) / 180);
        
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = vehicle.color;
        ctx.beginPath();
        ctx.roundRect(-22, -12, 44, 24, 4);
        ctx.fill();
        
        // Windshield highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(8, -9, 4, 18);
        ctx.restore();
      });

      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [spots, vehicles, assignedSpotId, mediaSrc, showDebugOverlay]);

  return (
    <div className="w-full h-full bg-slate-800 flex items-center justify-center relative overflow-hidden">
      {/* Hidden elements for processing */}
      <img 
        ref={imageRef} 
        src={mediaSrc || ''} 
        className="hidden" 
        alt="Source" 
        crossOrigin="anonymous" 
      />
      <canvas ref={analysisCanvasRef} className="hidden" />
      
      {/* Visible display canvas */}
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        className="w-full h-full object-contain" 
      />

      {!mediaSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
          <ImageIcon className="w-16 h-16 opacity-10 mb-2" />
          <p className="text-xs font-bold uppercase tracking-widest opacity-20">Idle Map Engine</p>
        </div>
      )}
    </div>
  );
};

export default ParkingMap;
