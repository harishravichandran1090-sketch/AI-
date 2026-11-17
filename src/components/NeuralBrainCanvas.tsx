import { useEffect, useRef } from 'react';
import type { BrainState } from '../types/jarvis.ts';

interface NeuralBrainCanvasProps {
  brainState: BrainState;
  audioLevel: number;
  size?: number;
  onToggleListen: () => void;
}

interface BrainNode {
  bx: number;
  by: number;
  bz: number;
  hemisphere: -1 | 1;
  phase: number;
  size: number;
}

interface SynapseEdge {
  a: number;
  b: number;
  dist: number;
}

interface PulsePacket {
  edgeIndex: number;
  progress: number;
  speed: number;
  direction: 1 | -1;
}

const STATE_PALETTES: Record<
  BrainState,
  {
    primary: string;
    secondary: string;
    glow: string;
    rgb: [number, number, number];
  }
> = {
  IDLE: {
    primary: '#06b6d4',
    secondary: '#0891b2',
    glow: 'rgba(6, 182, 212, 0.35)',
    rgb: [6, 182, 212],
  },
  LISTENING: {
    primary: '#10b981',
    secondary: '#34d399',
    glow: 'rgba(16, 185, 129, 0.48)',
    rgb: [16, 185, 129],
  },
  THINKING: {
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    glow: 'rgba(139, 92, 246, 0.52)',
    rgb: [139, 92, 246],
  },
  SPEAKING: {
    primary: '#38bdf8',
    secondary: '#7dd3fc',
    glow: 'rgba(56, 189, 248, 0.5)',
    rgb: [56, 189, 248],
  },
};

function generateBrainTopology() {
  const nodes: BrainNode[] = [];
  const totalNodes = 86;

  // Deterministic pseudo-random generator for clean, consistent brain lobes
  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < totalNodes; i++) {
    const hemisphere: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const radius = 0.55 + 0.42 * Math.cbrt(rand());

    // Sculpted brain ellipsoid: wider front-to-back, distinct left/right hemispheres
    let x = radius * Math.sin(phi) * Math.cos(theta) * 0.44;
    x = Math.abs(x) * hemisphere + hemisphere * 0.14;
    const y = radius * Math.cos(phi) * 0.62 - 0.04;
    const z = radius * Math.sin(phi) * Math.sin(theta) * 0.86;

    nodes.push({
      bx: x,
      by: y,
      bz: z,
      hemisphere,
      phase: rand() * Math.PI * 2,
      size: 1.6 + rand() * 1.9,
    });
  }

  const edges: SynapseEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].bx - nodes[j].bx;
      const dy = nodes[i].by - nodes[j].by;
      const dz = nodes[i].bz - nodes[j].bz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxLink = nodes[i].hemisphere === nodes[j].hemisphere ? 0.46 : 0.34;
      if (dist < maxLink) {
        edges.push({ a: i, b: j, dist });
      }
    }
  }

  return { nodes, edges };
}

