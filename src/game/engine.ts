import { soundEngine } from './audio';
import { computeGridRects, renderGameCanvas } from './renderer';
import {
  ActiveChaosEvent,
  BanjirEvent,
  DemoEvent,
  FloatingText,
  GAME_CONFIG,
  GameHudSnapshot,
  GameOverReason,
  GamePhase,
  GameStats,
  OrangutanEvent,
  Particle,
  Plot,
  PlotRect,
  ToolMode,
} from './types';

const HARVEST_QUOTES = [
  '+Rp 50 Juta!',
  'CUAN BOSS!',
  'AUTO SULTAN!',
  'CAIR TERUS!',
  'PANEN RAYA!',
];

export class SawitGameEngine {
  private phase: GamePhase = 'TITLE';
  private toolMode: ToolMode = 'SAWIT';
  private stats: GameStats;
  private plots: Plot[] = [];
  private plotRects: PlotRect[] = [];
  private activeEvent: ActiveChaosEvent = null;
  private lastEventType: 'ORANGUTAN' | 'BANJIR' | 'DEMO' | null = null;
  private chaosCooldown: number = 3.5;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private screenShake: number = 0;
  private time: number = 0;
  private hoveredPlotIndex: number = -1;
  private gameOverReason: GameOverReason | null = null;

  private canvasWidth: number = 800;
  private canvasHeight: number = 600;
  private onHudUpdate: (snapshot: GameHudSnapshot) => void;
  private hudSyncTimer: number = 0;

  constructor(onHudUpdate: (snapshot: GameHudSnapshot) => void) {
    this.onHudUpdate = onHudUpdate;
    this.stats = this.createInitialStats();
    this.plots = this.createInitialPlots();
  }

  private createInitialStats(): GameStats {
    return {
      money: GAME_CONFIG.START_MONEY,
      targetMoney: GAME_CONFIG.TARGET_MONEY,
      ecosystem: 90,
      elapsedSeconds: 0,
      day: 1,
      sawitPlanted: 0,
      sawitHarvested: 0,
      hutanPlanted: 0,
      rottenCleaned: 0,
      orangutanCalmed: 0,
      disastersSurvived: 0,
      totalEarned: 0,
    };
  }

  private createInitialPlots(): Plot[] {
    const list: Plot[] = [];
    for (let r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      for (let c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
        list.push({
          index: r * GAME_CONFIG.GRID_COLS + c,
          row: r,
          col: c,
          state: 'EMPTY',
          treeType: null,
          growTimer: 0,
          growDuration: 5,
          readyTimer: 0,
          maxReadyTime: GAME_CONFIG.SAWIT_ROT_WINDOW,
          bounce: 0,
          shake: 0,
          isFlooded: false,
        });
      }
    }
    return list;
  }

  public setCanvasSize(width: number, height: number): void {
    this.canvasWidth = Math.max(300, width);
    this.canvasHeight = Math.max(260, height);
    this.plotRects = computeGridRects(this.canvasWidth, this.canvasHeight);
  }

  public startNewGame(): void {
    soundEngine.unlock();
    this.stats = this.createInitialStats();
    this.plots = this.createInitialPlots();
    this.activeEvent = null;
    this.lastEventType = null;
    this.chaosCooldown = 3.0;
    this.particles = [];
    this.floatingTexts = [];
    this.screenShake = 0;
    this.gameOverReason = null;
    this.toolMode = 'SAWIT';
    this.phase = 'PLAYING';
    soundEngine.setTense(false);
    soundEngine.startMusic();
    this.emitHud();
  }

  public togglePause(): void {
    if (this.phase === 'PLAYING') {
      this.phase = 'PAUSED';
      soundEngine.stopMusic();
      this.emitHud();
    } else if (this.phase === 'PAUSED') {
      this.phase = 'PLAYING';
      soundEngine.startMusic();
      this.emitHud();
    }
  }

