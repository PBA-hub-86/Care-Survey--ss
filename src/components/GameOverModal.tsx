import React, { useEffect, useRef } from 'react';
import { RunSummary } from '../types/game';
import confetti from 'canvas-confetti';
import { RotateCcw, ShoppingBag, Gauge, Crosshair, Home, Film, Users, Sparkles } from 'lucide-react';
import { submitScore } from '../lib/firebase';

interface GameOverModalProps {
  summary: RunSummary;
  walletBalance: number;
  onRestart: () => void;
  onOpenShop: () => void;
  onGoHome: () => void;
  onWatchReplay?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  walletBalance,
  onRestart,
  onOpenShop,
  onGoHome,
  onWatchReplay,
}) => {
  const submittedRef = useRef<RunSummary | null>(null);

  useEffect(() => {
    // Submit score to Firebase Firestore Leaderboard once per run
    if (summary.score > 0 && submittedRef.current !== summary) {
      submittedRef.current = summary;
      submitScore({
        playerName: 'Highway Racer',
        score: summary.score,
        distance: summary.distance,
        topSpeed: summary.maxSpeed,
        carName: summary.carName || 'Supercar',
      }).catch(() => {
        // Error is already logged cleanly via handleFirestoreError
      });
    }

    if (summary.isNewRecord || summary.cashEarned >= 2000) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#00e676', '#00eaff', '#ffd700', '#ff0077'],
        });
      } catch {}
    }
  }, [summary]);

  const reasonHeader = (() => {
    switch (summary.endReason) {
      case 'out_of_fuel':
        return {
          icon: '⛽',
          title: 'ফুয়েল শেষ হয়ে গেছে!',
          sub: 'রাস্তায় ফুয়েল জেরিক্যান সংগ্রহ করুন',
          color: 'text-amber-400',
          border: 'border-amber-500/60',
        };
      case 'time_up':
        return {
          icon: '⏱️',
          title: 'নির্ধারিত সময় শেষ!',
          sub: 'যাত্রী ড্রপ-অফ ও ৫০০মি মাইলফলকে সময় বাড়ান',
          color: 'text-cyan-400',
          border: 'border-cyan-500/60',
        };
      default:
        return {
          icon: '💥',
          title: 'গাড়ি অ্যাক্সিডেন্ট হয়েছে!',
          sub: 'গাড়ির হেলথ (HP) শূন্যে নেমে গেছে',
          color: 'text-red-400',
          border: 'border-red-500/60',
        };
    }
  })();

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/85 font-sans overflow-y-auto">
      <div
        className={`w-full max-w-md bg-[#04081af8] border ${reasonHeader.border} rounded-3xl p-5 sm:p-7 shadow-[0_0_60px_rgba(255,0,60,0.3)] text-center text-white flex flex-col gap-3.5 my-auto`}
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-3xl">
          {reasonHeader.icon}
        </div>

        <div>
          <h2 className={`text-2xl sm:text-3xl font-black font-mono tracking-wider ${reasonHeader.color}`}>
            {reasonHeader.title}
          </h2>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            {reasonHeader.sub}
          </div>
        </div>

        {summary.isNewRecord && (
          <div className="py-1.5 px-4 rounded-full bg-gradient-to-r from-amber-500 to-pink-500 text-black font-mono font-black text-xs shadow-[0_0_20px_rgba(255,170,0,0.5)]">
            🏆 নতুন হাই-স্কোর রেকর্ড!
          </div>
        )}

        {/* Highlight Earned Cash & XP */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border border-emerald-500/60 rounded-2xl p-3.5 flex items-center justify-between text-left font-mono">
          <div>
            <div className="text-[10px] text-emerald-400 uppercase font-bold">এই রেসে মোট ইনকাম:</div>
            <div className="text-2xl font-black text-emerald-300 tabular-nums">
              + ৳ {summary.cashEarned.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-slate-400">মোট ওয়ালেট ব্যালেন্স:</div>
            <div className="text-sm font-bold text-white tabular-nums">
              ৳ {walletBalance.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="bg-black/60 border border-slate-800 rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-left font-mono">
          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-cyan-400">মোট স্কোর</div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              {summary.score.toLocaleString()}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-amber-400">দূরত্ব</div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              {summary.distance.toLocaleString()} M
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-pink-400 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> সর্বোচ্চ গতি
            </div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              {summary.maxSpeed} KM/H
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-purple-400 flex items-center gap-1">
              <Crosshair className="w-3 h-3" /> ওভারটেক
            </div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              {summary.nearMisses} বার
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Users className="w-3 h-3" /> যাত্রী ড্রপ
            </div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              {summary.passengersDropped} জন
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> অর্জিত XP
            </div>
            <div className="text-base sm:text-lg font-bold text-white tabular-nums">
              +{summary.xpEarned.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          {onWatchReplay && (
            <button
              onClick={onWatchReplay}
              className="w-full min-h-[44px] py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:brightness-110 text-white font-black font-mono text-xs tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
            >
              <Film className="w-4 h-4" /> 🎬 সিনেমাটিক ৩ডি রিপ্লে (3D REPLAY)
            </button>
          )}

          <button
            onClick={onRestart}
            className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 hover:brightness-110 text-black font-black font-mono tracking-wider flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" /> আবার খেলুন (RETRY RACE)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenShop}
              className="min-h-[44px] py-2.5 rounded-2xl bg-emerald-950 border border-emerald-500/60 hover:border-emerald-400 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" /> মেগা শপ
            </button>

            <button
              onClick={onGoHome}
              className="min-h-[44px] py-2.5 rounded-2xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" /> মেইন মেনু
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
