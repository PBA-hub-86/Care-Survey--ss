import React from 'react';
import { GameStats } from '../types/game';
import {
  Volume2,
  VolumeX,
  Pause,
  Zap,
  Flame,
  Radio,
  Heart,
  Fuel,
  Clock,
  Navigation,
  Siren,
} from 'lucide-react';

interface HUDProps {
  stats: GameStats;
  isMuted: boolean;
  onToggleSound: () => void;
  onPause: () => void;
  onCycleRadio?: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  isMuted,
  onToggleSound,
  onPause,
  onCycleRadio,
}) => {
  const healthPct = Math.max(0, Math.min(100, (stats.health / (stats.maxHealth || 100)) * 100));
  const fuelPct = Math.max(0, Math.min(100, (stats.fuel / (stats.maxFuel || 100)) * 100));
  const isLowTimer = stats.countdownTimer <= 12;
  const isLowFuel = fuelPct <= 25;
  const isLowHealth = healthPct <= 30;
  const pm = stats.passengerMission;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-2.5 sm:p-4 select-none font-sans">
      {/* Top Telemetry Bar (Center viewport remains 100% unobstructed) */}
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-1.5">
        <div
          className={`bg-[#030615f4] border rounded-2xl p-2 sm:p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.65)] flex items-center justify-between gap-2 sm:gap-3 ${
            stats.policeActive ? 'border-red-500 animate-pursuit-glow' : 'border-cyan-500/40'
          }`}
        >
          {/* Speedometer + Level */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-950 border border-cyan-400/50 flex items-center justify-center text-cyan-400 font-mono font-bold shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="text-[9px] uppercase font-mono tracking-wider text-cyan-400 font-semibold flex items-center gap-1">
                <span>SPEED</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold tabular-nums">
                  LVL {stats.driverLevel || stats.level || 1}
                </span>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white tabular-nums tracking-tight leading-none mt-0.5">
                {stats.speed} <span className="text-[10px] sm:text-xs text-cyan-300 font-normal">KM/H</span>
              </div>
            </div>
          </div>

          {/* Tight Countdown Timer */}
          <div
            className={`px-2.5 py-1 rounded-xl border font-mono text-center shrink-0 ${
              isLowTimer
                ? 'bg-red-950/95 border-red-500 text-red-300'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="text-[8px] uppercase tracking-wider text-slate-400 flex items-center justify-center gap-1">
              <Clock className="w-2.5 h-2.5" /> সময়
            </div>
            <div className="text-base sm:text-lg font-black tabular-nums leading-tight">
              {Math.ceil(stats.countdownTimer)}s
            </div>
          </div>

          {/* Distance, Cash & Score */}
          <div className="flex items-center gap-3 sm:gap-4 text-center font-mono">
            <div>
              <div className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                দূরত্ব
              </div>
              <div className="text-sm sm:text-lg font-bold text-white tabular-nums">
                {(stats.distance / 1000).toFixed(2)}{' '}
                <span className="text-[10px] text-slate-400 font-normal">KM</span>
              </div>
            </div>

            <div className="hidden sm:block h-7 w-[1px] bg-slate-700" />

            <div className="hidden sm:block">
              <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-bold">
                আয় (CASH)
              </div>
              <div className="text-base sm:text-lg font-bold text-emerald-300 tabular-nums">
                ৳ {stats.cashCollectedThisRun.toLocaleString()}
              </div>
            </div>

            <div className="hidden md:block h-7 w-[1px] bg-slate-700" />

            <div className="hidden md:block">
              <div className="text-[9px] uppercase tracking-wider text-amber-400 font-bold">
                স্কোর
              </div>
              <div className="text-base sm:text-lg font-bold text-amber-300 tabular-nums">
                {stats.score.toLocaleString()}
                {stats.combo > 1 && (
                  <span className="ml-1 text-xs text-pink-400 bg-pink-500/20 px-1 py-0.5 rounded">
                    {stats.combo.toFixed(1)}x
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Weather Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700/80">
            <span className="text-base">{stats.weather.icon}</span>
            <div className="text-left font-mono leading-tight">
              <div className="text-[9px] font-bold text-slate-300">{stats.weather.name}</div>
              <div className="text-[9px] text-cyan-300 tabular-nums">
                গ্রিপ {Math.round(stats.weather.gripFactor * 100)}%
              </div>
            </div>
          </div>

          {/* Quick Action Buttons (>=44px touch target) */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={onToggleSound}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 flex items-center justify-center transition-colors cursor-pointer"
              title="সাউন্ড অন/অফ"
              aria-label="Toggle Sound"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onPause}
              className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:border-cyan-400 flex items-center justify-center transition-colors cursor-pointer"
              title="পজ করুন"
              aria-label="Pause Game"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-Bar: Health (HP), Fuel, Nitro & Radio */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-mono">
          {/* Health / Damage Bar */}
          <div
            className={`bg-[#030614f0] border rounded-xl px-2.5 py-1.5 ${
              isLowHealth ? 'border-red-500' : 'border-emerald-500/30'
            }`}
          >
            <div className="flex justify-between items-center text-[10px] mb-1">
              <span className={`flex items-center gap-1 font-bold ${isLowHealth ? 'text-red-400' : 'text-emerald-400'}`}>
                <Heart className="w-3 h-3" /> গাড়ির হেলথ (HP)
              </span>
              <span className="text-white font-bold tabular-nums">{Math.round(healthPct)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  healthPct > 55 ? 'bg-emerald-400' : healthPct > 30 ? 'bg-amber-400' : 'bg-red-500'
                }`}
                style={{ width: `${healthPct}%` }}
              />
            </div>
          </div>

          {/* Fuel Gauge */}
          <div
            className={`bg-[#030614f0] border rounded-xl px-2.5 py-1.5 ${
              isLowFuel ? 'border-amber-500' : 'border-amber-500/30'
            }`}
          >
            <div className="flex justify-between items-center text-[10px] mb-1">
              <span className={`flex items-center gap-1 font-bold ${isLowFuel ? 'text-red-400' : 'text-amber-400'}`}>
                <Fuel className="w-3 h-3" /> ফুয়েল (FUEL)
              </span>
              <span className="text-white font-bold tabular-nums">{Math.round(fuelPct)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  fuelPct > 30 ? 'bg-amber-400' : 'bg-red-500'
                }`}
                style={{ width: `${fuelPct}%` }}
              />
            </div>
          </div>

          {/* Nitro Gauge */}
          <div className="bg-[#030614f0] border border-cyan-500/30 rounded-xl px-2.5 py-1.5">
            <div className="flex justify-between items-center text-[10px] mb-1">
              <span className="text-cyan-400 flex items-center gap-1 font-bold">
                <Flame className="w-3 h-3 text-cyan-300" /> নাইট্রো (W)
              </span>
              <span className="text-cyan-200 font-bold tabular-nums">{stats.nitro}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full transition-all duration-75"
                style={{ width: `${stats.nitro}%` }}
              />
            </div>
          </div>

          {/* Highway Radio Bar */}
          {stats.radio && (
            <div className="bg-[#030614f0] border border-cyan-500/30 rounded-xl px-2 py-1 flex items-center justify-between gap-1.5">
              <button
                onClick={onCycleRadio}
                className="pointer-events-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/40 text-cyan-300 transition-colors cursor-pointer shrink-0"
                title="চ্যানেল পরিবর্তন (R কী)"
              >
                <Radio className="w-3 h-3 text-cyan-400" />
                <span className="font-bold text-[10px] truncate max-w-[68px]">{stats.radio.name}</span>
              </button>

              <div className="flex-1 overflow-hidden min-w-0 text-[10px] text-slate-300 truncate">
                {stats.radio.trafficBulletin}
              </div>
            </div>
          )}
        </div>

        {/* Non-blocking Top Row: Passenger GPS Mission & Police Pursuit Alert */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {pm && pm.status !== 'none' && (
            <div
              className={`px-3.5 py-1.5 rounded-xl border font-mono text-xs flex items-center gap-2.5 shadow-lg ${
                pm.status === 'waiting_ahead'
                  ? pm.needsSlowDown
                    ? 'bg-amber-950/95 border-amber-400 text-amber-200'
                    : 'bg-emerald-950/95 border-emerald-400 text-emerald-200'
                  : 'bg-cyan-950/95 border-cyan-400 text-cyan-100'
              }`}
            >
              <Navigation className="w-4 h-4 shrink-0 text-amber-300" />
              {pm.status === 'waiting_ahead' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-white">
                    🙋 যাত্রী স্টপেজ: {pm.pickupStopName}
                  </span>
                  <span className="text-emerald-300 font-bold tabular-nums">
                    ({Math.max(0, Math.round(pm.distanceRemaining))}m সামনে)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-black font-black text-[10px]">
                    {pm.needsSlowDown
                      ? 'ডান লেনে ব্রেক (S/↓) চেপে গতি কমান!'
                      : 'ডান লেনে যান ও যাত্রী তুলুন · ভাড়া ৳' + pm.fareTaka}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-white">
                    🚕 যাত্রী: {pm.passengerName} ➜ {pm.destinationName}
                  </span>
                  <span className="text-cyan-300 font-bold tabular-nums">
                    দূরত্ব {Math.max(0, Math.round(pm.distanceRemaining))}m · সময়{' '}
                    {Math.max(0, Math.ceil(pm.timeRemaining))}s
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-400 text-black font-black text-[10px] tabular-nums">
                    ভাড়া ৳{pm.fareTaka} (+{pm.xpReward} XP)
                  </span>
                </div>
              )}
            </div>
          )}

          {stats.policeActive && (
            <div className="px-3 py-1.5 rounded-xl bg-red-950/95 border border-red-500 text-red-200 font-mono text-[11px] font-bold flex items-center gap-2 shadow-lg">
              <Siren className="w-4 h-4 text-red-400" />
              <span>🚨 পুলিশ ধাওয়া করছে! ব্লক এড়িয়ে গতি নিয়ন্ত্রণ করুন!</span>
            </div>
          )}

          {stats.weatherAlert && (
            <div
              className={`px-3.5 py-1.5 rounded-xl bg-gradient-to-r ${stats.weatherAlert.color} border border-white/40 shadow-lg flex items-center gap-2`}
            >
              <span className="text-base shrink-0">{stats.weatherAlert.icon}</span>
              <div className="text-left font-mono leading-tight">
                <div className="text-[11px] font-black text-white">{stats.weatherAlert.title}</div>
                <div className="text-[9px] font-semibold text-white/90">
                  {stats.weatherAlert.subtitle}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen Center is intentionally 100% CLEAN */}
      <div />

      {/* Bottom Spacer for Mobile Touch Controls */}
      <div className="h-24 sm:h-10" />
    </div>
  );
};
