import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FocusTimerCard } from './components/FocusTimerCard.tsx';
import { MessageRenderer } from './components/MessageRenderer.tsx';
import { NeuralBrainCanvas } from './components/NeuralBrainCanvas.tsx';
import { TasksAndSettingsPanel } from './components/TasksAndSettingsPanel.tsx';
import { VoiceWaveform } from './components/VoiceWaveform.tsx';
import { useJarvisStore } from './hooks/useJarvisStore.ts';
import { playTimerChime, useVoiceAssistant } from './hooks/useVoiceAssistant.ts';
import type {
  BrainState,
  CollegeTask,
  JarvisAction,
  JarvisChatResponse,
  TimerState,
} from './types/jarvis.ts';

const QUICK_PROMPTS = [
  "Explain Dijkstra's algorithm in Python",
  'Add high priority OS lab task with steps',
  'Start a 25 minute focus timer',
  'Summarize BCNF vs 3NF for DBMS exam',
  'Debug segmentation fault in C pointers',
];

function JarvisWorkspace() {
  const {
    user,
    syncError,
    clearSyncError,
    tasks,
    messages,
    settings,
    signInWithGoogle,
    signOutUser,
    addTask,
    toggleTaskCompleted,
    completeTaskByQuery,
    breakdownTaskByQuery,
    toggleTaskStep,
    deleteTask,
    appendMessage,
    clearMessages,
    updateSettings,
  } = useJarvisStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat');
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [timer, setTimer] = useState<TimerState>(() => ({
    durationSeconds: settings.focusMinutes * 60,
    remainingSeconds: settings.focusMinutes * 60,
    isRunning: false,
  }));

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sendMessageRef = useRef<(text: string, fromVoice?: boolean) => Promise<void>>(
    async () => {}
  );
  const speakRef = useRef<(text: string, opts?: { force?: boolean; allowHandsFreeResume?: boolean }) => void>(
    () => {}
  );

  // Sync timer default when settings.focusMinutes changes and timer is idle
  useEffect(() => {
    setTimer((prev) => {
      if (prev.isRunning) return prev;
      const nextSecs = settings.focusMinutes * 60;
      return {
        durationSeconds: nextSecs,
        remainingSeconds: nextSecs,
        isRunning: false,
      };
    });
  }, [settings.focusMinutes]);

  // Focus timer countdown
  useEffect(() => {
    if (!timer.isRunning) return;
    const interval = window.setInterval(() => {
      setTimer((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds <= 1) {
          playTimerChime();
          speakRef.current('Daddy, your focus session is complete. Well done.', {
            allowHandsFreeResume: false,
          });
          return {
            ...prev,
            remainingSeconds: 0,
            isRunning: false,
          };
        }
        return {
          ...prev,
          remainingSeconds: prev.remainingSeconds - 1,
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timer.isRunning]);

  const voice = useVoiceAssistant({
    settings,
    onTranscriptFinal: (transcript) => {
      void sendMessageRef.current(transcript, true);
    },
  });

  speakRef.current = voice.speak;

  const brainState: BrainState = useMemo(() => {
    if (isThinking) return 'THINKING';
    if (voice.isListening) return 'LISTENING';
    if (voice.isSpeaking) return 'SPEAKING';
    return 'IDLE';
  }, [isThinking, voice.isListening, voice.isSpeaking]);

  // Auto-scroll chat feed
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, activeTab]);

  const executeActions = useCallback(
    async (actions: JarvisAction[]): Promise<string[]> => {
      const summaries: string[] = [];
      for (const action of actions) {
        if (action.type === 'add_task') {
          await addTask({
            title: action.title,
            category: action.category,
            priority: action.priority,
            steps: action.steps,
          });
          summaries.push(`Added task: ${action.title}`);
        } else if (action.type === 'complete_task') {
          const completed = await completeTaskByQuery(action.title_or_id);
          summaries.push(
            completed
              ? `Completed: ${completed.title}`
              : `Completed task matching "${action.title_or_id}"`
          );
        } else if (action.type === 'breakdown_task') {
          const updated = await breakdownTaskByQuery(
            action.title_or_id,
            action.steps
          );
          summaries.push(
            updated
              ? `Added ${action.steps.length} steps to ${updated.title}`
              : `Generated ${action.steps.length} steps`
          );
        } else if (action.type === 'start_timer') {
          const secs = Math.max(60, Math.min(7200, action.minutes * 60));
          setTimer({
            durationSeconds: secs,
            remainingSeconds: secs,
            isRunning: true,
          });
          summaries.push(`Focus timer started (${action.minutes}m)`);
        } else if (action.type === 'reset_timer') {
          const secs = settings.focusMinutes * 60;
          setTimer({
            durationSeconds: secs,
            remainingSeconds: secs,
            isRunning: false,
          });
          summaries.push('Focus timer reset');
        } else if (action.type === 'brief_me') {
          summaries.push('Tactical briefing compiled');
        }
      }
      return summaries;
    },
    [addTask, breakdownTaskByQuery, completeTaskByQuery, settings.focusMinutes]
  );

  const sendMessage = useCallback(
    async (rawText: string, fromVoice = false) => {
      const trimmed = rawText.trim();
      if (!trimmed || isThinking) return;

      setApiError(null);
      setInputText('');
      if (voice.isSpeaking) {
        voice.stopSpeaking();
      }

      const historyPayload = [
        ...messages.slice(-14).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: trimmed },
      ];

      await appendMessage({ role: 'user', content: trimmed });
      setIsThinking(true);

      try {
        const res = await fetch('/api/jarvis/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: historyPayload,
            tasks,
            timerState: timer,
            courseTrack: settings.courseTrack,
          }),
        });

        const data = (await res.json()) as Partial<JarvisChatResponse> & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || `Request failed with status ${res.status}`);
        }

        const actions = Array.isArray(data.actions) ? data.actions : [];
        const actionSummaries = await executeActions(actions);
        const reply =
          data.reply?.trim() ||
          'Consider it done, Daddy. Let me know what you would like to tackle next.';

        await appendMessage({
          role: 'assistant',
          content: reply,
          actions: actionSummaries,
        });

        voice.speak(reply, {
          force: fromVoice ? true : undefined,
          allowHandsFreeResume: fromVoice || settings.handsFreeMode,
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Unable to reach JARVIS neural core.';
        setApiError(msg);
      } finally {
        setIsThinking(false);
      }
    },
    [
      appendMessage,
      executeActions,
      isThinking,
      messages,
      settings.courseTrack,
      settings.handsFreeMode,
      tasks,
      timer,
      voice,
    ]
  );

  sendMessageRef.current = sendMessage;

  const handleBriefMe = () => {
    setActiveTab('chat');
    void sendMessage(
      'Brief me on my current college tasks, priorities, focus timer status, and what I should tackle next.'
    );
  };

  const handleRequestBreakdown = (task: CollegeTask) => {
    setActiveTab('chat');
    void sendMessage(
      `Break down my task "${task.title}" (${task.category}) into 4 to 6 concrete, ordered steps.`
    );
  };

  const handleToggleTimer = () => {
    setTimer((prev) => {
      if (prev.remainingSeconds <= 0) {
        return {
          durationSeconds: prev.durationSeconds,
          remainingSeconds: prev.durationSeconds,
          isRunning: true,
        };
      }
      return { ...prev, isRunning: !prev.isRunning };
    });
  };

  const handleResetTimer = () => {
    const secs = settings.focusMinutes * 60;
    setTimer({
      durationSeconds: secs,
      remainingSeconds: secs,
      isRunning: false,
    });
  };

  const handleSelectMinutes = (minutes: number) => {
    void updateSettings({ focusMinutes: minutes });
    const secs = minutes * 60;
    setTimer({
      durationSeconds: secs,
      remainingSeconds: secs,
      isRunning: false,
    });
  };

  const handleBrainTap = () => {
    if (voice.isSpeaking) {
      voice.stopSpeaking();
      return;
    }
    voice.toggleListening();
  };

  const stateColorText =
    brainState === 'LISTENING'
      ? 'text-emerald-300'
      : brainState === 'THINKING'
        ? 'text-violet-300'
        : brainState === 'SPEAKING'
          ? 'text-sky-300'
          : 'text-cyan-300';

  const activeTaskCount = tasks.filter((t) => !t.completed).length;

  const formattedCompactTimer = `${String(
    Math.floor(timer.remainingSeconds / 60)
  ).padStart(2, '0')}:${String(timer.remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden hud-cyber-grid text-slate-100 flex flex-col">
      {/* Mobile Compact Header (keeps sticky area <= 15% viewport height) */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#030712]/90 backdrop-blur-md border-b border-cyan-500/20 px-3 py-2 flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold tracking-widest text-cyan-300 whitespace-nowrap shrink-0">
          JARVIS
        </span>

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400'
            }`}
          >
            HUD & Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-slate-400'
            }`}
          >
            Tasks ({activeTaskCount})
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            updateSettings({ handsFreeMode: !settings.handsFreeMode })
          }
          aria-pressed={settings.handsFreeMode}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            settings.handsFreeMode
              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
              : 'bg-slate-900 border border-slate-700 text-slate-300'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Hands-Free</span>
        </button>
      </header>

      {/* Main Two-Column Desktop / Single-Column Mobile Workspace */}
      <main className="flex-1 min-h-0 max-w-[1440px] w-full mx-auto px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5 flex flex-col lg:flex-row gap-4 lg:gap-5">
        {/* LEFT COLUMN (Desktop Full HUD Core | Mobile Compact Neural Strip on Chat tab) */}
        <aside
          className={`${
            activeTab === 'tasks' ? 'hidden lg:flex' : 'flex'
          } flex-col gap-4 lg:w-[370px] xl:w-[390px] shrink-0`}
        >
          {/* Neural Brain Core Panel */}
          <section className="rounded-xl bg-slate-900/75 backdrop-blur-md border border-cyan-500/25 p-4 lg:p-5 flex flex-col items-center gap-3">
            {/* Desktop Top Identity Row */}
            <div className="w-full flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base lg:text-lg font-bold tracking-widest text-slate-100">
                  JARVIS
                </h1>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-display text-xs font-semibold tracking-wider ${stateColorText}`}
                >
                  {brainState}
                </span>
              </div>

              <span className="font-mono text-[10px] tracking-wider text-cyan-300/90 whitespace-nowrap">
                0 CREDITS • GEMINI POWERED
              </span>
            </div>

            {/* Mobile vs Desktop Neural Brain Canvas */}
            <div className="lg:hidden flex items-center justify-between w-full gap-3">
              <NeuralBrainCanvas
                brainState={brainState}
                audioLevel={voice.audioLevel}
                size={124}
                onToggleListen={handleBrainTap}
              />
              <div className="flex-1 min-w-0 space-y-2.5">
                <VoiceWaveform
                  brainState={brainState}
                  audioLevel={voice.audioLevel}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBriefMe}
                    disabled={isThinking}
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 text-xs font-semibold hover:bg-cyan-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Brief Me</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleTimer}
                    className="min-h-[40px] px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-700 font-mono text-xs tabular-nums text-cyan-200 cursor-pointer whitespace-nowrap"
                    title="Toggle Focus Timer"
                  >
                    {formattedCompactTimer}
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center gap-2 w-full">
              <NeuralBrainCanvas
                brainState={brainState}
                audioLevel={voice.audioLevel}
                size={224}
                onToggleListen={handleBrainTap}
              />

              <VoiceWaveform
                brainState={brainState}
                audioLevel={voice.audioLevel}
              />

              <p className="text-xs text-slate-400 text-center min-h-[18px]">
                {voice.isListening
                  ? voice.interimTranscript || 'Listening to you, Daddy...'
                  : isThinking
                    ? 'Synthesizing response with Gemini...'
                    : voice.isSpeaking
                      ? 'Speaking — tap Neural Core to interrupt'
                      : 'Tap Neural Core to speak to JARVIS'}
              </p>

              <button
                type="button"
                onClick={handleBriefMe}
                disabled={isThinking}
                className="w-full min-h-[42px] px-4 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 text-xs font-display font-semibold tracking-wider uppercase hover:bg-cyan-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-cyan-300" />
                <span>⚡ Brief Me</span>
              </button>
            </div>
          </section>

          {/* Desktop Focus Timer Panel */}
          <div className="hidden lg:block">
            <FocusTimerCard
              timer={timer}
              onToggle={handleToggleTimer}
              onReset={handleResetTimer}
              onSelectMinutes={handleSelectMinutes}
            />
          </div>
        </aside>

        {/* RIGHT COLUMN: Tabbed Workspace (HUD & Chat | College Tasks & Settings) */}
        <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl bg-slate-900/75 backdrop-blur-md border border-cyan-500/25 overflow-hidden">
          {/* Desktop Workspace Header Tabs */}
          <div className="hidden lg:flex items-center justify-between gap-4 px-5 py-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-3.5 py-1.5 rounded-md font-display text-xs font-semibold tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/35'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                HUD & Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className={`px-3.5 py-1.5 rounded-md font-display text-xs font-semibold tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'tasks'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/35'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                College Tasks & Settings ({activeTaskCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  updateSettings({ voiceEnabled: !settings.voiceEnabled })
                }
                aria-label={
                  settings.voiceEnabled ? 'Mute voice output' : 'Enable voice output'
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settings.voiceEnabled
                    ? 'bg-slate-800/80 border-cyan-500/30 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {settings.voiceEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span>{settings.voiceEnabled ? 'Voice On' : 'Muted'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateSettings({ handsFreeMode: !settings.handsFreeMode })
                }
                aria-pressed={settings.handsFreeMode}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  settings.handsFreeMode
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Hands-Free Voice</span>
              </button>

              {activeTab === 'chat' && (
                <button
                  type="button"
                  onClick={() => void clearMessages()}
                  aria-label="Clear chat history"
                  title="Clear chat history"
                  className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Active Error Banners */}
          {(apiError || voice.voiceError || syncError) && (
            <div className="px-4 py-2.5 bg-rose-950/60 border-b border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">
                  {apiError || voice.voiceError || syncError}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setApiError(null);
                  voice.clearVoiceError();
                  clearSyncError();
                }}
                className="text-rose-300 hover:text-white underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'chat' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Quick Prompt Chips */}
              <div className="px-3 sm:px-4 py-2.5 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto hud-scrollbar shrink-0">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={isThinking}
                    className="px-3 py-1.5 rounded-lg bg-slate-950/75 border border-cyan-500/20 text-xs text-slate-300 hover:text-cyan-200 hover:border-cyan-400/45 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Scrollable Chat History */}
              <div className="flex-1 min-h-0 overflow-y-auto hud-scrollbar px-3 sm:px-5 py-4 space-y-4">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isUser ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[92%] sm:max-w-[82%] rounded-xl px-4 py-3 ${
                          isUser
                            ? 'bg-cyan-500/15 border border-cyan-400/35 text-slate-100'
                            : 'bg-slate-950/70 border border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1 text-[11px] font-mono text-slate-400">
                          <span
                            className={
                              isUser ? 'text-cyan-300' : 'text-sky-300 font-semibold'
                            }
                          >
                            {isUser ? 'DADDY' : 'JARVIS'}
                          </span>
                          <span className="tabular-nums">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {isUser ? (
                          <p className="text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        ) : (
                          <MessageRenderer content={msg.content} />
                        )}

                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-emerald-300">
                            {msg.actions.map((act, idx) => (
                              <span key={idx}>✓ {act}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isThinking && (
                  <div className="flex items-start">
                    <div className="rounded-xl px-4 py-3 bg-slate-950/70 border border-violet-500/30 flex items-center gap-2.5 text-xs text-violet-200">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      <span>JARVIS is thinking...</span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Interim Voice Preview on Mobile */}
              {voice.isListening && (
                <div className="lg:hidden px-4 py-1.5 bg-emerald-950/50 border-t border-emerald-500/30 text-xs text-emerald-200 truncate">
                  {voice.interimTranscript || 'Listening... speak now, Daddy'}
                </div>
              )}

              {/* Bottom Input Bar (Mic + Text + Send) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(inputText);
                }}
                className="p-3 sm:px-4 sm:py-3 border-t border-cyan-500/20 bg-slate-950/80 flex items-center gap-2 shrink-0"
              >
                <button
                  type="button"
                  onClick={voice.toggleListening}
                  aria-label={
                    voice.isListening ? 'Stop voice input' : 'Start voice input'
                  }
                  className={`min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    voice.isListening
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-cyan-300 hover:border-cyan-400/50'
                  }`}
                >
                  {voice.isListening ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                {voice.isSpeaking && (
                  <button
                    type="button"
                    onClick={voice.stopSpeaking}
                    aria-label="Stop JARVIS speaking"
                    title="Stop Speaking"
                    className="min-h-[44px] px-3 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                )}

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask JARVIS anything, Daddy (code, labs, tasks, timer)..."
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || isThinking}
                  aria-label="Send message"
                  className="min-h-[44px] px-4 rounded-lg bg-cyan-500/25 border border-cyan-400/50 text-cyan-100 text-sm font-medium hover:bg-cyan-500/35 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          ) : (
            <TasksAndSettingsPanel
              tasks={tasks}
              settings={settings}
              user={user}
              availableVoices={voice.availableVoices}
              onAddTask={addTask}
              onToggleTask={toggleTaskCompleted}
              onToggleStep={toggleTaskStep}
              onDeleteTask={deleteTask}
              onRequestBreakdown={handleRequestBreakdown}
              onUpdateSettings={updateSettings}
              onTestVoice={() =>
                voice.speak(
                  'Voice systems calibrated and nominal, Daddy. Ready whenever you are.',
                  { force: true }
                )
              }
              onSignIn={signInWithGoogle}
              onSignOut={signOutUser}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <JarvisWorkspace />
    </ErrorBoundary>
  );
}
