import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  ListChecks,
  LogOut,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  CollegeTask,
  JarvisSettings,
  TaskCategory,
  TaskPriority,
} from '../types/jarvis.ts';

interface TasksAndSettingsPanelProps {
  tasks: CollegeTask[];
  settings: JarvisSettings;
  user: User | null;
  availableVoices: SpeechSynthesisVoice[];
  onAddTask: (input: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    steps?: string[];
  }) => Promise<unknown>;
  onToggleTask: (taskId: string) => Promise<void>;
  onToggleStep: (taskId: string, stepText: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRequestBreakdown: (task: CollegeTask) => void;
  onUpdateSettings: (patch: Partial<JarvisSettings>) => Promise<void>;
  onTestVoice: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const CATEGORIES: TaskCategory[] = [
  'Coursework',
  'Lab Record',
  'Exam Prep',
  'Project',
  'Coding',
  'Personal',
];

const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

export function TasksAndSettingsPanel({
  tasks,
  settings,
  user,
  availableVoices,
  onAddTask,
  onToggleTask,
  onToggleStep,
  onDeleteTask,
  onRequestBreakdown,
  onUpdateSettings,
  onTestVoice,
  onSignIn,
  onSignOut,
}: TasksAndSettingsPanelProps) {
  const [section, setSection] = useState<'tasks' | 'settings'>('tasks');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('Coursework');
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium');
  const [submitting, setSubmitting] = useState(false);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onAddTask({
        title: newTitle.trim(),
        category: newCategory,
        priority: newPriority,
        steps: [],
      });
      setNewTitle('');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'done') return t.completed;
    return true;
  });

  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.length - activeCount;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-navigation bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cyan-500/20">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/70 border border-slate-800">
          <button
            type="button"
            onClick={() => setSection('tasks')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              section === 'tasks'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            College Tasks ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setSection('settings')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              section === 'settings'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/35'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Voice & Settings
          </button>
        </div>

        <span className="hidden sm:inline font-mono text-xs tabular-nums text-slate-400">
          {doneCount} completed
        </span>
      </div>

      {section === 'tasks' ? (
        <div className="flex-1 overflow-y-auto hud-scrollbar p-4 space-y-4">
          {/* Add task form */}
          <form
            onSubmit={handleCreateTask}
            className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={160}
                placeholder="Add assignment, lab record, or exam topic..."
                className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={!newTitle.trim() || submitting}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-medium hover:bg-cyan-500/30 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Task</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                aria-label="Task category"
                className="px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                aria-label="Task priority"
                className="px-2.5 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)} Priority
                  </option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1 p-0.5 rounded-md bg-slate-900 border border-slate-800">
                {(['all', 'active', 'done'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilter(mode)}
                    className={`px-2.5 py-1 rounded text-xs capitalize transition-colors cursor-pointer ${
                      filter === mode
                        ? 'bg-slate-800 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </form>

          {/* Task list */}
          {filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-8 text-center space-y-2">
              <ListChecks className="w-8 h-8 text-cyan-400/60 mx-auto" />
              <p className="text-sm font-medium text-slate-300">
                No tasks in this view, Daddy.
              </p>
              <p className="text-xs text-slate-500">
                Add one above or say &ldquo;JARVIS, add a task to study OS Deadlocks.&rdquo;
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/50">
              {filteredTasks.map((task) => {
                const isExpanded = Boolean(expandedIds[task.id]);
                const priorityText =
                  task.priority === 'high'
                    ? 'text-rose-300'
                    : task.priority === 'medium'
                      ? 'text-amber-300'
                      : 'text-emerald-300';

                return (
                  <div key={task.id} className="p-3.5 space-y-2">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        aria-label={
                          task.completed
                            ? `Mark ${task.title} incomplete`
                            : `Mark ${task.title} complete`
                        }
                        className="mt-0.5 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer shrink-0"
                      >
                        {task.completed ? (
                          <CheckSquare className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-500 hover:text-cyan-400" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-sm font-medium break-words ${
                              task.completed
                                ? 'line-through text-slate-500'
                                : 'text-slate-100'
                            }`}
                          >
                            {task.title}
                          </p>
                        </div>

                        {/* Unboxed typographic metadata */}
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                          <span>{task.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className={priorityText}>
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}{' '}
                            priority
                          </span>
                          {task.steps.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums text-cyan-300">
                                {task.completedSteps.length}/{task.steps.length} steps
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {task.steps.length === 0 && !task.completed && (
                          <button
                            type="button"
                            onClick={() => onRequestBreakdown(task)}
                            title="Ask JARVIS to break down into steps"
                            className="px-2.5 py-1.5 rounded-md bg-violet-500/15 border border-violet-400/30 text-violet-200 hover:bg-violet-500/25 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Break Down</span>
                          </button>
                        )}

                        {task.steps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(task.id)}
                            aria-label={isExpanded ? 'Collapse steps' : 'Expand steps'}
                            className="p-1.5 rounded-md text-slate-400 hover:text-cyan-200 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete ${task.title}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {task.steps.length > 0 && isExpanded && (
                      <div className="pl-8 pt-1 space-y-1.5">
                        {task.steps.map((step, idx) => {
                          const stepDone = task.completedSteps.includes(step);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onToggleStep(task.id, step)}
                              className="w-full flex items-start gap-2 text-left text-xs py-1 px-2 rounded hover:bg-slate-900/70 transition-colors cursor-pointer"
                            >
                              {stepDone ? (
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                              )}
                              <span
                                className={
                                  stepDone
                                    ? 'line-through text-slate-500'
                                    : 'text-slate-300'
                                }
                              >
                                {step}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto hud-scrollbar p-4 space-y-5">
          {/* Voice & Speech Settings */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold tracking-widest text-cyan-300 uppercase">
                Two-Way Voice Calibration
              </h3>
              <button
                type="button"
                onClick={onTestVoice}
                className="px-3 py-1.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-medium hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test Voice</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-slate-100">
                    Voice Talk-Back
                  </span>
                  <span className="block text-xs text-slate-400">
                    JARVIS speaks replies aloud
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.voiceEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ voiceEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-cyan-400"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/70 border border-slate-800 cursor-pointer">
                <div>
                  <span className="block text-sm font-medium text-slate-100">
                    Hands-Free Loop
                  </span>
                  <span className="block text-xs text-slate-400">
                    Auto-listen after JARVIS finishes speaking
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.handsFreeMode}
                  onChange={(e) =>
                    onUpdateSettings({ handsFreeMode: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-400"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="jarvis-voice-select"
                className="block text-xs font-medium text-slate-300"
              >
                Speech Synthesizer Voice
              </label>
              <select
                id="jarvis-voice-select"
                value={settings.voiceName}
                onChange={(e) => onUpdateSettings({ voiceName: e.target.value })}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="">Auto-Select JARVIS Preferred English Voice</option>
                {availableVoices
                  .filter((v) => v.lang.startsWith('en'))
                  .map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Speech Rate</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {settings.speechRate.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={settings.speechRate}
                  onChange={(e) =>
                    onUpdateSettings({ speechRate: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Voice Pitch</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {settings.speechPitch.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={settings.speechPitch}
                  onChange={(e) =>
                    onUpdateSettings({ speechPitch: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Academic Track */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3">
            <h3 className="font-display text-xs font-semibold tracking-widest text-cyan-300 uppercase">
              Academic Context
            </h3>
            <div className="space-y-1.5">
              <label
                htmlFor="course-track-input"
                className="block text-xs text-slate-400"
              >
                Degree & Specialization (tailors JARVIS domain expertise)
              </label>
              <input
                id="course-track-input"
                type="text"
                maxLength={120}
                value={settings.courseTrack}
                onChange={(e) =>
                  onUpdateSettings({ courseTrack: e.target.value })
                }
                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Firebase Cloud Sync */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {user ? (
                  <Cloud className="w-5 h-5 text-emerald-400" />
                ) : (
                  <CloudOff className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <h3 className="font-display text-xs font-semibold tracking-widest text-cyan-300 uppercase">
                    Cloud Persistence
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {user
                      ? `Synced as ${user.displayName || user.email}`
                      : 'Using local browser storage · Sign in to sync across laptop and phone'}
                  </p>
                </div>
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-medium hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sync with Google</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
