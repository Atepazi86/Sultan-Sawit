import {
  ActiveChaosEvent,
  FloatingText,
  GAME_CONFIG,
  OrangutanEvent,
  Particle,
  Plot,
  PlotRect,
  ToolMode,
} from './types';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const clampT = Math.max(0, Math.min(1, t));
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, clampT));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, clampT));
  const bl = Math.round(lerp(a & 255, b & 255, clampT));
  return `rgb(${r}, ${g}, ${bl})`;
}

export function computeGridRects(width: number, height: number): PlotRect[] {
  const cols = GAME_CONFIG.GRID_COLS;
  const rows = GAME_CONFIG.GRID_ROWS;

  const isCompact = width < 640;
  const topReserve = Math.max(isCompact ? 64 : 88, height * 0.16);
  const bottomReserve = Math.max(isCompact ? 20 : 28, height * 0.05);
  const sidePadding = isCompact ? 14 : Math.max(28, width * 0.06);

  const availW = Math.max(240, width - sidePadding * 2);
  const availH = Math.max(190, height - topReserve - bottomReserve);

  const gap = isCompact ? 10 : Math.min(20, Math.max(12, availW * 0.02));
  const maxCellW = (availW - gap * (cols - 1)) / cols;
  const maxCellH = (availH - gap * (rows - 1)) / rows;

  const cellW = Math.min(maxCellW, maxCellH * 1.18, 190);
  const cellH = Math.min(maxCellH, cellW * 0.86, 156);

  const totalW = cellW * cols + gap * (cols - 1);
  const totalH = cellH * rows + gap * (rows - 1);

  const startX = (width - totalW) / 2;
  const startY = topReserve + (availH - totalH) / 2;

  const rects: PlotRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: Math.round(startX + c * (cellW + gap)),
        y: Math.round(startY + r * (cellH + gap)),
        w: Math.round(cellW),
        h: Math.round(cellH),
      });
    }
  }
  return rects;
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  ecosystem: number;
  plots: Plot[];
  plotRects: PlotRect[];
  hoveredPlotIndex: number;
  toolMode: ToolMode;
  activeEvent: ActiveChaosEvent;
  particles: Particle[];
  floatingTexts: FloatingText[];
  screenShake: number;
  harvestBlocked: boolean;
  showEmptyHint: boolean;
}

