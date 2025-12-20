import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Car, Activity, DollarSign, Search, Navigation, Upload, CloudLightning, Scan, Settings, CheckCircle, Keyboard
} from 'lucide-react';
import ParkingMap from './components/ParkingMap';
import { generateSpeech, playAudioBuffer, getNavigationInstruction, getAdminInsights } from './services/geminiService';
import { ParkingSpot, SpotType, SpotStatus, LogEntry, Vehicle } from './types';

// --- MOCK DATA ---
const INITIAL_SPOTS: ParkingSpot[] = [
  { id: 'A1', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 10, y: 15, aisle: 'A' },
  { id: 'A2', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 25, y: 15, aisle: 'A' },
  { id: 'A3', type: SpotType.EV, status: SpotStatus.AVAILABLE, x: 40, y: 15, aisle: 'A' },
  { id: 'A4', type: SpotType.HANDICAP, status: SpotStatus.OCCUPIED, x: 55, y: 15, aisle: 'A' },
  { id: 'A5', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 70, y: 15, aisle: 'A' },
  
  { id: 'B1', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 10, y: 85, aisle: 'B' },
  { id: 'B2', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 25, y: 85, aisle: 'B' },
  { id: 'B3', type: SpotType.VIP, status: SpotStatus.AVAILABLE, x: 40, y: 85, aisle: 'B' },
  { id: 'B4', type: SpotType.STANDARD, status: SpotStatus.AVAILABLE, x: 55, y: 85, aisle: 'B' },
  { id: 'B5', type: SpotType.STANDARD, status: SpotStatus.OCCUPIED, x: 70, y: 85, aisle: 'B' },
];

const MOCK_LOGS: LogEntry[] = [
  { id: 'L1', plate: 'ABC-1234', entryTime: '08:30 AM', duration: '2h 15m', status: 'Active' },
  { id: 'L2', plate: 'XYZ-9876', entryTime: '09:15 AM', duration: '1h 30m', status: 'Completed' },
  { id: 'L3', plate: 'LMN-4567', entryTime: 'Yesterday', duration: '26h 00m', status: 'Overstay' },
];

// Palette Constants - Clean Modern Light Theme
const COLORS = {
  bg: '#f8fafc',        // Slate 50 (Light Background)
  panel: '#ffffff',     // White (Cards)
  accent: '#2563eb',    // Blue 600 (Primary Action)
  highlight: '#e2e8f0', // Slate 200 (Borders)
  text: '#0f172a',      // Slate 900 (Primary Text - Dark)
  textLight: '#64748b'  // Slate 500 (Secondary Text)
};

// --- MAIN COMPONENT ---