  public setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.emitHud();
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public handlePointerMove(x: number, y: number): void {
    if (this.phase !== 'PLAYING') {
      this.hoveredPlotIndex = -1;
      return;
    }
    this.hoveredPlotIndex = this.findPlotAt(x, y);
  }

  public handlePointerDown(x: number, y: number): void {
    if (this.phase !== 'PLAYING') return;
    soundEngine.unlock();

    // 1. Check Orangutan click first (priority target)
    if (this.activeEvent && this.activeEvent.type === 'ORANGUTAN' && !this.activeEvent.calmed) {
      const o = this.activeEvent;
      const dist = Math.hypot(x - o.x, y - o.y);
      if (dist <= o.radius + 26) {
        this.feedOrangutan(o);
        return;
      }
    }

    // 2. Check plot grid click
    const plotIndex = this.findPlotAt(x, y);
    if (plotIndex === -1) return;

    const plot = this.plots[plotIndex];
    const rect = this.plotRects[plotIndex];
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h * 0.42;

    if (plot.state === 'READY') {
      if (plot.treeType === 'SAWIT') {
        if (this.isHarvestBlocked()) {
          plot.shake = 1;
          soundEngine.playError();
          this.spawnText(cx, cy - 12, 'DIBLOKIR WARGA!', '#FCA5A5', '#450A0A');
          return;
        }
        this.harvestSawit(plot, cx, cy);
      } else {
        // Mature Forest tree: tidy up plot for reuse
        this.clearForestPlot(plot, cx, cy);
      }
      return;
    }

    if (plot.state === 'ROTTEN') {
      this.cleanRottenPlot(plot, cx, cy);
      return;
    }

    if (plot.state === 'GROWING') {
      plot.bounce = 0.7;
      this.spawnText(cx, cy - 10, 'Lagi Tumbuh!', '#FEF08A', '#422006', 0.85);
      return;
    }

    // EMPTY plot -> plant selected tree
    if (plot.isFlooded) {
      plot.shake = 1;
      soundEngine.playError();
      this.spawnText(cx, cy - 10, 'Kena Banjir!', '#FEF3C7', '#451A03');
      return;
    }

    if (this.toolMode === 'SAWIT') {
      this.plantSawit(plot, cx, cy);
    } else {
      this.plantHutan(plot, cx, cy);
    }
  }

