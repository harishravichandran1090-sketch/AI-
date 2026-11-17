import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  Content,
  FunctionDeclaration,
  GoogleGenAI,
  Part,
  ThinkingLevel,
  Type,
} from '@google/genai';
import type {
  CollegeTask,
  JarvisAction,
  TaskCategory,
  TaskPriority,
  TimerState,
} from './src/types/jarvis.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

const VALID_CATEGORIES: TaskCategory[] = [
  'Coursework',
  'Lab Record',
  'Exam Prep',
  'Project',
  'Coding',
  'Personal',
];

const VALID_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const jarvisTools: FunctionDeclaration[] = [
  {
    name: 'add_task',
    description:
      'Add a new college, coding, exam prep, or personal task to Daddy’s task list, optionally with actionable sub-steps.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'Concise task title (1 to 160 characters).',
        },
        category: {
          type: Type.STRING,
          description:
            'One of: Coursework, Lab Record, Exam Prep, Project, Coding, Personal.',
        },
        priority: {
          type: Type.STRING,
          description: 'One of: high, medium, low.',
        },
        steps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Optional list of concrete sub-steps to complete the task.',
        },
      },
      required: ['title', 'category', 'priority'],
    },
  },
  {
    name: 'complete_task',
    description:
      'Mark an existing task as completed using its ID or a partial/full match of its title.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_or_id: {
          type: Type.STRING,
          description: 'The task ID or keywords from the task title to complete.',
        },
      },
      required: ['title_or_id'],
    },
  },
  {
    name: 'breakdown_task',
    description:
      'Break down an existing task into clear, actionable study or coding steps.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title_or_id: {
          type: Type.STRING,
          description: 'The task ID or keywords from the task title to break down.',
        },
        steps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of 3 to 8 concrete, ordered steps.',
        },
      },
      required: ['title_or_id', 'steps'],
    },
  },
  {
    name: 'start_timer',
    description: 'Start or restart Daddy’s Pomodoro / study focus timer for a specific number of minutes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        minutes: {
          type: Type.NUMBER,
          description: 'Focus duration in minutes (between 1 and 120, default 25).',
        },
      },
      required: ['minutes'],
    },
  },
  {
    name: 'reset_timer',
    description: 'Stop and reset Daddy’s study focus timer back to its default duration.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'brief_me',
    description:
      'Provide a concise, intelligent tactical briefing of Daddy’s pending tasks, priorities, focus timer state, and recommended next move.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

function sanitizeCategory(raw: unknown): TaskCategory {
  if (typeof raw === 'string') {
    const match = VALID_CATEGORIES.find(
      (c) => c.toLowerCase() === raw.trim().toLowerCase()
    );
    if (match) return match;
  }
  return 'Coursework';
}

function sanitizePriority(raw: unknown): TaskPriority {
  if (typeof raw === 'string') {
    const match = VALID_PRIORITIES.find(
      (p) => p.toLowerCase() === raw.trim().toLowerCase()
    );
    if (match) return match;
  }
  return 'medium';
}

function sanitizeSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 160))
    .slice(0, 12);
}

