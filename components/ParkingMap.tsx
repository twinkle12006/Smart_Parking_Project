import React, { useRef, useEffect } from 'react';
import { ParkingSpot, SpotStatus, SpotType, Vehicle } from '../types';
import { Image as ImageIcon } from 'lucide-react';

interface ParkingMapProps {
  mediaSrc: string | null;
  mediaType: 'video' | 'image' | 'none';
  spots: ParkingSpot[];
  vehicles: Vehicle[];
  assignedSpotId: string | null;
  isNavigating?: boolean; // Controls visibility of non-target elements
  showHeatmap?: boolean;
  onActivityDetected?: (zoneIndex: number) => void;
  onImageAnalysisComplete?: (spotIds: string[]) => void;
  showDebugOverlay?: boolean; 
}

// Clean Modern Light Palette
const COLORS = {
  bg: '#cbd5e1',        // Slate 300 (Concrete / Map Ground)
  panel: '#ffffff',     // White
  accent: '#2563eb',    // Blue 600
  highlight: '#e2e8f0', // Slate 200
  text: '#0f172a',      // Slate 900
  textLight: '#64748b'
};

const ParkingMap: React.FC<ParkingMapProps> = ({
  mediaSrc,
  mediaType,
  spots,
  vehicles,
  assignedSpotId,
  isNavigating = false,
  showHeatmap = false,
  onActivityDetected,
  onImageAnalysisComplete,
  showDebugOverlay = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use Refs for animation values
  const scanLineY = useRef(0);
  const pulseFrame = useRef(0);

  // Auto-play video
  useEffect(() => {
    if (mediaType === 'video' && videoRef.current && mediaSrc) {
      videoRef.current.load();
      videoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
    }
  }, [mediaSrc, mediaType]);

  // --- Real Image Analysis (Deep Structure + Color Logic) ---
  useEffect(() => {
    if (mediaType === 'image' && mediaSrc && onImageAnalysisComplete && imageRef.current && spots.length > 0) {
      const img = imageRef.current;
      
      const analyze = () => {
        const anaCanvas = analysisCanvasRef.current;
        if (!anaCanvas) return;
        const ctx = anaCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Set canvas to match image dimensions for accurate sampling
        anaCanvas.width = img.width;
        anaCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const occupiedSpots: string[] = [];

        spots.forEach(spot => {
          // Convert percentage coordinates to pixel coordinates
          const x = (spot.x / 100) * img.width;
          const y = (spot.y / 100) * img.height;
          // Sample box size
          const w_px = Math.floor((50 / 800) * img.width); 
          const h_px = Math.floor((80 / 600) * img.height);

          try {
            const imageData = ctx.getImageData(x - w_px/2, y - h_px/2, w_px, h_px);
            const data = imageData.data;
            const len = data.length;
            
            let deepDarkPixels = 0; // Tires, Windshields, Shadows (Lum < 35)
            let highSatPixels = 0;  // Colorful car paint (Sat > 0.20)
            const count = len / 4;

            for (let i = 0; i < len; i += 4) {
              const r = data[i];
              const g = data[i+1];
              const b = data[i+2];

              // Luminance
              const lum = 0.299*r + 0.587*g + 0.114*b;

              // Saturation
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              let sat = 0;
              if (max > 0) sat = (max - min) / max;

              // --- CRITICAL REFINEMENT ---
              
              // 1. Deep Dark Detection (The 3D Object Anchor)
              // Asphalt/Concrete is usually gray (> 60-80 Lum). 
              // Tires/Windshields/Undercarriage are BLACK (< 35 Lum).
              // Painted 'P' is WHITE (> 200 Lum).
              if (lum < 35) {
                deepDarkPixels++;
              }

              // 2. Color Detection
              // Cars often have color. Road and White Paint do not.
              if (sat > 0.20) {
                highSatPixels++;
              }
            }

            const darkRatio = deepDarkPixels / count;
            const satRatio = highSatPixels / count;

            // --- DECISION LOGIC ---
            
            // It is occupied IF:
            // A) It is colorful (e.g. Red, Blue, Green car)
            //    -> satRatio > 0.10 (10% of pixels are colorful)
            // B) It has deep dark structure (e.g. White/Black/Silver car with tires/windows)
            //    -> darkRatio > 0.015 (1.5% of pixels are pitch black)
            
            // A painted 'P' is White on Grey. 
            // It has Low Saturation (~0) AND Low Dark Pixels (~0).
            // It will FAIL both checks and correctly show as AVAILABLE.

            const isOccupied = satRatio > 0.10 || darkRatio > 0.015;

            if (isOccupied) {
               occupiedSpots.push(spot.id);
            }

          } catch (e) {
            console.warn("Analysis failed for spot", spot.id);
          }
        });

        onImageAnalysisComplete(occupiedSpots);
      };

      if (img.complete) {
        analyze();
      } else {
        img.onload = analyze;
      }
    }
  }, [mediaSrc, mediaType, spots.length, onImageAnalysisComplete]);

  // --- Computer Vision Simulation (Video) ---
  useEffect(() => {
    if (mediaType !== 'video' || !onActivityDetected) return;
    const interval = setInterval(() => {
       // Simple simulation for video mode
       if (Math.random() > 0.95) onActivityDetected(0);
    }, 1000);
    return () => clearInterval(interval);
  }, [mediaSrc, mediaType, onActivityDetected]);

  // --- Rendering Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Background Image 
      if (mediaType === 'image' && imageRef.current && mediaSrc) {
        const img = imageRef.current;
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      } else {
         ctx.fillStyle = COLORS.bg;
         ctx.fillRect(0,0, canvas.width, canvas.height);
      }

      // Heatmap Overlay
      if (showHeatmap) {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(255, 0, 0, 0.1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 255, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      pulseFrame.current = (pulseFrame.current + 0.1) % (Math.PI * 2);

      // Draw Spots
      spots.forEach(spot => {
        const x = (spot.x / 100) * canvas.width;
        const y = (spot.y / 100) * canvas.height;
        const w = 60;
        const h = 100;

        let color = '#10b981'; // Green
        if (spot.status === SpotStatus.OCCUPIED) color = '#ef4444'; // Red
        
        if (spot.id === assignedSpotId) color = COLORS.accent; // Blue
        if (spot.status === SpotStatus.AVAILABLE && (spot.type === SpotType.HANDICAP || spot.type === SpotType.EV)) {
            color = '#0ea5e9';
        }

        // --- Spot Rendering ---
        
        // 1. Reserved Glow (High visibility for target)
        if (spot.id === assignedSpotId) {
          ctx.shadowColor = COLORS.accent;
          ctx.shadowBlur = 40;
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.roundRect(x - w/2 - 5, y - h/2 - 5, w + 10, h + 10, 8);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 2. The Spot Box
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.fillStyle = spot.status === SpotStatus.OCCUPIED ? color + '60' : color + '30'; 
        
        // Draw Box
        ctx.beginPath();
        ctx.roundRect(x - w/2, y - h/2, w, h, 8);
        ctx.stroke();
        ctx.fill();
        
        // Label
        if (showDebugOverlay || !isNavigating || spot.id === assignedSpotId) {
          ctx.fillStyle = COLORS.panel;
          ctx.font = 'bold 14px Inter';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 4;
          ctx.fillText(spot.id, x, y - 5);
          ctx.shadowBlur = 0;
          
          if (showDebugOverlay) {
             ctx.font = '10px monospace';
             ctx.fillStyle = 'white';
             ctx.fillText(spot.status === SpotStatus.OCCUPIED ? 'OCC' : 'OPEN', x, y + 15);
          }
        }
      });

      // Draw Path Line to Target (DASHED-DOTTED LINE)
      vehicles.forEach(vehicle => {
        if (vehicle.type === 'user' && vehicle.targetSpotId && vehicle.state === 'driving') {
           const target = spots.find(s => s.id === vehicle.targetSpotId);
           if (target) {
              const vx = (vehicle.location.x / 100) * canvas.width;
              const vy = (vehicle.location.y / 100) * canvas.height;
              const tx = (target.x / 100) * canvas.width;
              const ty = (target.y / 100) * canvas.height;

              ctx.beginPath();
              
              // DASHED DOTTED PATTERN: [Dash, Space, Dot, Space]
              // Made prominent for "Directions" focus
              ctx.setLineDash([20, 10, 4, 10]); 
              ctx.lineDashOffset = -pulseFrame.current * 15; // Fast animation
              
              ctx.moveTo(vx, vy);
              ctx.lineTo(tx, vy); // Horizontal
              ctx.lineTo(tx, ty); // Vertical
              
              ctx.strokeStyle = COLORS.accent;
              ctx.lineWidth = 6; // Thicker line
              ctx.stroke();
              
              // Arrow Head
              ctx.setLineDash([]);
              const arrowSize = 12;
              ctx.fillStyle = COLORS.accent;
              ctx.beginPath();
              if (ty > vy) {
                  ctx.moveTo(tx, ty + arrowSize);
                  ctx.lineTo(tx - arrowSize, ty - arrowSize);
                  ctx.lineTo(tx + arrowSize, ty - arrowSize);
              } else {
                  ctx.moveTo(tx, ty - arrowSize);
                  ctx.lineTo(tx - arrowSize, ty + arrowSize);
                  ctx.lineTo(tx + arrowSize, ty + arrowSize);
              }
              ctx.fill();
           }
        }
      });

      // Draw Vehicles
      vehicles.forEach(vehicle => {
        const vx = (vehicle.location.x / 100) * canvas.width;
        const vy = (vehicle.location.y / 100) * canvas.height;

        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate((vehicle.rotation * Math.PI) / 180);

        const cWidth = 48;
        const cHeight = 26;
        
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = vehicle.color;
        ctx.beginPath();
        ctx.roundRect(-cWidth/2, -cHeight/2, cWidth, cHeight, 6);
        ctx.fill();

        ctx.fillStyle = '#0f172a'; 
        ctx.fillRect(-2, -cHeight/2 + 2, 12, cHeight - 4);
        
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#fef08a'; ctx.shadowBlur = 8;
        ctx.fillRect(cWidth/2 - 2, -cHeight/2 + 2, 3, 5);
        ctx.fillRect(cWidth/2 - 2, cHeight/2 - 7, 3, 5);

        ctx.restore();
      });

      // Scan Line
      if (mediaType === 'video' && mediaSrc) {
        scanLineY.current = (scanLineY.current + 2) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, scanLineY.current);
        ctx.lineTo(canvas.width, scanLineY.current);
        ctx.strokeStyle = `${COLORS.accent}66`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [spots, vehicles, assignedSpotId, showHeatmap, mediaSrc, mediaType, showDebugOverlay, isNavigating]);

  return (
    <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border group">
      {mediaType === 'video' && mediaSrc && (
        <video ref={videoRef} src={mediaSrc} className="absolute inset-0 w-full h-full object-cover opacity-50" muted loop playsInline crossOrigin="anonymous" />
      )}
      <img ref={imageRef} src={mediaSrc || ''} className="hidden" alt="Ref" crossOrigin="anonymous" />
      
      {!mediaSrc && (
        <div style={{ backgroundColor: COLORS.panel }} className="absolute inset-0 flex items-center justify-center">
           <div className="text-center">
             <ImageIcon style={{ color: COLORS.highlight }} className="w-12 h-12 mx-auto mb-2 opacity-50" />
             <p style={{ color: COLORS.text }} className="font-semibold">Waiting for Input</p>
             <p style={{ color: COLORS.textLight }} className="text-xs">Upload Site Image via Admin Panel</p>
           </div>
        </div>
      )}
      <canvas ref={analysisCanvasRef} className="hidden" />
      <canvas ref={canvasRef} width={800} height={600} className="absolute inset-0 w-full h-full z-10" />
    </div>
  );
};

export default ParkingMap;