import { Pause, Play, RotateCcw } from 'lucide-react';
import type { TimerState } from '../types/jarvis.ts';

interface FocusTimerCardProps {
  timer: TimerState;
  onToggle: () => void;
  onReset: () => void;
  onSelectMinutes: (minutes: number) => void;
}

const PRESETS = [15, 25, 45, 60];

export function FocusTimerCard({
  timer,
  onToggle,
  onReset,
  onSelectMinutes,
}: FocusTimerCardProps) {
  const mins = Math.floor(timer.remainingSeconds / 60);
  const secs = timer.remainingSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const progress =
    timer.durationSeconds > 0
      ? (timer.durationSeconds - timer.remainingSeconds) / timer.durationSeconds
      : 0;

  return (
    <div className="rounded-xl bg-slate-900/75 backdrop-blur-md border border-cyan-500/25 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-semibold tracking-widest text-cyan-300 uppercase">
          Focus Timer
        </span>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {timer.isRunning ? 'Active' : 'Ready'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="font-display text-3xl font-bold tracking-wider tabular-nums text-slate-100">
          {formatted}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={timer.isRunning ? 'Pause focus timer' : 'Start focus timer'}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              timer.isRunning
                ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                : 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30'
            }`}
          >
            {timer.isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="Reset focus timer"
            className="min-h-[40px] min-w-[40px] p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/40 transition-colors flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-cyan-400 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {PRESETS.map((m) => {
          const isSelected = Math.round(timer.durationSeconds / 60) === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMinutes(m)}
              className={`flex-1 py-1.5 rounded-md font-mono text-xs tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {m}m
            </button>
          );
        })}
      </div>
    </div>
  );
}
