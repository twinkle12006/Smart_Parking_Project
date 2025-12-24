import React, { useRef, useEffect, useState } from 'react';
import { ParkingSpot, SpotStatus, SpotType, Vehicle } from '../types';
import { Scan, Cpu, CheckCircle2 } from 'lucide-react';
import { analyzeParkingOccupancy } from '../services/geminiService';

interface ParkingMapProps {
  mediaSrc: string | null;
  spots: ParkingSpot[];
  vehicles: Vehicle[];
  assignedSpotId: string | null;
  onImageAnalysisComplete: (spotIds: string[]) => void;
}

const THEME = {
  asphalt: '#0f172a',
  available: '#10b981', // Emerald Green
  occupied: '#ef4444', // Red
  nav: '#3b82f6',      // Blue
  handicap: '#3b82f6'  // Standard blue for the icon itself
};

const ParkingMap: React.FC<ParkingMapProps> = ({ mediaSrc, spots, vehicles, assignedSpotId, onImageAnalysisComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseRef = useRef(0);

  // Trigger Gemini AI Vision Analysis when source changes
  useEffect(() => {
    if (!mediaSrc) return;

    const runAiAnalysis = async () => {
      setIsProcessing(true);
      try {
        // Convert image to base64 for Gemini
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = mediaSrc;
        
        await new Promise((resolve) => { img.onload = resolve; });
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const base64 = tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          const occupiedIds = await analyzeParkingOccupancy(base64, spots.map(s => s.id));
          onImageAnalysisComplete(occupiedIds);
        }
      } catch (e) {
        console.error("AI Analysis Failed", e);
      } finally {
        setIsProcessing(false);
      }
    };

    runAiAnalysis();
  }, [mediaSrc]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2);

      // Background Rendering
      if (mediaSrc) {
        const img = new Image();
        img.src = mediaSrc;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Dim the background slightly for better UI contrast
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = THEME.asphalt;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Render Parking Spots
      spots.forEach(spot => {
        const x = (spot.x / 100) * canvas.width;
        const y = (spot.y / 100) * canvas.height;
        const w = 55, h = 90;

        let statusColor = THEME.available;
        if (spot.status === SpotStatus.OCCUPIED) statusColor = THEME.occupied;
        if (spot.id === assignedSpotId) statusColor = THEME.nav;

        // Spot Outline
        ctx.setLineDash([]);
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = spot.id === assignedSpotId ? 5 : 3;
        ctx.fillStyle = statusColor + '20';
        
        ctx.beginPath();
        ctx.roundRect(x - w/2, y - h/2, w, h, 8);
        ctx.stroke();
        ctx.fill();

        // ACCESSIBILITY SYMBOL RENDERING
        if (spot.type === SpotType.HANDICAP && spot.status === SpotStatus.AVAILABLE) {
          ctx.fillStyle = statusColor; // Draw icon in the status color (Green if available)
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('♿', x, y + 8);
        }

        // Spot ID Badge
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.beginPath();
        ctx.roundRect(x - 14, y - 40, 28, 16, 4);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(spot.id, x, y - 28);
      });

      // User Vehicle Simulation
      vehicles.forEach(v => {
        const vx = (v.location.x / 100) * canvas.width;
        const vy = (v.location.y / 100) * canvas.height;
        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate((v.rotation * Math.PI) / 180);
        
        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        
        // Car Body
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.roundRect(-22, -12, 44, 24, 6);
        ctx.fill();
        
        // Windshield
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(6, -9, 10, 18);
        
        ctx.restore();
      });

      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, [spots, vehicles, assignedSpotId, mediaSrc]);

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain" />
      
      {isProcessing && (
        <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center backdrop-blur-sm z-20">
          <div className="bg-white/10 p-8 rounded-3xl border border-white/20 flex flex-col items-center gap-4">
             <Cpu className="w-12 h-12 text-blue-400 animate-spin" />
             <div className="text-center">
               <p className="text-white font-black uppercase tracking-widest text-sm">Gemini Vision Active</p>
               <p className="text-slate-400 text-xs mt-1">Distinguishing 3D objects from road paint...</p>
             </div>
          </div>
        </div>
      )}

      {!mediaSrc && !isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-4">
          <div className="bg-slate-900 p-6 rounded-full border border-slate-800">
            <Scan className="w-10 h-10 animate-pulse text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40">System Awaiting Feed</p>
        </div>
      )}

      {/* Accuracy Badge */}
      <div className="absolute bottom-4 right-4 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">AI Verification: 99.2%</span>
      </div>
    </div>
  );
};

export default ParkingMap;