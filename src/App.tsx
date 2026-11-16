import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Coins,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sprout,
  Trees,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from './game/audio';
import { SawitGameEngine } from './game/engine';
import { GameHudSnapshot } from './game/types';

function formatMoney(juta: number): string {
  if (juta >= 1000) {
    const m = (juta / 1000).toFixed(2).replace(/\.00$/, '');
    return `Rp ${m} Miliar`;
  }
  return `Rp ${juta} Juta`;
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getSultanTitle(ecosystem: number): { title: string; subtitle: string; tone: string } {
  if (ecosystem > 70) {
    return {
      title: 'Sultan Sawit Ramah Lingkungan',
      subtitle: 'Cuan miliaran masuk rekening, hutan lestari, orangutan pun ikut senyum!',
      tone: 'text-emerald-300',
    };
  }
  if (ecosystem >= 35) {
    return {
      title: 'Juragan Main Aman',
      subtitle: 'Tahu kapan harus gas pol sawit, tahu kapan wajib tanam sengon.',
      tone: 'text-amber-300',
    };
  }
  return {
    title: 'Juragan Rakus',
    subtitle: 'Saldo Rp 1 Miliar tercapai, tapi asap tebal dan warga sudah siap menggeruduk!',
    tone: 'text-orange-400',
  };
}

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [muted, setMuted] = useState(false);
  const engineRef = useRef<SawitGameEngine | null>(null);
  const [hud, setHud] = useState<GameHudSnapshot>(() => {
    const engine = new SawitGameEngine((snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    return engine.getSnapshot();
  });

  // Sync canvas dimensions & start crisp HiDPI animation loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!container || !canvas || !engine) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      engine.setCanvasSize(w, h);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener('resize', updateSize);

    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      engine.update(dt);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        engine.render(ctx);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
      soundEngine.stopMusic();
    };
  }, []);

  // Keyboard shortcuts: 1 & 2 to switch tools, Escape/P to pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.key === '1') {
        engine.setToolMode('SAWIT');
      } else if (e.key === '2') {
        engine.setToolMode('HUTAN');
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (engine.getPhase() === 'PLAYING' || engine.getPhase() === 'PAUSED') {
          engine.togglePause();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
    if (!nextMuted && engineRef.current?.getPhase() === 'PLAYING') {
      soundEngine.startMusic();
    }
  };

  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getPointerCoords(e);
    engineRef.current?.handlePointerDown(x, y);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getPointerCoords(e);
    engineRef.current?.handlePointerMove(x, y);
  };

  const handleCanvasPointerLeave = () => {
    engineRef.current?.handlePointerMove(-9999, -9999);
  };

  const { phase, toolMode, stats, activeEvent, gameOverReason, isCriticalEco } = hud;
  const moneyPct = Math.min(100, Math.round((stats.money / stats.targetMoney) * 100));
  const ecoStatusText =
    stats.ecosystem >= 50 ? 'AMAN' : stats.ecosystem >= 30 ? 'WASPADA' : 'KRITIS!';
  const ecoBarColor =
    stats.ecosystem >= 50
      ? 'bg-emerald-500'
      : stats.ecosystem >= 30
        ? 'bg-amber-500'
        : 'bg-red-500';

  const sultanRank = getSultanTitle(stats.ecosystem);
  const showFirstStepTip =
    phase === 'PLAYING' && stats.sawitPlanted === 0 && stats.hutanPlanted === 0 && !activeEvent;

  return (
    <div className="h-dvh w-screen flex flex-col bg-[#102318] text-stone-100 overflow-hidden">
      {/* Top HUD Bar */}
      <header className="shrink-0 bg-[#0C1B12] border-b border-emerald-900/70 px-3 py-2 sm:px-5 sm:py-2.5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-5">
          {/* Metric 1: Saldo Cuan */}
          <div className="flex-1 min-w-[140px] max-w-xs">
            <div className="flex items-center justify-between text-xs text-stone-300 mb-1">
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300 whitespace-nowrap">
                <Coins className="w-3.5 h-3.5 shrink-0" />
                Saldo Cuan
              </span>
              <span className="font-mono-num text-[11px] text-stone-400 whitespace-nowrap">
                Target Rp 1 M
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-num text-sm sm:text-base font-bold text-amber-200 whitespace-nowrap">
                {formatMoney(stats.money)}
              </span>
              <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-[width] duration-150"
                  style={{ width: `${moneyPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Metric 2: Bar Ekosistem */}
          <div className="flex-1 min-w-[140px] max-w-xs">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300 whitespace-nowrap">
                {isCriticalEco ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                ) : (
                  <Trees className="w-3.5 h-3.5 shrink-0" />
                )}
                Ekosistem
              </span>
              <span
                className={`font-mono-num text-[11px] font-bold whitespace-nowrap ${
                  stats.ecosystem >= 50
                    ? 'text-emerald-300'
                    : stats.ecosystem >= 30
                      ? 'text-amber-300'
                      : 'text-red-400'
                }`}
              >
                {stats.ecosystem}% · {ecoStatusText}
              </span>
            </div>
            <div className="h-2.5 bg-stone-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-[width] duration-150 ${ecoBarColor}`}
                style={{ width: `${stats.ecosystem}%` }}
              />
            </div>
          </div>

          {/* Metric 3: Hari, Timer & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden xs:flex sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-stone-900/80 border border-stone-800 text-xs">
              <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="font-mono-num font-bold text-stone-100 whitespace-nowrap">
                Hari {stats.day} · {formatTimer(stats.elapsedSeconds)}
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Nyalakan Suara' : 'Matikan Suara'}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {(phase === 'PLAYING' || phase === 'PAUSED') && (
              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                aria-label={phase === 'PAUSED' ? 'Lanjutkan Game' : 'Jeda Game'}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer"
              >
                {phase === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active Chaos Warning Bar OR First-Step Hint */}
      {phase === 'PLAYING' && (activeEvent || isCriticalEco) && (
        <div
          className={`shrink-0 px-3 py-1.5 text-center text-xs sm:text-sm font-semibold border-b ${
            activeEvent
              ? 'bg-red-950/90 text-amber-200 border-red-800/70'
              : 'bg-amber-950/80 text-amber-200 border-amber-800/60'
          }`}
        >
          {activeEvent?.type === 'ORANGUTAN' && (
            <span>
              ORANGUTAN NGAMUK! Klik orangutannya {activeEvent.clicksRemaining}x lagi untuk kasih pisang!
            </span>
          )}
          {activeEvent?.type === 'BANJIR' && (
            <span>
              BANJIR BANDANG! Lahan terendam {activeEvent.remaining.toFixed(1)} detik, tidak bisa tanam baru!
            </span>
          )}
          {activeEvent?.type === 'DEMO' && (
            <span>
              SIDAK LSM & WARGA DEMO! Panen diblokir — tanam Pohon Hutan ({activeEvent.forestPlantedDuringDemo}/
              {activeEvent.requiredForest})!
            </span>
          )}
          {!activeEvent && isCriticalEco && (
            <span>
              PERINGATAN ASAP! Ekosistem di bawah 30% — segera tanam Pohon Hutan sebelum bencana datang!
            </span>
          )}
        </div>
      )}

      {showFirstStepTip && (
        <div className="shrink-0 px-3 py-1.5 text-center text-xs sm:text-sm font-semibold bg-emerald-950/90 text-emerald-200 border-b border-emerald-800/60">
          Pilih mode di bawah, lalu klik petak tanah coklat untuk mulai menanam!
        </div>
      )}

      {/* Main Game Canvas Stage */}
      <main ref={containerRef} className="relative flex-1 min-h-0 w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
          className="block w-full h-full cursor-pointer touch-none"
        />

        {/* Start Screen Overlay */}
        {phase === 'TITLE' && (
          <div className="absolute inset-0 bg-[#0A1810]/78 backdrop-blur-xs flex items-center justify-center p-4 z-20">
            <div className="w-full max-w-lg bg-[#152C1F] border border-emerald-700/60 rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 shrink-0 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center">
                  <svg viewBox="0 0 64 64" className="w-12 h-12" aria-hidden="true">
                    <circle cx="32" cy="34" r="18" fill="#FDBA74" />
                    <path d="M14 26 C18 10, 46 10, 50 26 Z" fill="#D97706" />
                    <rect x="10" y="24" width="44" height="5" rx="2.5" fill="#92400E" />
                    <rect x="19" y="29" width="11" height="7" rx="2" fill="#18181B" />
                    <rect x="34" y="29" width="11" height="7" rx="2" fill="#18181B" />
                    <line x1="30" y1="32" x2="34" y2="32" stroke="#18181B" strokeWidth="2" />
                    <path d="M25 41 Q32 47 39 41" fill="none" stroke="#7C2D12" strokeWidth="2.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-300 tracking-wide">
                    Simulasi Satir Perkebunan
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                    Sawit Sultan: Juragan Lahan
                  </h1>
                </div>
              </div>

              <p className="text-sm text-stone-300 leading-relaxed mb-5">
                Kejar target cuan <strong className="text-amber-300">Rp 1 Miliar</strong> dari lahan 4x3 petak. Jangan cuma babat hutan demi sawit—jika Ekosistem turun di bawah <strong className="text-red-300">30%</strong>, bersiaplah kena azab orangutan ngamuk, banjir bandang, dan demo warga!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-xs">
                <div className="bg-stone-900/70 border border-amber-500/30 rounded-xl p-3">
                  <div className="font-bold text-amber-300 mb-1">[1] Tanam Sawit</div>
                  <div className="text-stone-300">Modal Rp 10 Jt · Panen Rp 50 Jt · Alam -8%</div>
                </div>
                <div className="bg-stone-900/70 border border-emerald-500/30 rounded-xl p-3">
                  <div className="font-bold text-emerald-300 mb-1">[2] Tanam Pohon Hutan</div>
                  <div className="text-stone-300">Modal Rp 5 Jt · Pulihkan Alam +15%</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame()}
                className="w-full min-h-[52px] px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-stone-950 font-display font-extrabold text-base sm:text-lg transition-all cursor-pointer shadow-lg"
              >
                MULAI JADI SULTAN
              </button>
            </div>
          </div>
        )}

        {/* Pause Overlay */}
        {phase === 'PAUSED' && (
          <div className="absolute inset-0 bg-[#0A1810]/80 backdrop-blur-sm flex items-center justify-center p-4 z-20">
            <div className="w-full max-w-sm bg-[#152C1F] border border-emerald-700/60 rounded-2xl p-6 text-center shadow-2xl">
              <h2 className="text-2xl font-extrabold text-white mb-2">Istirahat Sejenak</h2>
              <p className="text-sm text-stone-300 mb-6">
                Kopi dulu, Juragan. Kebun sawit menunggu komando Anda.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => engineRef.current?.togglePause()}
                  className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-display font-extrabold transition-colors cursor-pointer"
                >
                  LANJUTKAN MAIN
                </button>
                <button
                  type="button"
                  onClick={() => engineRef.current?.startNewGame()}
                  className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold transition-colors cursor-pointer"
                >
                  ULANG DARI AWAL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {phase === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-[#140909]/85 backdrop-blur-sm flex items-center justify-center p-4 z-20">
            <div className="w-full max-w-md bg-[#221212] border border-red-700/60 rounded-2xl p-6 sm:p-7 text-center shadow-2xl">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-red-300 mb-2">
                {gameOverReason === 'ECOSYSTEM_ZERO'
                  ? 'DITANGKAP SATGAS LINGKUNGAN!'
                  : 'BANGKRUT TOTAL, JURAGAN!'}
              </h2>
              <p className="text-sm text-stone-300 mb-5">
                {gameOverReason === 'ECOSYSTEM_ZERO'
                  ? 'Ekosistem menyentuh 0%! Hutan gundul, asap pekat, izin usaha langsung dibekukan.'
                  : 'Modal habis dan tak ada satupun pohon sawit tersisa untuk dipanen.'}
              </p>

              <div className="grid grid-cols-2 gap-3 text-left bg-stone-950/60 rounded-xl p-4 mb-6 text-xs">
                <div>
                  <div className="text-stone-400">Saldo Akhir</div>
                  <div className="font-mono-num text-sm font-bold text-amber-300">
                    {formatMoney(stats.money)}
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Durasi Bertahan</div>
                  <div className="font-mono-num text-sm font-bold text-stone-100">
                    Hari {stats.day} · {formatTimer(stats.elapsedSeconds)}
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Sawit Dipanen</div>
                  <div className="font-mono-num text-sm font-bold text-stone-100">
                    {stats.sawitHarvested} pohon
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Pohon Hutan Ditanam</div>
                  <div className="font-mono-num text-sm font-bold text-emerald-300">
                    {stats.hutanPlanted} pohon
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame()}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-display font-extrabold text-base transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                MAIN LAGI
              </button>
            </div>
          </div>
        )}

        {/* Victory Overlay */}
        {phase === 'VICTORY' && (
          <div className="absolute inset-0 bg-[#0A1810]/85 backdrop-blur-sm flex items-center justify-center p-4 z-20">
            <div className="w-full max-w-md bg-[#14291D] border border-amber-500/60 rounded-2xl p-6 sm:p-7 text-center shadow-2xl">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-amber-300" />
              </div>
              <p className="text-xs font-bold text-amber-300 mb-1">
                TARGET RP 1 MILIAR TERCAPAI!
              </p>
              <h2 className={`text-2xl font-extrabold mb-2 ${sultanRank.tone}`}>
                {sultanRank.title}
              </h2>
              <p className="text-sm text-stone-300 mb-5">{sultanRank.subtitle}</p>

              <div className="grid grid-cols-2 gap-3 text-left bg-stone-950/50 rounded-xl p-4 mb-6 text-xs">
                <div>
                  <div className="text-stone-400">Total Cuan</div>
                  <div className="font-mono-num text-sm font-bold text-amber-300">
                    {formatMoney(stats.money)}
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Ekosistem Akhir</div>
                  <div className="font-mono-num text-sm font-bold text-emerald-300">
                    {stats.ecosystem}%
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Waktu</div>
                  <div className="font-mono-num text-sm font-bold text-stone-100">
                    Hari {stats.day} · {formatTimer(stats.elapsedSeconds)}
                  </div>
                </div>
                <div>
                  <div className="text-stone-400">Bencana Terlewati</div>
                  <div className="font-mono-num text-sm font-bold text-stone-100">
                    {stats.disastersSurvived}x
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame()}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-display font-extrabold text-base transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                MAIN LAGI
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Action Dock */}
      <footer className="shrink-0 bg-[#0C1B12] border-t border-emerald-900/70 px-3 py-2.5 sm:px-5 sm:py-3">
        {phase === 'TITLE' ? (
          <div className="max-w-3xl mx-auto text-center text-xs sm:text-sm text-stone-400 py-2">
            Tekan <strong className="text-amber-300">MULAI JADI SULTAN</strong> di atas untuk membuka lahan kebun sawit Anda.
          </div>
        ) : (
          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-2.5 sm:gap-4">
            <button
              type="button"
              onClick={() => engineRef.current?.setToolMode('SAWIT')}
              className={`min-h-[54px] flex items-center justify-between gap-2 px-3 py-2 sm:px-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                toolMode === 'SAWIT'
                  ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                  : 'bg-stone-900/70 border-stone-700/80 text-stone-300 hover:border-stone-500'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-amber-400 text-stone-950 font-mono-num font-bold text-xs flex items-center justify-center">
                  1
                </span>
                <div className="min-w-0">
                  <div className="font-display font-bold text-xs sm:text-sm truncate">
                    Tanam Sawit
                  </div>
                  <div className="text-[11px] text-amber-200/90 truncate">
                    Modal 10Jt · Panen 50Jt · Alam -8%
                  </div>
                </div>
              </div>
              <Sprout className="w-5 h-5 text-amber-400 shrink-0 hidden sm:block" />
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.setToolMode('HUTAN')}
              className={`min-h-[54px] flex items-center justify-between gap-2 px-3 py-2 sm:px-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                toolMode === 'HUTAN'
                  ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-md'
                  : 'bg-stone-900/70 border-stone-700/80 text-stone-300 hover:border-stone-500'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-emerald-400 text-stone-950 font-mono-num font-bold text-xs flex items-center justify-center">
                  2
                </span>
                <div className="min-w-0">
                  <div className="font-display font-bold text-xs sm:text-sm truncate">
                    Pohon Hutan / Sengon
                  </div>
                  <div className="text-[11px] text-emerald-200/90 truncate">
                    Modal 5Jt · Alam +15%
                  </div>
                </div>
              </div>
              <Trees className="w-5 h-5 text-emerald-400 shrink-0 hidden sm:block" />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
