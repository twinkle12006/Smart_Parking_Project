import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Car, ShieldCheck, BarChart3, Navigation, Upload, 
  Settings, Zap, Info, Eye, LogIn
} from 'lucide-react';
import ParkingMap from './components/ParkingMap';
import { generateSpeech, playAudioBuffer } from './services/geminiService';
import { ParkingSpot, SpotType, SpotStatus, Vehicle } from './types';

const INITIAL_SPOTS: ParkingSpot[] = [
  { id: 'A1', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 15, y: 15, aisle: 'A' },
  { id: 'A2', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 30, y: 15, aisle: 'A' },
  { id: 'A3', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 45, y: 15, aisle: 'A' },
  { id: 'A4', type: SpotType.EV, status: SpotStatus.AVAILABLE, x: 60, y: 15, aisle: 'A' },
  { id: 'A5', type: SpotType.HANDICAP, status: SpotStatus.AVAILABLE, x: 75, y: 15, aisle: 'A' },
  { id: 'B1', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 15, y: 85, aisle: 'B' },
  { id: 'B2', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 30, y: 85, aisle: 'B' },
  { id: 'B3', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 45, y: 85, aisle: 'B' },
  { id: 'B4', type: SpotType.VIP, status: SpotStatus.AVAILABLE, x: 60, y: 85, aisle: 'B' },
  { id: 'B5', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 75, y: 85, aisle: 'B' },
];