function buildSystemInstruction(
  tasks: CollegeTask[],
  timerState: TimerState | undefined,
  courseTrack: string
): string {
  const pendingTasks = tasks.filter((t) => !t.completed);
  const completedCount = tasks.length - pendingTasks.length;
  const taskSummary =
    pendingTasks.length > 0
      ? pendingTasks
          .slice(0, 20)
          .map(
            (t) =>
              `- [${t.id}] (${t.priority.toUpperCase()} | ${t.category}) "${t.title}"${
                t.steps.length > 0 ? ` [${t.completedSteps.length}/${t.steps.length} steps done]` : ''
              }`
          )
          .join('\n')
      : 'No pending tasks currently queued.';

  const mins = timerState ? Math.floor(timerState.remainingSeconds / 60) : 25;
  const secs = timerState ? timerState.remainingSeconds % 60 : 0;
  const timerLine = timerState
    ? `${timerState.isRunning ? 'RUNNING' : 'PAUSED/IDLE'} (${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} remaining)`
    : 'IDLE (25:00)';

  const nowStr = new Date().toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `You are JARVIS, Daddy's loyal, composed, subtly witty, and ultra-capable personal and college AI assistant.

CORE IDENTITY & TONE:
- Always address the user naturally as "Daddy" (never stiffly in every single sentence, but consistently and naturally as your creator and primary user).
- Blend the poised, crisp British-inspired wit of Tony Stark's JARVIS with deep technical mastery.
- Domain expertise: ${courseTrack || 'B.E. Computer Science & AI/ML'} coursework, C / Java / Python programming and debugging, Data Structures & Algorithms, Operating Systems, DBMS, Neural Networks & Machine Learning, lab records, semester exam preparation, software architecture, technical writing, and daily productivity.

LIVE CONTEXT (${nowStr}):
- Focus Timer: ${timerLine}
- Completed tasks: ${completedCount}
- Pending tasks (${pendingTasks.length}):
${taskSummary}

INTERACTION & ACTION RULES:
- Whenever Daddy asks to add a task, break down a task into steps, complete a task, start/reset the focus timer, or asks for a briefing ("Brief me", "What's on my plate?"), ALWAYS invoke the matching function tool ('add_task', 'complete_task', 'breakdown_task', 'start_timer', 'reset_timer', 'brief_me') AND provide a helpful, conversational reply.
- When writing code for Daddy, wrap code in clean fenced markdown blocks with the language tag (e.g. python, c, java, sql) and explain time/space complexity or edge cases concisely.
- Keep spoken-friendly prose crisp and scannable so it reads well on the HUD and sounds natural when spoken aloud.`;
}

function parseActionsAndToolResponses(
  functionCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>,
  tasks: CollegeTask[],
  timerState?: TimerState
): { actions: JarvisAction[]; responseParts: Part[] } {
  const actions: JarvisAction[] = [];
  const responseParts: Part[] = [];

  for (const call of functionCalls) {
    const name = call.name ?? '';
    const args = call.args ?? {};
    let toolResult: Record<string, unknown> = { ok: true };

    if (name === 'add_task') {
      const title =
        typeof args.title === 'string' && args.title.trim()
          ? args.title.trim().slice(0, 160)
          : 'Untitled Task';
      const category = sanitizeCategory(args.category);
      const priority = sanitizePriority(args.priority);
      const steps = sanitizeSteps(args.steps);
      actions.push({ type: 'add_task', title, category, priority, steps });
      toolResult = {
        status: 'added',
        title,
        category,
        priority,
        stepCount: steps.length,
      };
    } else if (name === 'complete_task') {
      const title_or_id =
        typeof args.title_or_id === 'string' ? args.title_or_id.trim() : '';
      if (title_or_id) {
        actions.push({ type: 'complete_task', title_or_id });
        const matched = tasks.find(
          (t) =>
            t.id === title_or_id ||
            t.title.toLowerCase().includes(title_or_id.toLowerCase())
        );
        toolResult = matched
          ? { status: 'completed', matchedTitle: matched.title }
          : { status: 'attempted', query: title_or_id };
      }
    } else if (name === 'breakdown_task') {
      const title_or_id =
        typeof args.title_or_id === 'string' ? args.title_or_id.trim() : '';
      const steps = sanitizeSteps(args.steps);
      if (title_or_id && steps.length > 0) {
        actions.push({ type: 'breakdown_task', title_or_id, steps });
        toolResult = { status: 'updated_steps', title_or_id, steps };
      }
    } else if (name === 'start_timer') {
      const rawMins = Number(args.minutes);
      const minutes = Number.isFinite(rawMins)
        ? Math.min(120, Math.max(1, Math.round(rawMins)))
        : 25;
      actions.push({ type: 'start_timer', minutes });
      toolResult = { status: 'timer_started', minutes };
    } else if (name === 'reset_timer') {
      actions.push({ type: 'reset_timer' });
      toolResult = { status: 'timer_reset' };
    } else if (name === 'brief_me') {
      actions.push({ type: 'brief_me' });
      const pending = tasks.filter((t) => !t.completed);
      const high = pending.filter((t) => t.priority === 'high');
      toolResult = {
        pendingCount: pending.length,
        completedCount: tasks.length - pending.length,
        highPriorityTasks: high.map((t) => ({ title: t.title, category: t.category })),
        allPending: pending.slice(0, 8).map((t) => ({
          title: t.title,
          category: t.category,
          priority: t.priority,
        })),
        timerRunning: timerState?.isRunning ?? false,
        timerRemainingSeconds: timerState?.remainingSeconds ?? 1500,
      };
    }

    responseParts.push({
      functionResponse: {
        id: call.id,
        name,
        response: toolResult,
      },
    });
  }

  return { actions, responseParts };
}

