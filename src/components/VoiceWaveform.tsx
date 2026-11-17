import type { BrainState } from '../types/jarvis.ts';

interface VoiceWaveformProps {
  brainState: BrainState;
  audioLevel: number;
}

const BAR_WEIGHTS = [0.55, 0.85, 1.0, 0.8, 0.5];

export function VoiceWaveform({ brainState, audioLevel }: VoiceWaveformProps) {
  const colorClass =
    brainState === 'LISTENING'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.65)]'
      : brainState === 'THINKING'
        ? 'bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.65)]'
        : brainState === 'SPEAKING'
          ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.65)]'
          : 'bg-cyan-500/50';

  return (
    <div
      className="flex items-center justify-center gap-1.5 h-7 px-3"
      aria-hidden="true"
    >
      {BAR_WEIGHTS.map((weight, idx) => {
        const activeBoost =
          brainState === 'LISTENING' || brainState === 'SPEAKING'
            ? Math.max(0.22, audioLevel * weight)
            : brainState === 'THINKING'
              ? 0.45 + 0.3 * ((idx % 2 === 0 ? 1 : -1) * 0.5 + 0.5)
              : 0.18;
        const heightPx = Math.round(6 + activeBoost * 20);
        return (
          <span
            key={idx}
            className={`w-1.5 rounded-full transition-all duration-100 ${colorClass}`}
            style={{ height: `${heightPx}px` }}
          />
        );
      })}
    </div>
  );
}
