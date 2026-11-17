import React from 'react';
import { ChevronLeft, ChevronRight, Flame, OctagonAlert } from 'lucide-react';

interface MobileControlsProps {
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onSetBoost: (boosting: boolean) => void;
  onSetBrake: (braking: boolean) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  onMoveLeft,
  onMoveRight,
  onSetBoost,
  onSetBrake,
}) => {
  return (
    <div className="absolute bottom-4 left-0 right-0 px-4 sm:px-8 flex items-end justify-between pointer-events-none z-30 select-none touch-none">
      {/* Steering Arrows */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onMoveLeft();
          }}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#030614e8] border-2 border-cyan-400/80 text-cyan-300 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,234,255,0.28)] active:scale-95 active:bg-cyan-950 transition-transform cursor-pointer touch-none"
          aria-label="Steer Left"
        >
          <ChevronLeft className="w-8 h-8" />
          <span className="text-[10px] font-mono font-bold">বামে</span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onMoveRight();
          }}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#030614e8] border-2 border-pink-400/80 text-pink-300 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(255,0,119,0.28)] active:scale-95 active:bg-pink-950 transition-transform cursor-pointer touch-none"
          aria-label="Steer Right"
        >
          <ChevronRight className="w-8 h-8" />
          <span className="text-[10px] font-mono font-bold">ডানে</span>
        </button>
      </div>

      {/* Brake & Nitro Boost Controls */}
      <div className="flex items-end gap-3 pointer-events-auto">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onSetBrake(true);
          }}
          onPointerUp={() => onSetBrake(false)}
          onPointerLeave={() => onSetBrake(false)}
          onPointerCancel={() => onSetBrake(false)}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#1f060ce8] border-2 border-red-500/85 text-red-200 flex flex-col items-center justify-center shadow-[0_0_22px_rgba(239,68,68,0.4)] active:scale-95 active:bg-red-950 transition-transform cursor-pointer touch-none"
          aria-label="Brake and Slow Down"
        >
          <OctagonAlert className="w-6 h-6 text-red-400" />
          <span className="text-[10px] font-mono font-black tracking-wider mt-0.5">
            ব্রেক
          </span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onSetBoost(true);
          }}
          onPointerUp={() => onSetBoost(false)}
          onPointerLeave={() => onSetBoost(false)}
          onPointerCancel={() => onSetBoost(false)}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-cyan-500 via-purple-600 to-pink-500 border-2 border-white text-white flex flex-col items-center justify-center shadow-[0_0_32px_rgba(168,85,247,0.55)] active:scale-95 transition-transform cursor-pointer touch-none"
          aria-label="Engage Nitro Boost"
        >
          <Flame className="w-7 h-7 sm:w-8 sm:h-8 text-amber-200" />
          <span className="text-[10px] sm:text-xs font-mono font-black tracking-wider uppercase mt-0.5">
            নাইট্রো
          </span>
        </button>
      </div>
    </div>
  );
};