export function renderGameCanvas(params: RenderParams): void {
  const {
    ctx,
    width,
    height,
    time,
    ecosystem,
    plots,
    plotRects,
    hoveredPlotIndex,
    toolMode,
    activeEvent,
    particles,
    floatingTexts,
    screenShake,
    harvestBlocked,
    showEmptyHint,
  } = params;

  ctx.save();

  if (screenShake > 0.2) {
    const dx = (Math.random() - 0.5) * screenShake * 2;
    const dy = (Math.random() - 0.5) * screenShake * 2;
    ctx.translate(dx, dy);
  }

  const smogFactor =
    ecosystem >= 50
      ? 0
      : ecosystem >= 30
        ? ((50 - ecosystem) / 20) * 0.35
        : 0.35 + ((30 - ecosystem) / 30) * 0.65;

  // 1. Crisp Sky Gradient
  const skyTop = lerpColor('#0EA5E9', '#57534E', smogFactor);
  const skyBottom = lerpColor('#BAE6FD', '#D6D3D1', smogFactor);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.34);
  skyGrad.addColorStop(0, skyTop);
  skyGrad.addColorStop(1, skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-20, -20, width + 40, height + 40);

  // Sun with soft outer halo
  const sunX = width * 0.86;
  const sunY = height * 0.08;
  const sunR = Math.max(16, Math.min(width, height) * 0.042);
  ctx.save();
  ctx.globalAlpha = 0.25 * (1 - smogFactor * 0.4);
  ctx.fillStyle = lerpColor('#FEF08A', '#FB923C', smogFactor);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 1.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1 - smogFactor * 0.35;
  ctx.fillStyle = lerpColor('#FDE047', '#F97316', smogFactor * 0.85);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawClouds(ctx, width, height, time, smogFactor);

  // 2. Distant Volcanic Mountains
  const horizonY = Math.max(66, height * 0.19);
  drawMountains(ctx, width, horizonY, smogFactor);

  // 3. Vibrant Plantation Lawn
  const groundTop = lerpColor('#65A30D', '#716B43', smogFactor * 0.75);
  const groundBot = lerpColor('#365314', '#44403C', smogFactor * 0.6);
  const groundGrad = ctx.createLinearGradient(0, horizonY - 10, 0, height);
  groundGrad.addColorStop(0, groundTop);
  groundGrad.addColorStop(1, groundBot);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-20, horizonY - 10, width + 40, height - horizonY + 30);

  // Subtle diagonal grass stripes for crisp visual texture
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let gx = -height; gx < width + height; gx += 90) {
    ctx.beginPath();
    ctx.moveTo(gx, horizonY);
    ctx.lineTo(gx + 45, horizonY);
    ctx.lineTo(gx - 120, height);
    ctx.lineTo(gx - 165, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rolling meadow rim
  ctx.fillStyle = lerpColor('#84CC16', '#78716C', smogFactor * 0.7);
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 8);
  for (let x = 0; x <= width; x += 60) {
    const wave = Math.sin(x * 0.015) * 5;
    ctx.lineTo(x, horizonY - 6 + wave);
  }
  ctx.lineTo(width, horizonY + 22);
  ctx.lineTo(0, horizonY + 22);
  ctx.closePath();
  ctx.fill();

  drawHorizonTrees(ctx, width, horizonY, ecosystem, time);

  if (width >= 480) {
    drawPlantationSign(ctx, Math.max(22, width * 0.04), horizonY + 8, ecosystem);
  }

  // 4. Soil Plots (Grid 4x3)
  plots.forEach((plot, idx) => {
    const rect = plotRects[idx];
    if (!rect) return;
    const isHovered = hoveredPlotIndex === idx;
    drawPlot(ctx, plot, rect, isHovered, toolMode, time, harvestBlocked, showEmptyHint && idx === 0);
  });

  // 5. Active Chaos Events
  if (activeEvent) {
    if (activeEvent.type === 'BANJIR') {
      drawFloodOverlay(ctx, width, height, time, activeEvent.waterLevel, activeEvent.debris, activeEvent.remaining);
    } else if (activeEvent.type === 'DEMO') {
      drawDemoProtesters(ctx, width, height, time, activeEvent);
    } else if (activeEvent.type === 'ORANGUTAN') {
      drawOrangutan(ctx, activeEvent, time);
    }
  }

  // 6. Smog Haze Clouds if ecosystem < 30%
  if (ecosystem < 30) {
    drawSmogHaze(ctx, width, height, time, (30 - ecosystem) / 30);
  }

  // 7. Particles
  drawParticles(ctx, particles);

  // 8. Floating Pop-Up Texts
  drawFloatingTexts(ctx, floatingTexts);

  ctx.restore();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  smogFactor: number
): void {
  const cloudColor = lerpColor('#FFFFFF', '#78716C', smogFactor * 0.85);
  ctx.save();
  ctx.fillStyle = cloudColor;
  ctx.globalAlpha = 0.88;

  for (let i = 0; i < 4; i++) {
    const speed = 10 + i * 4;
    const cx = ((time * speed + i * (width * 0.32)) % (width + 180)) - 90;
    const cy = height * (0.042 + (i % 2) * 0.042);
    const scale = 0.65 + (i % 3) * 0.18;

    ctx.beginPath();
    ctx.arc(cx, cy, 20 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 18 * scale, cy - 8 * scale, 22 * scale, 0, Math.PI * 2);
    ctx.arc(cx + 38 * scale, cy, 18 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  smogFactor: number
): void {
  ctx.save();
  ctx.fillStyle = lerpColor('#15803D', '#57534E', smogFactor * 0.8);
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width * 0.16, horizonY - 48);
  ctx.lineTo(width * 0.34, horizonY - 12);
  ctx.lineTo(width * 0.54, horizonY - 58);
  ctx.lineTo(width * 0.76, horizonY - 16);
  ctx.lineTo(width * 0.92, horizonY - 42);
  ctx.lineTo(width, horizonY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lerpColor('#166534', '#44403C', smogFactor * 0.85);
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width * 0.28, horizonY - 30);
  ctx.lineTo(width * 0.45, horizonY - 8);
  ctx.lineTo(width * 0.72, horizonY - 36);
  ctx.lineTo(width, horizonY - 6);
  ctx.lineTo(width, horizonY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHorizonTrees(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  ecosystem: number,
  time: number
): void {
  const totalSlots = Math.max(8, Math.floor(width / 64));
  const aliveRatio = ecosystem / 100;

  for (let i = 0; i < totalSlots; i++) {
    const x = (i + 0.5) * (width / totalSlots);
    const y = horizonY - 2;
    const isAlive = ((i * 7 + 3) % 10) / 10 < aliveRatio;

    if (isAlive) {
      const sway = Math.sin(time * 1.8 + i) * 1.5;
      ctx.fillStyle = '#5C3A21';
      ctx.fillRect(x - 3, y - 16, 6, 16);
      ctx.fillStyle = i % 2 === 0 ? '#15803D' : '#16A34A';
      ctx.beginPath();
      ctx.arc(x + sway, y - 22, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(x + sway - 3, y - 25, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(x - 4, y - 8, 8, 8);
      ctx.fillStyle = '#D97706';
      ctx.beginPath();
      ctx.ellipse(x, y - 8, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlantationSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ecosystem: number
): void {
  ctx.save();
  ctx.fillStyle = '#451A03';
  ctx.fillRect(x + 12, y - 22, 5, 22);
  ctx.fillRect(x + 74, y - 22, 5, 22);

  roundRectPath(ctx, x, y - 46, 92, 26, 5);
  ctx.fillStyle = '#92400E';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#451A03';
  ctx.stroke();

  ctx.fillStyle = '#FEF3C7';
  ctx.font = '800 9.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ecosystem < 30 ? 'ZONA ASAP!' : 'PT. SAWIT SULTAN', x + 46, y - 33);
  ctx.restore();
}

function drawPlot(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  rect: PlotRect,
  isHovered: boolean,
  toolMode: ToolMode,
  time: number,
  harvestBlocked: boolean,
  highlightTapHint: boolean
): void {
  const { x, y, w, h } = rect;
  const bounceScale = 1 + plot.bounce * 0.08;
  const shakeX = plot.shake > 0 ? Math.sin(time * 55) * plot.shake * 4 : 0;

  ctx.save();
  ctx.translate(x + w / 2 + shakeX, y + h / 2);
  ctx.scale(bounceScale, bounceScale);
  ctx.translate(-w / 2, -h / 2);

  // Crisp drop shadow
  roundRectPath(ctx, 2, 6, w, h, 14);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill();

  // Timber frame with comic outline
  roundRectPath(ctx, 0, 0, w, h, 14);
  ctx.fillStyle = isHovered ? '#D97706' : '#92400E';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#451A03';
  ctx.stroke();

  // Inner fertile soil bed
  const pad = 7;
  roundRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, 9);
  if (plot.isFlooded) {
    ctx.fillStyle = '#713F12';
  } else if (plot.state === 'ROTTEN') {
    ctx.fillStyle = '#3F2E21';
  } else {
    ctx.fillStyle = isHovered ? '#78482A' : '#5E371E';
  }
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3E2210';
  ctx.stroke();

  // Soil furrows with highlight edge
  for (let i = 1; i <= 3; i++) {
    const fy = pad + ((h - pad * 2) * i) / 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad + 12, fy);
    ctx.lineTo(w - pad - 12, fy);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 220, 180, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 12, fy + 2);
    ctx.lineTo(w - pad - 12, fy + 2);
    ctx.stroke();
  }

  // Hover or active empty plot affordance
  if (plot.state === 'EMPTY' && !plot.isFlooded) {
    if (isHovered) {
      roundRectPath(ctx, 1, 1, w - 2, h - 2, 13);
      ctx.strokeStyle = toolMode === 'SAWIT' ? '#FDE047' : '#6EE7B7';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const pulse = isHovered ? 1.1 : 1 + Math.sin(time * 4 + plot.index) * 0.04;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(pulse, pulse);

    ctx.fillStyle =
      toolMode === 'SAWIT'
        ? isHovered
          ? 'rgba(251, 191, 36, 0.35)'
          : 'rgba(251, 191, 36, 0.16)'
        : isHovered
          ? 'rgba(52, 211, 153, 0.35)'
          : 'rgba(52, 211, 153, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = toolMode === 'SAWIT' ? 'rgba(253, 224, 71, 0.7)' : 'rgba(110, 231, 183, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = '#FEF3C7';
    ctx.font = '800 18px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', 0, 1);
    ctx.restore();

    if (highlightTapHint || isHovered) {
      ctx.fillStyle = 'rgba(254, 243, 199, 0.85)';
      ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toolMode === 'SAWIT' ? 'KLIK TANAM SAWIT' : 'KLIK TANAM HUTAN', w / 2, h - 16);
    }
  }

  // Draw tree / state inside plot
  const cx = w / 2;
  const baseY = h * 0.73;
  const unit = Math.min(w, h);

  if (plot.state === 'GROWING' && plot.treeType) {
    const progress = Math.min(1, plot.growTimer / plot.growDuration);
    if (plot.treeType === 'SAWIT') {
      drawGrowingSawit(ctx, cx, baseY, unit, progress, time, plot.index);
    } else {
      drawGrowingHutan(ctx, cx, baseY, unit, progress, time, plot.index);
    }
    drawProgressBar(
      ctx,
      w * 0.16,
      h - 15,
      w * 0.68,
      7,
      progress,
      plot.treeType === 'SAWIT' ? '#FBBF24' : '#34D399'
    );
  } else if (plot.state === 'READY' && plot.treeType) {
    if (plot.treeType === 'SAWIT') {
      const timeLeft = Math.max(0, plot.maxReadyTime - plot.readyTimer);
      const urgent = timeLeft < 2.8;
      drawReadySawit(ctx, cx, baseY, unit, time, plot.index, urgent, harvestBlocked, isHovered);

      const ratio = timeLeft / plot.maxReadyTime;
      drawProgressBar(ctx, w * 0.16, h - 15, w * 0.68, 7, ratio, urgent ? '#EF4444' : '#FBBF24');
    } else {
      drawReadyHutan(ctx, cx, baseY, unit, time, plot.index, isHovered);
      const ratio = Math.max(0, 1 - plot.readyTimer / plot.maxReadyTime);
      drawProgressBar(ctx, w * 0.2, h - 15, w * 0.6, 6, ratio, '#34D399');
    }
  } else if (plot.state === 'ROTTEN') {
    drawRottenSawit(ctx, cx, baseY, unit, time, plot.index, isHovered);
  }

  ctx.restore();
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string
): void {
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();

  const fillW = Math.max(0, Math.min(1, ratio)) * w;
  if (fillW > 1) {
    roundRectPath(ctx, x, y, fillW, h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawGrowingSawit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  unit: number,
  progress: number,
  time: number,
  seed: number
): void {
  const sway = Math.sin(time * 3 + seed) * 2.5;
  ctx.save();
  ctx.translate(cx, baseY);

  ctx.fillStyle = '#3E2210';
  ctx.beginPath();
  ctx.ellipse(0, 2, unit * 0.18, unit * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  if (progress < 0.35) {
    const s = 0.65 + (progress / 0.35) * 0.35;
    ctx.scale(s, s);
    ctx.strokeStyle = '#65A30D';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sway * 0.5, -10, sway, -18);
    ctx.stroke();

    ctx.fillStyle = '#A3E635';
    ctx.strokeStyle = '#365314';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sway - 7, -18, 8, 4.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sway + 7, -17, 8, 4.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (progress < 0.72) {
    const p = (progress - 0.35) / 0.37;
    const h = lerp(24, 38, p);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-4, -h * 0.45, 8, h * 0.45);

    const angles = [-2.3, -1.7, -1.0, -0.4, -2.7];
    angles.forEach((ang, idx) => {
      const len = lerp(17, 27, p);
      ctx.save();
      ctx.translate(0, -h * 0.45);
      ctx.rotate(ang + Math.PI / 2 + sway * 0.015 * (idx % 2 === 0 ? 1 : -1));
      ctx.fillStyle = idx % 2 === 0 ? '#22C55E' : '#16A34A';
      ctx.strokeStyle = '#14532D';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -len * 0.55, 5.5, len * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  } else {
    const p = (progress - 0.72) / 0.28;
    const trunkH = lerp(26, unit * 0.43, p);
    drawPalmTrunk(ctx, 0, 0, sway * 0.5, -trunkH, 8.5);
    drawPalmCrown(ctx, sway * 0.5, -trunkH, unit * lerp(0.25, 0.33, p), time, seed, '#16A34A', '#4ADE80');
  }

  ctx.restore();
}

function drawReadySawit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  unit: number,
  time: number,
  seed: number,
  urgent: boolean,
  harvestBlocked: boolean,
  isHovered: boolean
): void {
  const jitter = urgent ? Math.sin(time * 32 + seed) * 2.5 : 0;
  const sway = Math.sin(time * 2.4 + seed) * 3 + jitter;
  const trunkH = unit * 0.48;

  ctx.save();
  ctx.translate(cx, baseY);

  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(0, 3, unit * 0.25, unit * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  drawPalmTrunk(ctx, 0, 0, sway * 0.6, -trunkH, 10.5);

  const crownX = sway * 0.6;
  const crownY = -trunkH;
  const pulse = 1 + Math.sin(time * (urgent ? 12 : 5) + seed) * 0.08;

  ctx.save();
  ctx.translate(crownX, crownY + 8);
  ctx.scale(pulse, pulse);

  const bunchOffsets = [
    { x: -8, y: 2 },
    { x: 8, y: 3 },
    { x: 0, y: 7 },
  ];
  bunchOffsets.forEach((b) => {
    ctx.fillStyle = urgent && Math.floor(time * 8) % 2 === 0 ? '#EF4444' : '#EA580C';
    ctx.strokeStyle = '#7C2D12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, unit * 0.088, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(b.x - 2, b.y - 2, unit * 0.036, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  drawPalmCrown(ctx, crownX, crownY, unit * 0.37, time, seed, '#15803D', '#4ADE80');

  const bobY = crownY - unit * 0.35 + Math.sin(time * 6 + seed) * 3;
  if (!harvestBlocked) {
    const label = urgent ? 'SEGERA!' : 'PANEN!';
    roundRectPath(ctx, -30, bobY - 10, 60, 20, 7);
    ctx.fillStyle = urgent ? '#DC2626' : isHovered ? '#FEF08A' : '#FBBF24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#451A03';
    ctx.stroke();

    ctx.fillStyle = urgent ? '#FFFFFF' : '#451A03';
    ctx.font = '800 10px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, bobY);
  } else {
    roundRectPath(ctx, -32, bobY - 10, 64, 20, 7);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0F172A';
    ctx.stroke();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 9.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DIBLOKIR', 0, bobY);
  }

  ctx.restore();
}

function drawRottenSawit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  unit: number,
  time: number,
  seed: number,
  isHovered: boolean
): void {
  const trunkH = unit * 0.4;
  ctx.save();
  ctx.translate(cx, baseY);

  drawPalmTrunk(ctx, 0, 0, 3, -trunkH, 8, '#57534E', '#44403C');
  drawPalmCrown(ctx, 3, -trunkH, unit * 0.28, time * 0.4, seed, '#713F12', '#854D0E', true);

  ctx.fillStyle = '#581C87';
  ctx.strokeStyle = '#2E1065';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(3, -trunkH + 7, unit * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  for (let f = 0; f < 3; f++) {
    const angle = time * 6 + f * 2.1 + seed;
    const fx = 3 + Math.cos(angle) * 18;
    const fy = -trunkH + 4 + Math.sin(angle * 1.4) * 11;
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const bob = Math.sin(time * 5 + seed) * 2;
  roundRectPath(ctx, -32, -trunkH - unit * 0.3 + bob, 64, 20, 7);
  ctx.fillStyle = isHovered ? '#F87171' : '#991B1B';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#450A0A';
  ctx.stroke();
  ctx.fillStyle = '#FEF2F2';
  ctx.font = '800 9.5px "Bricolage Grotesque", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUSUK! KLIK', 0, -trunkH - unit * 0.3 + bob + 10);

  ctx.restore();
}

function drawPalmTrunk(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  baseWidth: number,
  c1 = '#A16207',
  c2 = '#78350F'
): void {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const sx = lerp(x0, x1, t0);
    const sy = lerp(y0, y1, t0);
    const ex = lerp(x0, x1, t1);
    const ey = lerp(y0, y1, t1);
    const w = lerp(baseWidth, baseWidth * 0.55, t0);

    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = w + 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = i % 2 === 0 ? c1 : c2;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
}

function drawPalmCrown(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  time: number,
  seed: number,
  darkColor: string,
  lightColor: string,
  droopy = false
): void {
  const frondAngles = [-2.5, -1.9, -1.2, -0.5, 0.3, 0.9, -3.0];
  frondAngles.forEach((ang, idx) => {
    const sway = Math.sin(time * 2.5 + seed + idx) * 0.07;
    const droop = droopy ? 0.45 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + sway + (ang > -1.5 ? droop : -droop));

    ctx.fillStyle = idx % 2 === 0 ? darkColor : lightColor;
    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(radius * 0.6, -radius * 0.25, radius, 0);
    ctx.quadraticCurveTo(radius * 0.55, radius * 0.22, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawGrowingHutan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  unit: number,
  progress: number,
  time: number,
  seed: number
): void {
  const sway = Math.sin(time * 2.6 + seed) * 2;
  ctx.save();
  ctx.translate(cx, baseY);

  if (progress < 0.35) {
    const s = 0.7 + (progress / 0.35) * 0.3;
    ctx.scale(s, s);
    ctx.strokeStyle = '#15803D';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sway, -18);
    ctx.stroke();

    ctx.fillStyle = '#34D399';
    ctx.strokeStyle = '#065F46';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sway - 5, -18, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sway + 5, -19, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const p = (progress - 0.35) / 0.65;
    const trunkH = lerp(20, unit * 0.4, p);
    ctx.fillStyle = '#E7E5E4';
    ctx.strokeStyle = '#57534E';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-3.5, -trunkH, 7, trunkH);
    ctx.strokeRect(-3.5, -trunkH, 7, trunkH);

    const canopyR = lerp(12, unit * 0.24, p);
    ctx.fillStyle = '#059669';
    ctx.strokeStyle = '#064E3B';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(sway, -trunkH, canopyR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(sway - canopyR * 0.35, -trunkH - canopyR * 0.25, canopyR * 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawReadyHutan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  unit: number,
  time: number,
  seed: number,
  isHovered: boolean
): void {
  const sway = Math.sin(time * 2 + seed) * 2.5;
  const trunkH = unit * 0.44;
  const r = unit * 0.26;

  ctx.save();
  ctx.translate(cx, baseY);

  ctx.fillStyle = 'rgba(6, 78, 59, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 3, unit * 0.28, unit * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E7E5E4';
  ctx.strokeStyle = '#57534E';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-4.5, -trunkH, 9, trunkH);
  ctx.strokeRect(-4.5, -trunkH, 9, trunkH);

  ctx.fillStyle = '#047857';
  ctx.strokeStyle = '#064E3B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sway - r * 0.55, -trunkH + 4, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sway + r * 0.55, -trunkH + 4, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(sway, -trunkH - 6, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#6EE7B7';
  ctx.beginPath();
  ctx.arc(sway - r * 0.25, -trunkH - 12, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  const bx = sway + Math.cos(time * 3.5 + seed) * r * 0.9;
  const by = -trunkH - r * 0.8 + Math.sin(time * 7 + seed) * 5;
  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.ellipse(bx - 2, by, 3, 2, -0.4, 0, Math.PI * 2);
  ctx.ellipse(bx + 2, by, 3, 2, 0.4, 0, Math.PI * 2);
  ctx.fill();

  if (isHovered) {
    roundRectPath(ctx, -34, -trunkH - r - 18, 68, 18, 6);
    ctx.fillStyle = '#065F46';
    ctx.fill();
    ctx.strokeStyle = '#A7F3D0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ECFDF5';
    ctx.font = '800 9.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RAPIKAN', 0, -trunkH - r - 9);
  }

  ctx.restore();
}

function drawFloodOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  waterLevel: number,
  debris: { x: number; yOffset: number; speed: number; kind: 'SANDAL' | 'DUCK' | 'TWIG'; bobOffset: number }[],
  remaining: number
): void {
  const topY = height - height * 0.74 * waterLevel;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, topY);
  for (let x = 0; x <= width; x += 24) {
    const wave = Math.sin(x * 0.025 + time * 5) * 7 + Math.cos(x * 0.04 - time * 3) * 4;
    ctx.lineTo(x, topY + wave);
  }
  ctx.lineTo(width, height);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, topY, 0, height);
  grad.addColorStop(0, 'rgba(146, 98, 57, 0.72)');
  grad.addColorStop(1, 'rgba(92, 61, 34, 0.86)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(254, 243, 199, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 24) {
    const wave = Math.sin(x * 0.025 + time * 5) * 7 + Math.cos(x * 0.04 - time * 3) * 4;
    if (x === 0) ctx.moveTo(x, topY + wave);
    else ctx.lineTo(x, topY + wave);
  }
  ctx.stroke();

  debris.forEach((item) => {
    const dx = ((item.x + time * item.speed) % (width + 80)) - 40;
    const dy = topY + 28 + item.yOffset * (height - topY - 60) + Math.sin(time * 4 + item.bobOffset) * 5;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(Math.sin(time * 3 + item.bobOffset) * 0.25);

    if (item.kind === 'SANDAL') {
      roundRectPath(ctx, -14, -7, 28, 14, 7);
      ctx.fillStyle = '#F8FAFC';
      ctx.fill();
      ctx.strokeStyle = '#0284C7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 4);
      ctx.stroke();
    } else if (item.kind === 'DUCK') {
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.ellipse(0, 2, 11, 8, 0, 0, Math.PI * 2);
      ctx.arc(7, -5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.lineTo(18, -4);
      ctx.lineTo(12, -2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(14, -2);
      ctx.stroke();
    }
    ctx.restore();
  });

  roundRectPath(ctx, width / 2 - 90, topY + 12, 180, 26, 8);
  ctx.fillStyle = 'rgba(69, 26, 3, 0.9)';
  ctx.fill();
  ctx.fillStyle = '#FEF3C7';
  ctx.font = '800 12px "Bricolage Grotesque", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`BANJIR SURUT: ${remaining.toFixed(1)}s`, width / 2, topY + 25);

  ctx.restore();
}

function drawOrangutan(ctx: CanvasRenderingContext2D, event: OrangutanEvent, time: number): void {
  const { x, y, radius, clicksRemaining, calmed, hitFlash, thrownFruits } = event;

  thrownFruits.forEach((f) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(-2, -2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  const hop = calmed ? Math.abs(Math.sin(time * 8)) * -6 : Math.abs(Math.sin(time * 12)) * -10;
  ctx.translate(x, y + hop);

  if (hitFlash > 0) {
    ctx.scale(1.12, 0.9);
  }

  if (!calmed) {
    const ringR = radius + 8 + Math.sin(time * 10) * 4;
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const armWave = Math.sin(time * 14) * 14;
  ctx.strokeStyle = '#C2410C';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, 6);
  ctx.lineTo(-42, calmed ? -16 : -22 + armWave);
  ctx.moveTo(22, 6);
  ctx.lineTo(42, calmed ? -16 : -22 - armWave);
  ctx.stroke();

  ctx.fillStyle = hitFlash > 0 ? '#FDBA74' : '#EA580C';
  ctx.strokeStyle = '#7C2D12';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 14, 30, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -14, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9A3412';
  ctx.beginPath();
  ctx.ellipse(0, -12, 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FED7AA';
  ctx.beginPath();
  ctx.ellipse(0, -10, 17, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  if (calmed) {
    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-6, -15, 4, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6, -15, 4, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-6, -15, 5, 0, Math.PI * 2);
    ctx.arc(6, -15, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1C1917';
    ctx.beginPath();
    ctx.arc(-6, -15, 2.5, 0, Math.PI * 2);
    ctx.arc(6, -15, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -22);
    ctx.lineTo(-2, -18);
    ctx.moveTo(12, -22);
    ctx.lineTo(2, -18);
    ctx.stroke();
  }

  ctx.fillStyle = '#451A03';
  ctx.beginPath();
  if (calmed) {
    ctx.arc(0, -4, 7, 0, Math.PI);
  } else {
    ctx.ellipse(0, -3, 7, 5, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  if (calmed) {
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(24, -6, 10, 0.3, 2.4);
    ctx.stroke();
  }

  const badgeY = -56;
  roundRectPath(ctx, -68, badgeY - 12, 136, 24, 8);
  ctx.fillStyle = calmed ? '#059669' : '#18181B';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = calmed ? '#A7F3D0' : '#FACC15';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 11px "Bricolage Grotesque", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    calmed ? 'MAKASIH PISANGNYA!' : `KLIK! KASIH PISANG (${3 - clicksRemaining}/3)`,
    0,
    badgeY
  );

  ctx.restore();
}

function drawDemoProtesters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  demo: {
    protesters: { xNorm: number; bounceOffset: number; shirtColor: string; signText: string; hasMegaphone: boolean }[];
    forestPlantedDuringDemo: number;
    requiredForest: number;
    dispersing: boolean;
    disperseTimer: number;
  }
): void {
  const baseY = height - 18;
  const slideOut = demo.dispersing ? demo.disperseTimer * 160 : 0;

  ctx.save();
  demo.protesters.forEach((p, idx) => {
    const px = width * p.xNorm + (idx % 2 === 0 ? -slideOut : slideOut);
    const bounce = Math.abs(Math.sin(time * 9 + p.bounceOffset)) * -7;
    const py = baseY + bounce;

    ctx.save();
    ctx.translate(px, py);

    const signSwing = Math.sin(time * 6 + idx) * 0.06;
    ctx.save();
    ctx.translate(0, -52);
    ctx.rotate(signSwing);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-2, 0, 4, 34);

    const signW = Math.min(136, Math.max(96, width * 0.16));
    roundRectPath(ctx, -signW / 2, -28, signW, 30, 5);
    ctx.fillStyle = '#FEF9C3';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#DC2626';
    ctx.stroke();

    ctx.fillStyle = '#991B1B';
    ctx.font = '800 9px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.signText, 0, -13);
    ctx.restore();

    roundRectPath(ctx, -12, -26, 24, 24, 7);
    ctx.fillStyle = p.shirtColor;
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#FDBA74';
    ctx.beginPath();
    ctx.arc(0, -35, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-10, -40, 20, 4);

    ctx.fillStyle = '#7F1D1D';
    ctx.beginPath();
    ctx.arc(0, -31, 3, 0, Math.PI * 2);
    ctx.fill();

    if (p.hasMegaphone) {
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.moveTo(8, -32);
      ctx.lineTo(22, -39);
      ctx.lineTo(22, -25);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  });

  if (!demo.dispersing) {
    const bw = Math.min(350, width - 32);
    roundRectPath(ctx, width / 2 - bw / 2, 12, bw, 32, 8);
    ctx.fillStyle = 'rgba(153, 27, 27, 0.94)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FEF08A';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 12px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `DEMO WARGA! Panen diblokir · Tanam Hutan: ${demo.forestPlantedDuringDemo}/${demo.requiredForest}`,
      width / 2,
      28
    );
  }

  ctx.restore();
}

function drawSmogHaze(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number
): void {
  ctx.save();
  ctx.fillStyle = `rgba(68, 64, 60, ${0.22 + intensity * 0.25})`;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(120, 113, 108, ${0.18 + intensity * 0.18})`;
  for (let i = 0; i < 6; i++) {
    const sx = ((time * (22 + i * 5) + i * 240) % (width + 260)) - 130;
    const sy = height * (0.18 + (i % 3) * 0.28);
    ctx.beginPath();
    ctx.arc(sx, sy, 85, 0, Math.PI * 2);
    ctx.arc(sx + 65, sy + 10, 70, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  particles.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha * (p.life / p.maxLife));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    if (p.kind === 'COIN') {
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#B45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#92400E';
      ctx.font = `800 ${Math.max(8, Math.round(p.size * 0.9))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Rp', 0, 1);
    } else if (p.kind === 'LEAF') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'BANANA') {
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0.2, 2.3);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  texts.forEach((ft) => {
    const progress = 1 - ft.life / ft.maxLife;
    const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(ft.x, ft.y);
    ctx.scale(ft.scale, ft.scale);

    ctx.font = '800 17px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = ft.strokeColor;
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  });
}
