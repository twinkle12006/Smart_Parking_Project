
export enum SpotType {
  STANDARD = 'Standard',
  COMPACT = 'Compact',
  HANDICAP = 'Handicap',
  EV = 'EV',
  VIP = 'VIP'
}

export enum SpotStatus {
  AVAILABLE = 'Available',
  OCCUPIED = 'Occupied',
  RESERVED = 'Reserved'
}

export interface ParkingSpot {
  id: string;
  type: SpotType;
  status: SpotStatus;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  aisle: string;
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface Vehicle {
  id: string;
  type: 'user';
  location: Coordinates;
  rotation: number;
  targetSpotId: string | null;
  state: 'driving' | 'parked';
  color: string;
}

export interface LogEntry {
  id: string;
  plate: string;
  entryTime: string;
  duration: string;
  status: 'Active' | 'Completed' | 'Overstay';
}
