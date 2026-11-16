export type GamePhase = 'TITLE' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type ToolMode = 'SAWIT' | 'HUTAN';

export type TreeType = 'SAWIT' | 'HUTAN';

export type PlotState = 'EMPTY' | 'GROWING' | 'READY' | 'ROTTEN';

export type GameOverReason = 'ECOSYSTEM_ZERO' | 'BANKRUPT';

export interface Plot {
  index: number;
  row: number;
  col: number;
  state: PlotState;
  treeType: TreeType | null;
  growTimer: number;
  growDuration: number;
  readyTimer: number;
  maxReadyTime: number;
  bounce: number;
  shake: number;
  isFlooded: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  kind: 'COIN' | 'LEAF' | 'DIRT' | 'WATER' | 'SMOKE' | 'BANANA' | 'SPARK';
  rotation: number;
  vRot: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  strokeColor: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface ThrownFruit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  life: number;
}

export interface OrangutanEvent {
  type: 'ORANGUTAN';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  clicksRemaining: number;
  maxClicks: number;
  calmed: boolean;
  calmTimer: number;
  smashTimer: number;
  animTime: number;
  hitFlash: number;
  thrownFruits: ThrownFruit[];
}

export interface DebrisItem {
  x: number;
  yOffset: number;
  speed: number;
  kind: 'SANDAL' | 'DUCK' | 'TWIG';
  bobOffset: number;
}

export interface BanjirEvent {
  type: 'BANJIR';
  remaining: number;
  duration: number;
  waterLevel: number;
  debris: DebrisItem[];
}

export interface Protester {
  xNorm: number;
  bounceOffset: number;
  shirtColor: string;
  signText: string;
  hasMegaphone: boolean;
}

export interface DemoEvent {
  type: 'DEMO';
  elapsed: number;
  minDuration: number;
  maxFallback: number;
  forestPlantedDuringDemo: number;
  requiredForest: number;
  protesters: Protester[];
  dispersing: boolean;
  disperseTimer: number;
}

export type ActiveChaosEvent = OrangutanEvent | BanjirEvent | DemoEvent | null;

export interface GameStats {
  money: number; // in Juta Rupiah (1000 = 1 Miliar)
  targetMoney: number;
  ecosystem: number; // 0 to 100
  elapsedSeconds: number;
  day: number;
  sawitPlanted: number;
  sawitHarvested: number;
  hutanPlanted: number;
  rottenCleaned: number;
  orangutanCalmed: number;
  disastersSurvived: number;
  totalEarned: number;
}

export interface PlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameHudSnapshot {
  phase: GamePhase;
  toolMode: ToolMode;
  stats: GameStats;
  activeEvent: ActiveChaosEvent;
  gameOverReason: GameOverReason | null;
  harvestBlocked: boolean;
  isCriticalEco: boolean;
}

export const GAME_CONFIG = {
  GRID_COLS: 4,
  GRID_ROWS: 3,
  START_MONEY: 50,
  TARGET_MONEY: 1000,
  SAWIT_COST: 10,
  SAWIT_HARVEST: 50,
  SAWIT_ECO_DELTA: -8,
  HUTAN_COST: 5,
  HUTAN_ECO_DELTA: 15,
  GROW_MIN: 4.1,
  GROW_MAX: 5.7,
  SAWIT_ROT_WINDOW: 7.5,
  HUTAN_STAY_WINDOW: 9.5,
  DAY_LENGTH_SECONDS: 15,
  CRITICAL_ECO_THRESHOLD: 30,
  CHAOS_COOLDOWN_MIN: 5.5,
  CHAOS_COOLDOWN_MAX: 9.5,
} as const;