export default function App() {
  const [view, setView] = useState<'driver' | 'admin'>('driver');
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>(INITIAL_SPOTS);
  const [userCar, setUserCar] = useState<Vehicle>({
    id: 'user', type: 'user', location: { x: 5, y: 50 }, rotation: 0, 
    targetSpotId: null, state: 'driving', color: '#3b82f6'
  });
  const [instruction, setInstruction] = useState("Control car with Arrow Keys.");
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set());
  const [sparkleActive, setSparkleActive] = useState(false);
  
  const lastVoiceRef = useRef<string>("");
  const voiceDebounceRef = useRef<number>(0);

  // Voice Instruction Utility
  const speakInstruction = async (text: string) => {
    if (text === lastVoiceRef.current) return;
    const now = Date.now();
    if (now - voiceDebounceRef.current < 3000) return; // Wait 3s between voice commands

    lastVoiceRef.current = text;
    voiceDebounceRef.current = now;
    const audio = await generateSpeech(text);
    if (audio) playAudioBuffer(audio);
  };

  // Input Handling
  useEffect(() => {
    const down = (e: KeyboardEvent) => setKeysPressed(prev => new Set(prev).add(e.key));
    const up = (e: KeyboardEvent) => setKeysPressed(prev => { const n = new Set(prev); n.delete(e.key); return n; });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Physics Loop
  useEffect(() => {
    const loop = setInterval(() => {
      setUserCar(prev => {
        if (prev.state === 'parked' || keysPressed.size === 0) return prev;
        let { x, y } = prev.location;
        let rot = prev.rotation;
        if (keysPressed.has('ArrowLeft')) rot -= 3;
        if (keysPressed.has('ArrowRight')) rot += 3;
        const rad = (rot * Math.PI) / 180;
        if (keysPressed.has('ArrowUp')) { x += Math.cos(rad) * 1.2; y += Math.sin(rad) * 1.2; }
        if (keysPressed.has('ArrowDown')) { x -= Math.cos(rad) * 0.8; y -= Math.sin(rad) * 0.8; }
        return { ...prev, location: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }, rotation: rot };
      });
    }, 20);
    return () => clearInterval(loop);
  }, [keysPressed]);

  // Real-time Navigation Logic
  useEffect(() => {
    if (!userCar.targetSpotId || userCar.state === 'parked') return;

    const target = spots.find(s => s.id === userCar.targetSpotId);
    if (!target) return;

    const dx = target.x - userCar.location.x;
    const dy = target.y - userCar.location.y;
    const distance = Math.hypot(dx, dy);

    // 1. ARRIVAL CHECK
    if (distance < 4) {
      setUserCar(prev => ({ ...prev, state: 'parked' }));
      setInstruction("You have arrived! Welcome.");
      speakInstruction("You have arrived at your parking spot. Have a wonderful day.");
      setSparkleActive(true);
      setTimeout(() => setSparkleActive(false), 3000);
      return;
    }

    // 2. DIRECTIONAL LOGIC
    const angleToTarget = (Math.atan2(dy, dx) * 180 / Math.PI);
    let angleDiff = (angleToTarget - userCar.rotation + 540) % 360 - 180;

    let cmd = "Keep going straight.";
    if (Math.abs(angleDiff) > 130) {
      cmd = "Reverse back carefully.";
    } else if (angleDiff > 25) {
      cmd = "Turn right.";
    } else if (angleDiff < -25) {
      cmd = "Turn left.";
    } else {
      cmd = "Drive straight ahead.";
    }

    setInstruction(cmd);
    
    // Only speak every few meters to avoid annoyance
    if (distance > 10) {
      speakInstruction(cmd);
    }

  }, [userCar.location, userCar.rotation, userCar.targetSpotId, spots]);

  const onAnalysisComplete = useCallback((occupiedIds: string[]) => {
    setSpots(prev => prev.map(s => ({
      ...s, 
      status: occupiedIds.includes(s.id) ? SpotStatus.OCCUPIED : SpotStatus.AVAILABLE
    })));
    setInstruction(`Feed analyzed. Found ${spots.length - occupiedIds.length} vacant positions.`);
  }, [spots.length]);

  const findSpot = async (type?: SpotType) => {
    const available = spots.filter(s => s.status === SpotStatus.AVAILABLE && (!type || s.type === type));
    if (available.length === 0) {
      setInstruction("Apologies, no vacant spots found for this request.");
      speakInstruction("No available spots found for your criteria.");
      return;
    }
    const best = available[0];
    setUserCar(v => ({...v, targetSpotId: best.id, state: 'driving'}));
    const msg = `Navigating to ${best.type} spot ${best.id}. Turn toward the blue path.`;
    setInstruction(msg);
    speakInstruction(`Setting navigation to ${best.type} spot ${best.id}. Follow my directions.`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-200">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter text-slate-800">SENTINELS <span className="text-blue-600">PARK</span></h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Precision Vision AI</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
            <button 
              onClick={() => setView('driver')} 
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${view === 'driver' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Navigation className="w-3.5 h-3.5" /> DRIVER
            </button>
            <button 
              onClick={() => setView('admin')} 
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${view === 'admin' ? 'bg-white shadow-lg text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> ADMIN
            </button>
          </div>
          <button className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xl hover:bg-black transition-colors">
            <LogIn className="w-4 h-4" /> LOGIN
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-8 flex flex-col lg:flex-row gap-8">
        <div className="flex-[2] flex flex-col gap-8">
          <div className="bg-white rounded-[32px] p-8 shadow-2xl shadow-slate-200/40 border border-slate-100 flex items-center justify-between transition-all">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center border border-blue-100 relative">
                <Navigation className="text-blue-600 w-8 h-8 animate-bounce" />
                {sparkleActive && <div className="absolute inset-0 bg-yellow-400/20 animate-ping rounded-3xl"></div>}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Live AI Navigation</p>
                <h2 className="text-2xl font-black text-slate-800">{instruction}</h2>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Current Capacity</p>
                <p className="text-xl font-black text-emerald-500">{spots.filter(s => s.status === SpotStatus.AVAILABLE).length} FREE</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center border border-emerald-100">
                <Eye className="text-emerald-500 w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[600px]">
            <ParkingMap 
              mediaSrc={mediaSrc} 
              spots={spots} 
              vehicles={[userCar]} 
              assignedSpotId={userCar.targetSpotId}
              onImageAnalysisComplete={onAnalysisComplete}
              showSparkles={sparkleActive}
            />
          </div>
        </div>

        <aside className="w-full lg:w-[420px] flex flex-col gap-8">
          {view === 'driver' ? (
            <div className="bg-white rounded-[40px] p-10 shadow-2xl shadow-slate-200/40 border border-slate-100 flex flex-col gap-10">
              <div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Driver Control</h3>
                <p className="text-slate-500 text-sm leading-relaxed">Experience hands-free parking. Our AI will guide you with voice commands from entry to engine off.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button onClick={() => findSpot()} className="group relative overflow-hidden bg-blue-600 hover:bg-blue-700 p-8 rounded-[24px] transition-all shadow-xl shadow-blue-200 flex items-center gap-6">
                  <div className="bg-white/20 p-4 rounded-2xl group-hover:scale-110 transition-transform">
                    <Car className="text-white w-8 h-8" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-black text-sm uppercase tracking-widest">Find Nearest</p>
                    <p className="text-blue-100 text-xs mt-1">Smart Route Generation</p>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => findSpot(SpotType.EV)} className="group bg-slate-900 hover:bg-black p-6 rounded-[24px] transition-all flex flex-col items-center gap-4 text-center">
                    <Zap className="text-emerald-400 w-8 h-8 group-hover:rotate-12 transition-transform" />
                    <span className="text-white font-bold text-[10px] uppercase tracking-widest">EV Power</span>
                  </button>
                  <button onClick={() => findSpot(SpotType.HANDICAP)} className="group bg-white hover:bg-slate-50 p-6 rounded-[24px] transition-all flex flex-col items-center gap-4 text-center border border-slate-200">
                    <div className="text-blue-600 text-3xl font-black group-hover:scale-110 transition-transform">♿</div>
                    <span className="text-slate-600 font-bold text-[10px] uppercase tracking-widest">Accessible</span>
                  </button>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-2 mb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Settings className="w-3.5 h-3.5" /> Simulator Pedals
                </div>
                <div className="flex flex-col items-center gap-2 scale-90">
                  <kbd className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-slate-400 shadow-md">↑</kbd>
                  <div className="flex gap-2">
                    <kbd className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-slate-400 shadow-md">←</kbd>
                    <kbd className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-slate-400 shadow-md">↓</kbd>
                    <kbd className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center font-black text-slate-400 shadow-md">→</kbd>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] p-10 shadow-2xl shadow-slate-200/40 border border-slate-100 flex flex-col gap-8">
              <div>
                <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  <BarChart3 className="text-blue-600 w-6 h-6" /> Management
                </h3>
                <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest font-bold">Live AI Site Control</p>
              </div>

              <div className="p-8 bg-slate-900 rounded-[32px] border border-slate-800 shadow-2xl relative overflow-hidden">
                <label className="relative group block border-2 border-dashed border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-800 transition-all">
                  <input type="file" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setMediaSrc(URL.createObjectURL(file));
                  }} />
                  <div className="bg-slate-800 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-600 transition-colors">
                    <Upload className="w-8 h-8 text-slate-500 group-hover:text-white" />
                  </div>
                  <p className="text-white font-black text-xs uppercase tracking-widest">Update AI Feed</p>
                </label>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-black">#</div>
                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Total Spots</span>
                  </div>
                  <span className="text-lg font-black text-slate-900">{spots.length}</span>
                </div>
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">%</div>
                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Occupancy</span>
                  </div>
                  <span className="text-lg font-black text-emerald-600">
                    {Math.round((spots.filter(s => s.status === SpotStatus.OCCUPIED).length / spots.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}