export function NeuralBrainCanvas({
  brainState,
  audioLevel,
  size = 240,
  onToggleListen,
}: NeuralBrainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(brainState);
  const audioRef = useRef(audioLevel);
  const topologyRef = useRef<ReturnType<typeof generateBrainTopology> | null>(null);

  stateRef.current = brainState;
  audioRef.current = audioLevel;

  if (!topologyRef.current) {
    topologyRef.current = generateBrainTopology();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !topologyRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const { nodes, edges } = topologyRef.current;
    const pulses: PulsePacket[] = Array.from({ length: 24 }, (_, idx) => ({
      edgeIndex: idx % Math.max(1, edges.length),
      progress: (idx * 0.17) % 1,
      speed: 0.014 + (idx % 5) * 0.004,
      direction: idx % 2 === 0 ? 1 : -1,
    }));

    let animId = 0;
    let time = 0;
    let angle = 0;

    const renderFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetPx = Math.round(size * dpr);
      if (canvas.width !== targetPx || canvas.height !== targetPx) {
        canvas.width = targetPx;
        canvas.height = targetPx;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const currentState = stateRef.current;
      const level = audioRef.current;
      const palette = STATE_PALETTES[currentState];
      const [r, g, b] = palette.rgb;

      const speedMul =
        currentState === 'THINKING'
          ? 2.2
          : currentState === 'SPEAKING'
            ? 1.55
            : currentState === 'LISTENING'
              ? 1.35
              : 0.65;

      if (!prefersReducedMotion) {
        time += 0.025 * speedMul;
        angle += 0.0045 * speedMul;
      }

      const cx = size / 2;
      const cy = size / 2;
      const scale = size * 0.43;

      const breathe =
        currentState === 'IDLE'
          ? 1 + Math.sin(time * 1.4) * 0.025
          : currentState === 'LISTENING'
            ? 1 + level * 0.08 + Math.sin(time * 2.5) * 0.03
            : currentState === 'THINKING'
              ? 1 + Math.sin(time * 4.2) * 0.04
              : 1 + level * 0.1 + Math.sin(time * 3.4) * 0.035;

      // Ambient core radial glow
      const radial = ctx.createRadialGradient(cx, cy, scale * 0.1, cx, cy, scale * 1.18);
      radial.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${currentState === 'IDLE' ? 0.18 : 0.3})`);
      radial.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.08)`);
      radial.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 1.18, 0, Math.PI * 2);
      ctx.fill();

      // Outer holographic orbital HUD rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.22)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, scale * 1.02 * breathe, angle, angle + Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.36)`;
      ctx.beginPath();
      ctx.arc(0, 0, scale * 0.92, -angle * 1.4, -angle * 1.4 + Math.PI * 1.45);
      ctx.stroke();
      ctx.restore();

      // Project 3D brain nodes
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const tilt = 0.22;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      const projected = nodes.map((node) => {
        const rx = node.bx * cosA - node.bz * sinA;
        const rz0 = node.bx * sinA + node.bz * cosA;
        const ry = node.by * cosT - rz0 * sinT;
        const rz = node.by * sinT + rz0 * cosT;

        const perspective = 2.2 / (2.2 - rz);
        const px = cx + rx * scale * breathe * perspective;
        const py = cy + ry * scale * breathe * perspective;
        const depth = (rz + 1) * 0.5;
        return { px, py, rz, depth, perspective, node };
      });

      // Draw synaptic edges
      ctx.lineWidth = 0.85;
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const pA = projected[edge.a];
        const pB = projected[edge.b];
        const avgDepth = (pA.depth + pB.depth) * 0.5;
        const alpha = Math.max(0.06, Math.min(0.42, avgDepth * 0.32));
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pA.px, pA.py);
        ctx.lineTo(pB.px, pB.py);
        ctx.stroke();
      }

      // Draw traveling synaptic pulses
      const activePulseCount =
        currentState === 'THINKING'
          ? pulses.length
          : currentState === 'SPEAKING' || currentState === 'LISTENING'
            ? 16
            : 8;

      for (let i = 0; i < activePulseCount; i++) {
        const pulse = pulses[i];
        if (edges.length === 0) break;
        if (!prefersReducedMotion) {
          pulse.progress += pulse.speed * speedMul * pulse.direction;
          if (pulse.progress > 1 || pulse.progress < 0) {
            pulse.edgeIndex = (pulse.edgeIndex + 7 + i) % edges.length;
            pulse.progress = pulse.direction > 0 ? 0 : 1;
          }
        }
        const edge = edges[pulse.edgeIndex];
        const pA = projected[edge.a];
        const pB = projected[edge.b];
        const t = Math.max(0, Math.min(1, pulse.progress));
        const x = pA.px + (pB.px - pA.px) * t;
        const y = pA.py + (pB.py - pA.py) * t;

        ctx.fillStyle = `rgba(240, 249, 255, 0.92)`;
        ctx.shadowColor = palette.primary;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, currentState === 'THINKING' ? 2.1 : 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Sort nodes back-to-front and draw glowing neurons
      const sorted = [...projected].sort((a, b) => a.rz - b.rz);
      for (const item of sorted) {
        const pulseVal = 0.55 + 0.45 * Math.sin(time * 2.4 + item.node.phase);
        const radius = item.node.size * item.perspective * (0.8 + pulseVal * 0.35);
        const alpha = Math.max(0.28, Math.min(1, 0.35 + item.depth * 0.65));

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.32})`;
        ctx.beginPath();
        ctx.arc(item.px, item.py, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle =
          pulseVal > 0.85
            ? `rgba(241, 245, 249, ${alpha})`
            : `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(item.px, item.py, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();
    return () => cancelAnimationFrame(animId);
  }, [size]);

  const stateHint =
    brainState === 'LISTENING'
      ? 'Listening — Tap to stop'
      : brainState === 'THINKING'
        ? 'Processing neural response'
        : brainState === 'SPEAKING'
          ? 'Speaking — Tap to interrupt'
          : 'Tap Neural Core to speak';

  return (
    <button
      type="button"
      onClick={onToggleListen}
      aria-label={`JARVIS Neural Brain (${brainState}). ${stateHint}`}
      className="group relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer transition-transform duration-200 active:scale-95"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block rounded-full"
      />
      <span className="sr-only">{stateHint}</span>
    </button>
  );
}
