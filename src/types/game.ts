export interface CarConfig {
  id: string;
  name: string;
  brand: string;
  topSpeed: number; // Base KM/H
  accel: number; // 0-100
  handling: number; // 0-100
  nitroCapacity: number; // 0-100
  nitroBoost: number; // extra KM/H
  maxShields: number;
  starRating: number; // 1-5 stars (5-star max tier)
  bodyColor: number;
  accentColor: number;
  underglow: string;
  priceTaka: number;
  unlocked: boolean;
  upgrades?: {
    speedLevel: number;
    nitroLevel: number;
  };
}

export interface RoadTheme {
  id: string;
  name: string;
  tagline: string;
  priceTaka: number;
  unlocked: boolean;
  roadColor: number;
  lineColorA: number;
  lineColorB: number;
  guardrailColorA: number;
  guardrailColorB: number;
  ambientLight: number;
  dirLightA: number;
  dirLightB: number;
  fogColor: number;
  fogDensity: number;
  skyType: 'dhaka_day' | 'daytime' | 'coxsbazar_marine' | 'cyber' | 'tokyo_rain' | 'sahara_sunset' | 'magma' | 'space';
  weather?: 'none' | 'rain' | 'embers' | 'warp_stars';
  hasMarineDrive?: boolean;
  hasDhakaCity?: boolean;
  hasCurves?: boolean;
}

export type RadioStation = 'highway_fm' | 'synthwave' | 'chillout' | 'off';

export interface RadioState {
  station: RadioStation;
  name: string;
  frequency: string;
  nowPlaying: string;
  trafficBulletin: string;
  isMuted: boolean;
}

export type DynamicWeatherType = 'clear' | 'rain' | 'fog' | 'neon_snow';

export interface WeatherState {
  type: DynamicWeatherType;
  name: string;
  icon: string;
  effectLabel: string;
  gripFactor: number;
  bonusMultiplier: number;
}

export interface GlobalUpgrades {
  engineLevel: number; // Level 1 to 5
  nitroLevel: number; // Level 1 to 5
  shieldLevel: number; // Level 1 to 5 (Handling, Armor & Grip)
  magnetLevel: number; // Level 1 to 5
  multiplierLevel: number; // Level 1 to 5
}

export type PowerupType = 'cash_bundle' | 'gold_coin' | 'nitro' | 'fuel' | 'repair';

export interface CashMission {
  id: string;
  title: string;
  desc: string;
  target: number;
  progress: number;
  rewardTaka: number;
  type: 'distance' | 'near_miss' | 'cash_collect';
}

export interface PassengerMissionState {
  status: 'none' | 'waiting_ahead' | 'onboard';
  passengerName: string;
  pickupStopName: string;
  destinationName: string;
  fareTaka: number;
  xpReward: number;
  distanceRemaining: number;
  timeRemaining: number;
  needsSlowDown: boolean;
}

export type GameEndReason = 'wrecked' | 'out_of_fuel' | 'time_up';

export interface GameStats {
  score: number;
  distance: number;
  speed: number;
  maxSpeed: number;
  nitro: number;
  health: number;
  maxHealth: number;
  fuel: number;
  maxFuel: number;
  countdownTimer: number;
  xp: number;
  driverLevel: number;
  passengersDropped: number;
  passengerMission: PassengerMissionState;
  isBraking: boolean;
  shields: number;
  maxShields: number;
  combo: number;
  comboTimer: number;
  policeActive: boolean;
  policeChaseIntensity: number; // 0 to 1
  policeEscortActive?: boolean;
  policeEscortTimer?: number;
  policeEscortMultiplier?: number;
  nearMisses: number;
  cashCollectedThisRun: number;
  activeMission: CashMission;
  magnetActive?: boolean;
  feverActive?: boolean;
  weather: WeatherState;
  weatherAlert?: { title: string; subtitle: string; icon: string; color: string } | null;
  radio?: RadioState;
  level?: number;
}

export interface RunSummary {
  score: number;
  distance: number;
  maxSpeed: number;
  nearMisses: number;
  cashEarned: number;
  xpEarned: number;
  passengersDropped: number;
  endReason: GameEndReason;
  isNewRecord: boolean;
  carName?: string;
}

export interface RunHistoryPoint {
  run: string;
  distanceKm: number;
  avgSpeed: number;
  score: number;
}

export interface DriverProfileStats {
  totalDistance: number; // meters
  totalCrashes: number;
  totalRuns: number;
  speedSum: number;
  totalXp: number;
  passengersDropped: number;
  history: RunHistoryPoint[];
}