  private findPlotAt(x: number, y: number): number {
    for (let i = 0; i < this.plotRects.length; i++) {
      const r = this.plotRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return i;
      }
    }
    return -1;
  }

  private isHarvestBlocked(): boolean {
    return this.activeEvent?.type === 'DEMO' && !this.activeEvent.dispersing;
  }

  private plantSawit(plot: Plot, cx: number, cy: number): void {
    if (this.stats.money < GAME_CONFIG.SAWIT_COST) {
      plot.shake = 1;
      soundEngine.playError();
      this.spawnText(cx, cy, 'Modal Kurang!', '#FCA5A5', '#450A0A');
      return;
    }

    this.stats.money -= GAME_CONFIG.SAWIT_COST;
    this.stats.ecosystem = Math.max(0, this.stats.ecosystem + GAME_CONFIG.SAWIT_ECO_DELTA);
    this.stats.sawitPlanted += 1;

    plot.state = 'GROWING';
    plot.treeType = 'SAWIT';
    plot.growTimer = 0;
    plot.growDuration =
      GAME_CONFIG.GROW_MIN + Math.random() * (GAME_CONFIG.GROW_MAX - GAME_CONFIG.GROW_MIN);
    plot.readyTimer = 0;
    plot.maxReadyTime = GAME_CONFIG.SAWIT_ROT_WINDOW;
    plot.bounce = 1;

    soundEngine.playPlant('SAWIT');
    this.spawnBurst(cx, cy + 16, 8, 'DIRT', '#78350F');
    this.spawnText(cx, cy - 8, '-Rp 10Jt · Alam -8%', '#FDBA74', '#431407', 0.88);

    this.checkEndConditions();
    this.emitHud();
  }

  private plantHutan(plot: Plot, cx: number, cy: number): void {
    if (this.stats.money < GAME_CONFIG.HUTAN_COST) {
      plot.shake = 1;
      soundEngine.playError();
      this.spawnText(cx, cy, 'Modal Kurang!', '#FCA5A5', '#450A0A');
      return;
    }

    this.stats.money -= GAME_CONFIG.HUTAN_COST;
    this.stats.ecosystem = Math.min(100, this.stats.ecosystem + GAME_CONFIG.HUTAN_ECO_DELTA);
    this.stats.hutanPlanted += 1;

    plot.state = 'GROWING';
    plot.treeType = 'HUTAN';
    plot.growTimer = 0;
    plot.growDuration = 4.1 + Math.random() * 1.1;
    plot.readyTimer = 0;
    plot.maxReadyTime = GAME_CONFIG.HUTAN_STAY_WINDOW;
    plot.bounce = 1;

    if (this.activeEvent?.type === 'DEMO' && !this.activeEvent.dispersing) {
      this.activeEvent.forestPlantedDuringDemo += 1;
    }

    soundEngine.playPlant('HUTAN');
    this.spawnBurst(cx, cy + 10, 10, 'LEAF', '#34D399');
    this.spawnText(cx, cy - 8, 'Alam +15%!', '#6EE7B7', '#064E3B', 0.95);

    this.checkEndConditions();
    this.emitHud();
  }

  private harvestSawit(plot: Plot, cx: number, cy: number): void {
    this.stats.money += GAME_CONFIG.SAWIT_HARVEST;
    this.stats.totalEarned += GAME_CONFIG.SAWIT_HARVEST;
    this.stats.sawitHarvested += 1;

    plot.state = 'EMPTY';
    plot.treeType = null;
    plot.growTimer = 0;
    plot.readyTimer = 0;
    plot.bounce = 1.2;

    this.screenShake = Math.max(this.screenShake, 3);
    soundEngine.playHarvest();
    this.spawnBurst(cx, cy, 14, 'COIN', '#FACC15');
    this.spawnBurst(cx, cy, 6, 'LEAF', '#22C55E');

    const quote = HARVEST_QUOTES[Math.floor(Math.random() * HARVEST_QUOTES.length)];
    this.spawnText(cx, cy - 16, quote, '#FDE047', '#422006', 1.1);

    this.checkEndConditions();
    this.emitHud();
  }

  private clearForestPlot(plot: Plot, cx: number, cy: number): void {
    plot.state = 'EMPTY';
    plot.treeType = null;
    plot.growTimer = 0;
    plot.readyTimer = 0;
    plot.bounce = 0.8;

    soundEngine.playClean();
    this.spawnBurst(cx, cy, 10, 'LEAF', '#10B981');
    this.spawnText(cx, cy - 8, 'Lahan Siap Tanam!', '#A7F3D0', '#064E3B', 0.88);
    this.emitHud();
  }

  private cleanRottenPlot(plot: Plot, cx: number, cy: number): void {
    this.stats.rottenCleaned += 1;
    plot.state = 'EMPTY';
    plot.treeType = null;
    plot.growTimer = 0;
    plot.readyTimer = 0;
    plot.bounce = 0.9;

    soundEngine.playClean();
    this.spawnBurst(cx, cy + 10, 9, 'DIRT', '#57534E');
    this.spawnText(cx, cy - 8, 'Bersih Bos!', '#E7E5E4', '#1C1917', 0.9);
    this.checkEndConditions();
    this.emitHud();
  }

  private feedOrangutan(o: OrangutanEvent): void {
    o.clicksRemaining -= 1;
    o.hitFlash = 0.16;
    this.spawnBurst(o.x, o.y - 10, 6, 'BANANA', '#FACC15');

    if (o.clicksRemaining <= 0) {
      o.calmed = true;
      o.calmTimer = 1.3;
      this.stats.orangutanCalmed += 1;
      this.stats.disastersSurvived += 1;
      this.stats.ecosystem = Math.min(100, this.stats.ecosystem + 5);
      soundEngine.playBanana(true);
      this.spawnText(o.x, o.y - 50, 'ORANGUTAN TENANG! +5% Alam', '#6EE7B7', '#064E3B', 1.0);
    } else {
      soundEngine.playBanana(false);
      this.spawnText(o.x, o.y - 45, 'NYAM! PISANG!', '#FDE047', '#451A03', 0.95);
    }
    this.emitHud();
  }

  public update(dt: number): void {
    const safeDt = Math.min(0.05, dt);
    this.time += safeDt;

    if (this.phase !== 'PLAYING') {
      return;
    }

    this.stats.elapsedSeconds += safeDt;
    const newDay = Math.floor(this.stats.elapsedSeconds / GAME_CONFIG.DAY_LENGTH_SECONDS) + 1;
    if (newDay !== this.stats.day) {
      this.stats.day = newDay;
    }

    // Decay screen shake
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - safeDt * 18);
    }

    // Update plots
    this.plots.forEach((plot, idx) => {
      if (plot.bounce > 0) plot.bounce = Math.max(0, plot.bounce - safeDt * 4.5);
      if (plot.shake > 0) plot.shake = Math.max(0, plot.shake - safeDt * 3.5);

      if (plot.state === 'GROWING') {
        plot.growTimer += safeDt;
        if (plot.growTimer >= plot.growDuration) {
          plot.state = 'READY';
          plot.readyTimer = 0;
          plot.bounce = 1;
          const r = this.plotRects[idx];
          if (r && plot.treeType === 'HUTAN') {
            this.spawnBurst(r.x + r.w / 2, r.y + r.h * 0.4, 8, 'LEAF', '#34D399');
          }
        }
      } else if (plot.state === 'READY') {
        // Pause rot countdown while blocked by Demo so player isn't punished unfairly
        if (plot.treeType === 'SAWIT' && this.isHarvestBlocked()) {
          return;
        }
        plot.readyTimer += safeDt;
        if (plot.readyTimer >= plot.maxReadyTime) {
          if (plot.treeType === 'SAWIT') {
            plot.state = 'ROTTEN';
            plot.shake = 0.8;
            const r = this.plotRects[idx];
            if (r) {
              this.spawnText(r.x + r.w / 2, r.y + r.h * 0.35, 'BUSUK!', '#D8B4FE', '#3B0764', 0.9);
            }
          } else {
            // Mature forest tree naturally cycles back to fertile soil
            plot.state = 'EMPTY';
            plot.treeType = null;
            plot.readyTimer = 0;
          }
        }
      }
    });

    // Update Chaos System
    const isCritical = this.stats.ecosystem < GAME_CONFIG.CRITICAL_ECO_THRESHOLD;
    soundEngine.setTense(isCritical);

    if (this.activeEvent) {
      this.updateActiveChaos(safeDt);
    } else if (isCritical) {
      this.chaosCooldown -= safeDt;
      if (this.chaosCooldown <= 0) {
        this.triggerRandomChaos();
        this.chaosCooldown =
          GAME_CONFIG.CHAOS_COOLDOWN_MIN +
          Math.random() * (GAME_CONFIG.CHAOS_COOLDOWN_MAX - GAME_CONFIG.CHAOS_COOLDOWN_MIN);
      }
    } else {
      // Reset cooldown nicely when ecosystem recovers
      this.chaosCooldown = Math.max(this.chaosCooldown, 3.5);
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= safeDt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.rotation += p.vRot * safeDt;
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= safeDt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * safeDt;
    }

    this.checkEndConditions();

    // Sync React HUD at ~12Hz for smooth bars & timers without React re-render spam
    this.hudSyncTimer += safeDt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private triggerRandomChaos(): void {
    const options: ('ORANGUTAN' | 'BANJIR' | 'DEMO')[] = ['ORANGUTAN', 'BANJIR', 'DEMO'];
    const filtered = options.filter((t) => t !== this.lastEventType);
    const chosen = filtered[Math.floor(Math.random() * filtered.length)];
    this.lastEventType = chosen;

    if (chosen === 'ORANGUTAN') {
      this.startOrangutanEvent();
    } else if (chosen === 'BANJIR') {
      this.startBanjirEvent();
    } else {
      this.startDemoEvent();
    }
    this.emitHud();
  }

  private startOrangutanEvent(): void {
    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -40 : this.canvasWidth + 40;
    const startY = this.canvasHeight * 0.45;
    const targetX = this.canvasWidth * (0.35 + Math.random() * 0.3);
    const targetY = this.canvasHeight * (0.4 + Math.random() * 0.2);

    const event: OrangutanEvent = {
      type: 'ORANGUTAN',
      x: startX,
      y: startY,
      targetX,
      targetY,
      radius: 44,
      clicksRemaining: 3,
      maxClicks: 3,
      calmed: false,
      calmTimer: 0,
      smashTimer: 3.4,
      animTime: 0,
      hitFlash: 0,
      thrownFruits: [],
    };

    this.activeEvent = event;
    this.screenShake = 8;
    soundEngine.playOrangutanRoar();
    soundEngine.playSiren();

    // Smash 2-3 random Sawit trees immediately!
    this.smashSawitTrees(2 + (Math.random() > 0.5 ? 1 : 0), event);
    this.spawnText(
      this.canvasWidth / 2,
      Math.max(55, this.canvasHeight * 0.14),
      'ORANGUTAN NGAMUK! KLIK 3x!',
      '#FDBA74',
      '#7C2D12',
      1.15
    );
  }

  private smashSawitTrees(count: number, event: OrangutanEvent): void {
    const sawitPlots = this.plots.filter((p) => p.treeType === 'SAWIT' && p.state !== 'EMPTY');
    const shuffled = [...sawitPlots].sort(() => Math.random() - 0.5).slice(0, count);

    shuffled.forEach((p) => {
      p.state = 'EMPTY';
      p.treeType = null;
      p.growTimer = 0;
      p.readyTimer = 0;
      p.shake = 1.4;

      const r = this.plotRects[p.index];
      if (r) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        this.spawnBurst(cx, cy, 10, 'LEAF', '#EA580C');
        this.spawnText(cx, cy - 10, 'DISERUDUK!', '#FCA5A5', '#7F1D1D', 0.92);
        event.thrownFruits.push({
          x: event.targetX,
          y: event.targetY,
          vx: (cx - event.targetX) * 1.4,
          vy: (cy - event.targetY) * 1.4 - 90,
          rotation: 0,
          life: 0.75,
        });
      }
    });
  }

  private startBanjirEvent(): void {
    this.plots.forEach((p) => {
      p.isFlooded = true;
    });

    const kinds: ('SANDAL' | 'DUCK' | 'TWIG')[] = ['SANDAL', 'DUCK', 'TWIG', 'SANDAL', 'TWIG'];
    const debris = kinds.map((kind, i) => ({
      x: (i + 0.5) * (this.canvasWidth / kinds.length),
      yOffset: 0.18 + (i % 3) * 0.25,
      speed: 35 + i * 11,
      kind,
      bobOffset: i * 1.4,
    }));

    const event: BanjirEvent = {
      type: 'BANJIR',
      remaining: 5.0,
      duration: 5.0,
      waterLevel: 0.1,
      debris,
    };

    this.activeEvent = event;
    this.screenShake = 9;
    soundEngine.playSplash();
    soundEngine.playSiren();
    this.spawnText(
      this.canvasWidth / 2,
      Math.max(55, this.canvasHeight * 0.14),
      'AWAS BANJIR BANDANG!',
      '#FEF08A',
      '#713F12',
      1.2
    );
  }

  private startDemoEvent(): void {
    const signs = ['JANGAN BABAT HUTAN!', 'UDARA PANAS BOS!', 'TANAM SENGON!', 'STOP ASAP!'];
    const shirts = ['#EF4444', '#2563EB', '#16A34A', '#D97706'];
    const event: DemoEvent = {
      type: 'DEMO',
      elapsed: 0,
      minDuration: 4.0,
      maxFallback: 12.0,
      forestPlantedDuringDemo: 0,
      requiredForest: 2,
      dispersing: false,
      disperseTimer: 0,
      protesters: [0.18, 0.39, 0.61, 0.82].map((xNorm, i) => ({
        xNorm,
        bounceOffset: i * 1.1,
        shirtColor: shirts[i],
        signText: signs[i],
        hasMegaphone: i === 1,
      })),
    };

    this.activeEvent = event;
    this.screenShake = 5;
    soundEngine.playDemoWhistle();
    soundEngine.playSiren();
    this.spawnText(
      this.canvasWidth / 2,
      Math.max(55, this.canvasHeight * 0.14),
      'SIDAK LSM & WARGA DEMO!',
      '#FECACA',
      '#7F1D1D',
      1.15
    );
  }

  private updateActiveChaos(dt: number): void {
    if (!this.activeEvent) return;

    if (this.activeEvent.type === 'ORANGUTAN') {
      const o = this.activeEvent;
      o.animTime += dt;
      if (o.hitFlash > 0) o.hitFlash = Math.max(0, o.hitFlash - dt);

      // Update thrown fruits
      for (let i = o.thrownFruits.length - 1; i >= 0; i--) {
        const f = o.thrownFruits[i];
        f.life -= dt;
        f.vy += 260 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rotation += 10 * dt;
        if (f.life <= 0) o.thrownFruits.splice(i, 1);
      }

      if (o.calmed) {
        o.calmTimer -= dt;
        o.y -= 18 * dt;
        if (o.calmTimer <= 0) {
          this.activeEvent = null;
          this.emitHud();
        }
        return;
      }

      // Move smoothly toward target
      o.x += (o.targetX - o.x) * Math.min(1, dt * 4.5);
      o.y += (o.targetY - o.y) * Math.min(1, dt * 4.5);

      o.smashTimer -= dt;
      if (o.smashTimer <= 0) {
        o.smashTimer = 3.4;
        o.targetX = this.canvasWidth * (0.22 + Math.random() * 0.56);
        o.targetY = this.canvasHeight * (0.34 + Math.random() * 0.34);
        this.smashSawitTrees(1, o);
        soundEngine.playOrangutanRoar();
      }
    } else if (this.activeEvent.type === 'BANJIR') {
      const b = this.activeEvent;
      b.remaining -= dt;
      const targetLevel = b.remaining < 0.7 ? Math.max(0, b.remaining / 0.7) : 1;
      b.waterLevel += (targetLevel - b.waterLevel) * Math.min(1, dt * 6);

      if (b.remaining <= 0) {
        this.plots.forEach((p) => {
          p.isFlooded = false;
        });
        this.stats.disastersSurvived += 1;
        this.activeEvent = null;
        this.spawnText(this.canvasWidth / 2, this.canvasHeight * 0.45, 'BANJIR SURUT!', '#BAE6FD', '#0C4A6E', 1.05);
        this.emitHud();
      }
    } else if (this.activeEvent.type === 'DEMO') {
      const d = this.activeEvent;
      if (d.dispersing) {
        d.disperseTimer += dt;
        if (d.disperseTimer >= 0.9) {
          this.activeEvent = null;
          this.emitHud();
        }
        return;
      }

      d.elapsed += dt;
      const goalMet = d.elapsed >= d.minDuration && d.forestPlantedDuringDemo >= d.requiredForest;
      const fallbackExpired = d.elapsed >= d.maxFallback;

      if (goalMet || fallbackExpired) {
        d.dispersing = true;
        this.stats.disastersSurvived += 1;
        this.spawnText(
          this.canvasWidth / 2,
          this.canvasHeight * 0.5,
          goalMet ? 'WARGA PUAS! LANJUT PANEN!' : 'DEMO BUBAR!',
          '#6EE7B7',
          '#064E3B',
          1.05
        );
        this.emitHud();
      }
    }
  }

  private checkEndConditions(): void {
    if (this.phase !== 'PLAYING') return;

    // 1. Victory: Target Money Reached!
    if (this.stats.money >= GAME_CONFIG.TARGET_MONEY) {
      this.phase = 'VICTORY';
      soundEngine.stopMusic();
      soundEngine.playVictory();
      this.emitHud();
      return;
    }

    // 2. Ecosystem Zero -> Satgas Lingkungan!
    if (this.stats.ecosystem <= 0) {
      this.stats.ecosystem = 0;
      this.gameOverReason = 'ECOSYSTEM_ZERO';
      this.phase = 'GAME_OVER';
      soundEngine.stopMusic();
      soundEngine.playGameOver();
      this.emitHud();
      return;
    }

    // 3. Bankrupt -> Cannot afford Sawit (Rp 10Jt) and no Sawit trees growing/ready!
    const hasPotentialSawit = this.plots.some(
      (p) => p.treeType === 'SAWIT' && (p.state === 'GROWING' || p.state === 'READY')
    );
    if (this.stats.money < GAME_CONFIG.SAWIT_COST && !hasPotentialSawit) {
      this.gameOverReason = 'BANKRUPT';
      this.phase = 'GAME_OVER';
      soundEngine.stopMusic();
      soundEngine.playGameOver();
      this.emitHud();
    }
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    kind: Particle['kind'],
    color: string
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 75,
        size: kind === 'COIN' ? 8 + Math.random() * 4 : 4 + Math.random() * 5,
        color,
        alpha: 1,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1.0,
        gravity: 340,
        kind,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnText(
    x: number,
    y: number,
    text: string,
    color: string,
    strokeColor: string,
    scale = 1
  ): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -44,
      text,
      color,
      strokeColor,
      scale,
      life: 1.05,
      maxLife: 1.05,
    });
  }

  public render(ctx: CanvasRenderingContext2D): void {
    renderGameCanvas({
      ctx,
      width: this.canvasWidth,
      height: this.canvasHeight,
      time: this.time,
      ecosystem: this.stats.ecosystem,
      plots: this.plots,
      plotRects: this.plotRects,
      hoveredPlotIndex: this.hoveredPlotIndex,
      toolMode: this.toolMode,
      activeEvent: this.activeEvent,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      screenShake: this.screenShake,
      harvestBlocked: this.isHarvestBlocked(),
      showEmptyHint:
        this.phase === 'PLAYING' &&
        this.stats.sawitPlanted === 0 &&
        this.stats.hutanPlanted === 0,
    });
  }

  public getSnapshot(): GameHudSnapshot {
    return {
      phase: this.phase,
      toolMode: this.toolMode,
      stats: { ...this.stats },
      activeEvent: this.activeEvent ? { ...this.activeEvent } : null,
      gameOverReason: this.gameOverReason,
      harvestBlocked: this.isHarvestBlocked(),
      isCriticalEco: this.stats.ecosystem < GAME_CONFIG.CRITICAL_ECO_THRESHOLD,
    };
  }

  private emitHud(): void {
    this.onHudUpdate(this.getSnapshot());
  }
}