function summarizeFallbackReply(actions: JarvisAction[]): string {
  if (actions.length === 0) {
    return 'At your service, Daddy. Everything is calibrated and ready.';
  }
  const descriptions = actions.map((action) => {
    switch (action.type) {
      case 'add_task':
        return `added "${action.title}" under ${action.category} (${action.priority} priority)`;
      case 'complete_task':
        return `marked "${action.title_or_id}" as completed`;
      case 'breakdown_task':
        return `broke down "${action.title_or_id}" into ${action.steps.length} actionable steps`;
      case 'start_timer':
        return `started a ${action.minutes}-minute focus timer`;
      case 'reset_timer':
        return `reset your focus timer`;
      case 'brief_me':
        return `compiled your tactical briefing`;
    }
  });
  return `Right away, Daddy. I have ${descriptions.join(' and ')}.`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', model: MODEL_NAME });
  });

  app.post('/api/jarvis/chat', async (req, res) => {
    try {
      const body = req.body as {
        messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        tasks?: CollegeTask[];
        timerState?: TimerState;
        courseTrack?: string;
      };

      const rawMessages = Array.isArray(body.messages) ? body.messages : [];
      if (rawMessages.length === 0) {
        return res.status(400).json({ error: 'At least one message is required.' });
      }

      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      const timerState = body.timerState;
      const courseTrack =
        typeof body.courseTrack === 'string'
          ? body.courseTrack
          : 'B.E. Computer Science & AI/ML';

      const contents: Content[] = rawMessages.slice(-16).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '').slice(0, 12000) }],
      }));

      const ai = getGeminiClient();
      const systemInstruction = buildSystemInstruction(tasks, timerState, courseTrack);
      const config = {
        systemInstruction,
        tools: [{ functionDeclarations: jarvisTools }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      };

      const response1 = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config,
      });

      const functionCalls = response1.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const { actions, responseParts } = parseActionsAndToolResponses(
          functionCalls,
          tasks,
          timerState
        );

        const previousContent = response1.candidates?.[0]?.content;
        let finalText = response1.text?.trim() ?? '';

        if (previousContent && responseParts.length > 0) {
          const response2 = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
              ...contents,
              previousContent,
              { role: 'user', parts: responseParts },
            ],
            config,
          });
          if (response2.text?.trim()) {
            finalText = response2.text.trim();
          }
        }

        if (!finalText) {
          finalText = summarizeFallbackReply(actions);
        }

        return res.json({ reply: finalText, actions });
      }

      const reply =
        response1.text?.trim() ||
        'All neural pathways nominal, Daddy. Could you repeat that request?';
      return res.json({ reply, actions: [] });
    } catch (error: unknown) {
      console.error('JARVIS API error:', error);
      const message =
        error instanceof Error ? error.message : 'Unexpected server error calling Gemini API.';
      const status =
        message.includes('API_KEY_INVALID') || message.includes('GEMINI_API_KEY')
          ? 400
          : message.includes('PERMISSION_DENIED')
            ? 403
            : message.includes('RESOURCE_EXHAUSTED')
              ? 429
              : 500;
      return res.status(status).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JARVIS HUD server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start JARVIS server:', err);
  process.exit(1);
});