export default function App() {
  // State
  const [view, setView] = useState<'driver' | 'admin'>('driver');
  
  // Media State
  const [mediaSrc, setMediaSrc] = useState<string | null>(null); 
  const [mediaType, setMediaType] = useState<'video' | 'image' | 'none'>('none');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  
  const [spots, setSpots] = useState<ParkingSpot[]>(INITIAL_SPOTS);
  
  // User Car State (Controlled via Keyboard)
  const [userCar, setUserCar] = useState<Vehicle>({
    id: 'user',
    type: 'user',
    location: { x: 5, y: 50 }, // Start at entrance (middle left)
    rotation: 0, // 0 Degrees = Facing Right (East)
    targetSpotId: null,
    state: 'driving',
    color: '#1e3a8a' // Dark Blue Car for contrast on light map
  });

  const [lastInstruction, setLastInstruction] = useState<string>("Use Arrow Keys to drive.");
  const [pricingMultiplier, setPricingMultiplier] = useState(1.0);
  const [adminInsight, setAdminInsight] = useState<string>("Generating insights...");
  const [keysPressed, setKeysPressed] = useState<Set<string>>(new Set());

  // Refs
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGuidanceTime = useRef<number>(0);
  const lastGuidanceLocation = useRef<{x: number, y: number} | null>(null);

  // --- KEYBOARD CONTROLS ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        setKeysPressed(prev => new Set(prev).add(e.key));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        setKeysPressed(prev => {
          const next = new Set(prev);
          next.delete(e.key);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- GAME LOOP & PHYSICS ---

  useEffect(() => {
    gameLoopRef.current = setInterval(() => {
      setUserCar(current => {
        if (current.state === 'parked') return current;

        let { x, y } = current.location;
        let rotation = current.rotation;
        
        // SPEED INCREASED to 1.5 (Was 0.5)
        const speed = 1.5; 
        const rotSpeed = 4; // Faster turning

        // Rotation logic
        if (keysPressed.has('ArrowLeft')) rotation -= rotSpeed;
        if (keysPressed.has('ArrowRight')) rotation += rotSpeed;
        
        // Convert deg to rad
        const rad = (rotation * Math.PI) / 180;

        // Movement logic (Standard Trig: 0deg is Right)
        if (keysPressed.has('ArrowUp')) {
          x += Math.cos(rad) * speed;
          y += Math.sin(rad) * speed;
        }
        if (keysPressed.has('ArrowDown')) {
          x -= Math.cos(rad) * speed;
          y -= Math.sin(rad) * speed;
        }

        // Boundary checks (0-100)
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        return { ...current, location: { x, y }, rotation };
      });
    }, 20); // 50fps

    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [keysPressed]);

  // --- NAVIGATION LOGIC ---

  useEffect(() => {
    const checkNavigation = async () => {
      if (!userCar.targetSpotId || userCar.state === 'parked') return;

      const target = spots.find(s => s.id === userCar.targetSpotId);
      if (!target) return;

      const dx = target.x - userCar.location.x;
      const dy = target.y - userCar.location.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      // Arrival Check (Threshold 4%)
      if (dist < 4) { 
        setUserCar(prev => ({ ...prev, state: 'parked' }));
        const msg = `You have arrived at spot ${target.id}. Parking complete.`;
        setLastInstruction("Arrived!");
        speak(msg);
        return;
      }

      // Guidance Trigger logic
      const now = Date.now();
      const timeDiff = now - lastGuidanceTime.current;
      
      let distMoved = 0;
      if (lastGuidanceLocation.current) {
        const mx = userCar.location.x - lastGuidanceLocation.current.x;
        const my = userCar.location.y - lastGuidanceLocation.current.y;
        distMoved = Math.sqrt(mx*mx + my*my);
      }

      // Speak if: 8s passed OR moved 5% units (Was 15%) since last instruction
      // Responsiveness increased for fast driving
      if (timeDiff > 8000 || (distMoved > 5 && timeDiff > 1000)) {
        lastGuidanceTime.current = now;
        lastGuidanceLocation.current = userCar.location;
        
        // UPDATED: Pass Rotation for better directional awareness
        const text = await getNavigationInstruction(userCar.location, target, spots, userCar.rotation);
        setLastInstruction(text);
        speak(text);
      }
    };

    const navInterval = setInterval(checkNavigation, 1000); // Check every second
    return () => clearInterval(navInterval);
  }, [userCar.location, userCar.targetSpotId, userCar.state, userCar.rotation, spots]);


  // --- ACTIONS ---

  const speak = async (text: string) => {
    const audioBuffer = await generateSpeech(text);
    if (audioBuffer) playAudioBuffer(audioBuffer);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setMediaSrc(url);
    
    // Determine type
    if (file.type.startsWith('image/')) {
       setMediaType('image');
       runImageAnalysis();
    } else if (file.type.startsWith('video/')) {
       setMediaType('video');
       setIsAnalyzing(false);
    }
  };

  const runImageAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisStep("Mapping road network...");
    
    setTimeout(() => setAnalysisStep("Generating parking bays..."), 1500);
    setTimeout(() => {
       setAnalysisStep("Scanning for vehicles...");
       setIsAnalyzing(false);
       
       // Generate Grid blindly first - Analysis in ParkingMap will detect occupancy
       const newSpots: ParkingSpot[] = [];
       const cols = 6;
       
       // Top Row (Aisle A)
       for (let c=0; c<cols; c++) {
         newSpots.push({
           id: `A${c+1}`,
           type: Math.random() > 0.8 ? SpotType.EV : SpotType.STANDARD,
           status: SpotStatus.AVAILABLE, // Default to available, pending scan
           x: 15 + (c * 14),
           y: 15, // Top edge
           aisle: 'A'
         });
       }

       // Bottom Row (Aisle B)
       for (let c=0; c<cols; c++) {
        newSpots.push({
          id: `B${c+1}`,
          type: Math.random() > 0.8 ? SpotType.HANDICAP : SpotType.STANDARD,
          status: SpotStatus.AVAILABLE, // Default to available, pending scan
          x: 15 + (c * 14),
          y: 85, // Bottom edge
          aisle: 'B'
        });
      }
      setSpots(newSpots);
    }, 2500);
  };

  const handleImageAnalysisComplete = useCallback((occupiedIds: string[]) => {
      setSpots(currentSpots => {
          return currentSpots.map(spot => ({
              ...spot,
              status: occupiedIds.includes(spot.id) ? SpotStatus.OCCUPIED : SpotStatus.AVAILABLE
          }));
      });
  }, []);

  const handleVideoActivity = useCallback((zoneIndex: number) => {
    // For video demo, random fluctuation
    setSpots(current => {
      const idx = Math.floor(Math.random() * current.length);
      const spot = current[idx];
      if (spot.id === userCar.targetSpotId) return current;

      const newSpots = [...current];
      newSpots[idx] = {
        ...spot,
        status: spot.status === SpotStatus.AVAILABLE ? SpotStatus.OCCUPIED : SpotStatus.AVAILABLE
      };
      return newSpots;
    });
  }, [userCar.targetSpotId]);

  const findSpot = (type?: SpotType) => {
    const availableSpots = spots.filter(s => 
      s.status === SpotStatus.AVAILABLE && (!type || s.type === type)
    );

    if (availableSpots.length === 0) {
      speak("No matching spots available.");
      return;
    }

    // Sort by proximity to the car (Euclidean distance)
    availableSpots.sort((a, b) => {
      const distA = Math.hypot(a.x - userCar.location.x, a.y - userCar.location.y);
      const distB = Math.hypot(b.x - userCar.location.x, b.y - userCar.location.y);
      return distA - distB;
    });

    const bestSpot = availableSpots[0];

    setSpots(curr => curr.map(s => s.id === bestSpot.id ? {...s, status: SpotStatus.RESERVED} : s));
    setUserCar(prev => ({ ...prev, targetSpotId: bestSpot.id, state: 'driving' })); 
    
    const msg = `Spot ${bestSpot.id} reserved. Following shortest path.`;
    speak(msg);
    setLastInstruction(`Drive to Spot ${bestSpot.id}`);
  };

  const findMyCar = () => {
    if (userCar.targetSpotId) {
        speak(`Your vehicle is parked at spot ${userCar.targetSpotId}.`);
    } else {
        speak("No active parking session found.");
    }
  };

  useEffect(() => {
    if (view === 'admin') {
      getAdminInsights({
        occupancyRate: Math.round((spots.filter(s => s.status === SpotStatus.OCCUPIED).length / spots.length) * 100),
        revenue: 1450,
        avgSearchTime: 45
      }, MOCK_LOGS).then(setAdminInsight);
    }
  }, [view]);

  // --- RENDERS ---

  const renderDriverView = () => (
    <div className="flex flex-col lg:flex-row h-full gap-6">
      <div className="flex-1 flex flex-col gap-4">
        {/* Navigation Header */}
        <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="p-4 rounded-xl border shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div style={{ backgroundColor: `${COLORS.accent}10` }} className="w-12 h-12 rounded-lg flex items-center justify-center">
                <Navigation style={{ color: COLORS.accent }} className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                 <h2 style={{ color: COLORS.textLight }} className="text-xs uppercase tracking-widest font-semibold">Navigation Assist</h2>
                 <p style={{ color: COLORS.text }} className="text-xl font-bold">{lastInstruction}</p>
              </div>
           </div>
           {userCar.state === 'driving' && (
             <div style={{ backgroundColor: COLORS.bg, color: COLORS.text }} className="hidden md:flex items-center gap-2 text-sm font-medium px-3 py-1 rounded border border-slate-200">
                <Keyboard className="w-4 h-4" /> Arrow Keys Enabled
             </div>
           )}
        </div>

        {/* Map Section */}
        <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="flex-1 relative rounded-xl overflow-hidden border shadow-sm group">
          <div className="absolute inset-0 cursor-crosshair">
             <ParkingMap 
              mediaSrc={mediaSrc} 
              mediaType={mediaType === 'image' ? 'none' : mediaType} 
              spots={spots} 
              vehicles={[userCar]} 
              assignedSpotId={userCar.targetSpotId}
              isNavigating={userCar.state === 'driving' && !!userCar.targetSpotId}
              onActivityDetected={handleVideoActivity}
            />
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="w-full lg:w-96 p-6 rounded-xl border flex flex-col gap-6 shadow-sm">
        <div style={{ borderColor: COLORS.highlight }} className="space-y-2 border-b pb-4">
          <h2 style={{ color: COLORS.text }} className="text-3xl font-bold tracking-tight">Welcome, Anya</h2>
          <div style={{ color: COLORS.textLight }} className="flex items-center gap-2 text-sm">
             <Car className="w-4 h-4" />
             <span>Tesla Model 3 • Dark Blue</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => findSpot(SpotType.STANDARD)} 
            style={{ backgroundColor: COLORS.accent }}
            className="flex flex-col items-center justify-center p-6 hover:opacity-90 transition-all rounded-xl shadow-sm group"
          >
            <Car style={{ color: 'white' }} className="w-8 h-8 mb-2" />
            <span style={{ color: 'white' }} className="text-sm font-bold">Find Spot</span>
          </button>
          
          <button 
            onClick={() => findSpot(SpotType.EV)} 
            style={{ backgroundColor: COLORS.accent }}
            className="flex flex-col items-center justify-center p-6 hover:opacity-90 transition-all rounded-xl shadow-sm group"
          >
            <span style={{ color: 'white' }} className="font-bold text-2xl mb-2">⚡</span>
            <span style={{ color: 'white' }} className="text-sm font-bold">EV Charger</span>
          </button>

          <button 
            onClick={() => findSpot(SpotType.HANDICAP)} 
            style={{ backgroundColor: COLORS.accent }}
            className="flex flex-col items-center justify-center p-6 hover:opacity-90 transition-all rounded-xl shadow-sm group"
          >
             <span style={{ color: 'white' }} className="font-bold text-2xl mb-2">♿</span>
            <span style={{ color: 'white' }} className="text-sm font-bold">Accessible</span>
          </button>

          <button 
            onClick={findMyCar} 
            style={{ backgroundColor: COLORS.highlight }}
            className="flex flex-col items-center justify-center p-6 hover:bg-slate-300 transition-all rounded-xl shadow-sm group"
          >
            <Search style={{ color: COLORS.text }} className="w-8 h-8 mb-2" />
            <span style={{ color: COLORS.text }} className="text-sm font-bold">Find My Car</span>
          </button>
        </div>

        <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="mt-auto p-4 rounded-lg border">
             <h3 style={{ color: COLORS.textLight }} className="text-xs font-bold uppercase mb-2">Keyboard Controls</h3>
             <div className="flex justify-center gap-2">
                 <div className="flex flex-col items-center gap-1">
                     <div style={{ backgroundColor: COLORS.highlight, borderColor: COLORS.panel, color: COLORS.text }} className={`w-8 h-8 rounded flex items-center justify-center border-b-4 ${keysPressed.has('ArrowUp') ? 'translate-y-1 border-0' : ''}`}>↑</div>
                     <div className="flex gap-1">
                         <div style={{ backgroundColor: COLORS.highlight, borderColor: COLORS.panel, color: COLORS.text }} className={`w-8 h-8 rounded flex items-center justify-center border-b-4 ${keysPressed.has('ArrowLeft') ? 'translate-y-1 border-0' : ''}`}>←</div>
                         <div style={{ backgroundColor: COLORS.highlight, borderColor: COLORS.panel, color: COLORS.text }} className={`w-8 h-8 rounded flex items-center justify-center border-b-4 ${keysPressed.has('ArrowDown') ? 'translate-y-1 border-0' : ''}`}>↓</div>
                         <div style={{ backgroundColor: COLORS.highlight, borderColor: COLORS.panel, color: COLORS.text }} className={`w-8 h-8 rounded flex items-center justify-center border-b-4 ${keysPressed.has('ArrowRight') ? 'translate-y-1 border-0' : ''}`}>→</div>
                     </div>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );

  const renderAdminView = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
         {/* Stats Cards */}
         <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="p-6 rounded-xl border shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start mb-4 relative z-10">
               <div style={{ backgroundColor: `${COLORS.accent}10` }} className="p-2 rounded-lg">
                 <Activity style={{ color: COLORS.accent }} className="w-6 h-6" />
               </div>
               <span className="text-xs font-bold bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded border border-emerald-500/20">Live</span>
            </div>
            <div style={{ color: COLORS.text }} className="text-3xl font-bold mb-1 relative z-10">
              {Math.round((spots.filter(s => s.status === SpotStatus.OCCUPIED).length / spots.length) * 100)}%
            </div>
            <p style={{ color: COLORS.textLight }} className="text-sm relative z-10">Current Occupancy</p>
         </div>

         <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="p-6 rounded-xl border shadow-sm">
            <div className="flex justify-between items-start mb-4">
               <div style={{ backgroundColor: `${COLORS.accent}10` }} className="p-2 rounded-lg">
                 <DollarSign style={{ color: COLORS.accent }} className="w-6 h-6" />
               </div>
            </div>
            <div style={{ color: COLORS.text }} className="text-3xl font-bold mb-1">$1,450</div>
            <p style={{ color: COLORS.textLight }} className="text-sm">Revenue Today</p>
         </div>

         <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="p-6 rounded-xl border shadow-sm col-span-2">
            <h3 style={{ color: COLORS.accent }} className="text-sm font-semibold uppercase tracking-wider mb-2">Gemini Analysis</h3>
            <p style={{ color: COLORS.text }} className="text-sm leading-relaxed">
               {adminInsight}
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
         {/* Main Map Visualization - ADMIN SIDE PREVIEW */}
         <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="lg:col-span-2 rounded-xl border p-4 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-4">
               <h3 style={{ color: COLORS.text }} className="text-lg font-bold flex items-center gap-2">
                 <Scan style={{ color: COLORS.accent }} className="w-5 h-5" />
                 Smart Layout Monitor
               </h3>
               <div className="flex gap-2">
                 <span style={{ backgroundColor: mediaType === 'image' ? COLORS.accent : COLORS.bg, color: mediaType === 'image' ? 'white' : COLORS.textLight, border: `1px solid ${COLORS.highlight}` }} className="px-2 py-1 rounded text-xs font-bold">
                   {mediaType === 'image' ? 'IMAGE ANALYSIS' : 'VIDEO TRACKING'}
                 </span>
               </div>
            </div>

            <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="flex-1 relative rounded-lg overflow-hidden min-h-[400px] border">
               <ParkingMap 
                 mediaSrc={mediaSrc} 
                 mediaType={mediaType}
                 spots={spots} 
                 vehicles={[userCar]} 
                 assignedSpotId={null} 
                 showHeatmap={true}
                 onActivityDetected={handleVideoActivity}
                 onImageAnalysisComplete={handleImageAnalysisComplete}
                 showDebugOverlay={true} 
               />

               {/* AI Processing Overlay */}
               {isAnalyzing && (
                 <div style={{ backgroundColor: `rgba(255,255,255,0.9)` }} className="absolute inset-0 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                   <div style={{ borderColor: COLORS.accent }} className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-4" />
                   <p style={{ color: COLORS.accent }} className="font-mono text-lg animate-pulse">{analysisStep}</p>
                 </div>
               )}
            </div>
         </div>

         {/* Sidebar Controls */}
         <div className="space-y-6">
            
            {/* NEW: Smart Site Configuration */}
            <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="rounded-xl border p-6 shadow-sm relative overflow-hidden">
               <div style={{ backgroundColor: COLORS.accent }} className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none" />
               <h3 style={{ color: COLORS.text }} className="text-lg font-bold mb-4 flex items-center gap-2">
                 <Settings className="w-5 h-5" /> Site Configuration
               </h3>
               
               <div style={{ borderColor: COLORS.highlight, backgroundColor: COLORS.bg }} className="border-2 border-dashed rounded-lg p-6 text-center hover:border-blue-500 transition-all cursor-pointer relative">
                  <input 
                    type="file" 
                    accept="image/*,video/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleMediaUpload} 
                  />
                  <div className="pointer-events-none">
                    <CloudLightning style={{ color: COLORS.accent }} className="w-8 h-8 mx-auto mb-2" />
                    <p style={{ color: COLORS.text }} className="text-sm font-medium">Upload Site Reference</p>
                    <p style={{ color: COLORS.textLight }} className="text-xs mt-1">Supports Photo (Layout Analysis) or Video</p>
                  </div>
               </div>

               {mediaType === 'image' && !isAnalyzing && (
                 <div className="mt-4 space-y-2">
                   <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                     <CheckCircle className="w-4 h-4 text-emerald-500" />
                     <span className="text-xs text-emerald-600">Occupancy Verified</span>
                   </div>
                   <p style={{ color: COLORS.textLight }} className="text-xs">
                     System updated using pixel variance & saturation analysis.
                   </p>
                 </div>
               )}
            </div>

            {/* Dynamic Pricing */}
            <div style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="rounded-xl border p-6 shadow-sm">
               <h3 style={{ color: COLORS.text }} className="text-lg font-bold mb-4">Dynamic Pricing</h3>
               <div className="flex items-center justify-between mb-4">
                  <span style={{ color: COLORS.textLight }}>Base Rate</span>
                  <span style={{ color: COLORS.text }} className="font-mono">$5.00/hr</span>
               </div>
               <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                     <span style={{ color: COLORS.textLight }}>Demand Multiplier</span>
                     <span style={{ color: COLORS.accent }} className="font-bold">x{pricingMultiplier.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" max="2" step="0.1" 
                    value={pricingMultiplier}
                    onChange={(e) => setPricingMultiplier(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                    style={{ backgroundColor: COLORS.bg, accentColor: COLORS.accent }}
                  />
               </div>
               <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="p-3 rounded-lg text-sm text-center border">
                  Current Rate: <span style={{ color: COLORS.text }} className="font-bold">${(5 * pricingMultiplier).toFixed(2)}/hr</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: COLORS.bg, color: COLORS.text }} className="min-h-screen flex flex-col font-sans selection:bg-blue-100">
      {/* Navbar */}
      <nav style={{ backgroundColor: COLORS.panel, borderColor: COLORS.highlight }} className="border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div style={{ backgroundColor: COLORS.accent }} className="w-10 h-10 rounded-lg shadow-sm flex items-center justify-center">
               <Car className="text-white w-6 h-6" />
             </div>
             <div>
               <span style={{ color: COLORS.text }} className="text-xl font-bold block leading-tight">
                 Sentinels Park
               </span>
               <span style={{ color: COLORS.accent }} className="text-xs font-bold tracking-wider">ENTERPRISE SYSTEM</span>
             </div>
          </div>
          
          <div style={{ backgroundColor: COLORS.bg, borderColor: COLORS.highlight }} className="flex gap-1 p-1 rounded-lg border">
            <button
              onClick={() => setView('driver')}
              className={`px-5 py-2 rounded text-sm font-semibold transition-all duration-200 ${
                view === 'driver' ? 'shadow-sm' : ''
              }`}
              style={{ 
                backgroundColor: view === 'driver' ? COLORS.panel : 'transparent',
                color: view === 'driver' ? COLORS.accent : COLORS.textLight,
                border: view === 'driver' ? `1px solid ${COLORS.highlight}` : '1px solid transparent'
              }}
            >
              Driver View
            </button>
            <button
              onClick={() => setView('admin')}
              className={`px-5 py-2 rounded text-sm font-semibold transition-all duration-200 ${
                view === 'admin' ? 'shadow-sm' : ''
              }`}
              style={{ 
                backgroundColor: view === 'admin' ? COLORS.panel : 'transparent',
                color: view === 'admin' ? COLORS.accent : COLORS.textLight,
                border: view === 'admin' ? `1px solid ${COLORS.highlight}` : '1px solid transparent'
              }}
            >
              Admin View
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {view === 'driver' ? renderDriverView() : renderAdminView()}
      </main>
    </div>
  );
}