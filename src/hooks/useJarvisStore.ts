import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase.ts';
import type {
  ChatMessage,
  CollegeTask,
  JarvisSettings,
  TaskCategory,
  TaskPriority,
} from '../types/jarvis.ts';

const STORAGE_KEYS = {
  tasks: 'jarvis_tasks_v1',
  messages: 'jarvis_messages_v1',
  settings: 'jarvis_settings_v1',
};

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const DEFAULT_SETTINGS: JarvisSettings = {
  voiceEnabled: true,
  handsFreeMode: false,
  voiceName: '',
  speechRate: 1.04,
  speechPitch: 0.95,
  focusMinutes: 25,
  courseTrack: 'B.E. Computer Science & AI/ML',
};

const INITIAL_TASKS: CollegeTask[] = [
  {
    id: 'task-os-deadlock',
    title: 'OS Lab Record: Banker’s Algorithm in C',
    category: 'Lab Record',
    priority: 'high',
    completed: false,
    steps: [
      'Implement safety algorithm with Need matrix check',
      'Test safe and unsafe resource allocation sequences',
      'Export sample I/O trace for lab record printout',
    ],
    completedSteps: ['Implement safety algorithm with Need matrix check'],
    createdAt: Date.now() - 3600_000 * 5,
    updatedAt: Date.now() - 3600_000 * 2,
  },
  {
    id: 'task-dsa-graphs',
    title: 'DSA Practice: Dijkstra & A* Shortest Path',
    category: 'Coding',
    priority: 'medium',
    completed: false,
    steps: [
      'Implement min-heap priority queue in Python',
      'Compare O((V + E) log V) runtime on sparse graphs',
    ],
    completedSteps: [],
    createdAt: Date.now() - 3600_000 * 4,
    updatedAt: Date.now() - 3600_000 * 4,
  },
  {
    id: 'task-dbms-norm',
    title: 'DBMS Exam Prep: BCNF & Transaction ACID Proofs',
    category: 'Exam Prep',
    priority: 'medium',
    completed: false,
    steps: [],
    completedSteps: [],
    createdAt: Date.now() - 3600_000 * 2,
    updatedAt: Date.now() - 3600_000 * 2,
  },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    content:
      "All neural cores online and calibrated, Daddy. I'm ready to assist with your B.E. Computer Science & AI/ML coursework, code debugging, lab records, or focus sessions. Tap my Neural Brain anytime to speak, or hit **Brief Me** for a tactical overview.",
    actions: [],
    createdAt: Date.now() - 60_000,
  },
];

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const raw = `${prefix}-${Date.now()}-${rand}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
}

function sanitizeStepsList(steps: string[]): string[] {
  return steps
    .map((s) => String(s || '').trim().slice(0, 160))
    .filter((s) => s.length > 0)
    .slice(0, 12);
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota issues
  }
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

export function useJarvisStore() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<CollegeTask[]>(() =>
    loadLocal<CollegeTask[]>(STORAGE_KEYS.tasks, INITIAL_TASKS)
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadLocal<ChatMessage[]>(STORAGE_KEYS.messages, INITIAL_MESSAGES)
  );
  const [settings, setSettings] = useState<JarvisSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadLocal<Partial<JarvisSettings>>(STORAGE_KEYS.settings, {}),
  }));

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Persist local copies when signed out
  useEffect(() => {
    if (!user) {
      saveLocal(STORAGE_KEYS.tasks, tasks);
    }
  }, [tasks, user]);

  useEffect(() => {
    if (!user) {
      saveLocal(STORAGE_KEYS.messages, messages.slice(-60));
    }
  }, [messages, user]);

  useEffect(() => {
    if (!user) {
      saveLocal(STORAGE_KEYS.settings, settings);
    }
  }, [settings, user]);

  // Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !ID_PATTERN.test(user.uid)) {
      return;
    }

    const uid = user.uid;
    const tasksPath = `users/${uid}/tasks`;
    const messagesPath = `users/${uid}/messages`;
    const settingsDocPath = `users/${uid}/settings/preferences`;

    const tasksQuery = query(
      collection(db, tasksPath),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const unsubTasks = onSnapshot(
      tasksQuery,
      (snap) => {
        const remoteTasks: CollegeTask[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || uid),
            title: String(data.title || 'Untitled'),
            category: (data.category as TaskCategory) || 'Coursework',
            priority: (data.priority as TaskPriority) || 'medium',
            completed: Boolean(data.completed),
            steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
            completedSteps: Array.isArray(data.completedSteps)
              ? data.completedSteps.map(String)
              : [],
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
          };
        });
        setTasks(remoteTasks);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, tasksPath);
        } catch (wrapped) {
          setSyncError(wrapped instanceof Error ? wrapped.message : String(wrapped));
        }
      }
    );

    const messagesQuery = query(
      collection(db, messagesPath),
      where('userId', '==', uid),
      orderBy('createdAt', 'asc')
    );

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snap) => {
        if (snap.empty) {
          setMessages(INITIAL_MESSAGES);
          return;
        }
        const remoteMessages: ChatMessage[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId || uid),
            role: data.role === 'user' ? 'user' : 'assistant',
            content: String(data.content || ''),
            actions: Array.isArray(data.actions) ? data.actions.map(String) : [],
            createdAt: toMillis(data.createdAt),
          };
        });
        setMessages(remoteMessages);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, messagesPath);
        } catch (wrapped) {
          setSyncError(wrapped instanceof Error ? wrapped.message : String(wrapped));
        }
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, settingsDocPath),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setSettings({
          voiceEnabled:
            typeof data.voiceEnabled === 'boolean'
              ? data.voiceEnabled
              : DEFAULT_SETTINGS.voiceEnabled,
          handsFreeMode:
            typeof data.handsFreeMode === 'boolean'
              ? data.handsFreeMode
              : DEFAULT_SETTINGS.handsFreeMode,
          voiceName: typeof data.voiceName === 'string' ? data.voiceName : '',
          speechRate:
            typeof data.speechRate === 'number'
              ? Math.min(2, Math.max(0.5, data.speechRate))
              : DEFAULT_SETTINGS.speechRate,
          speechPitch:
            typeof data.speechPitch === 'number'
              ? Math.min(2, Math.max(0.5, data.speechPitch))
              : DEFAULT_SETTINGS.speechPitch,
          focusMinutes:
            typeof data.focusMinutes === 'number'
              ? Math.min(120, Math.max(1, Math.round(data.focusMinutes)))
              : DEFAULT_SETTINGS.focusMinutes,
          courseTrack:
            typeof data.courseTrack === 'string'
              ? data.courseTrack
              : DEFAULT_SETTINGS.courseTrack,
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, settingsDocPath);
        } catch (wrapped) {
          setSyncError(wrapped instanceof Error ? wrapped.message : String(wrapped));
        }
      }
    );

    return () => {
      unsubTasks();
      unsubMessages();
      unsubSettings();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setSyncError(null);
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOutUser = useCallback(async () => {
    setSyncError(null);
    await signOut(auth);
  }, []);

  const addTask = useCallback(
    async (input: {
      title: string;
      category: TaskCategory;
      priority: TaskPriority;
      steps?: string[];
    }): Promise<CollegeTask> => {
      const id = makeSafeId('task');
      const now = Date.now();
      const safeTitle = input.title.trim().slice(0, 160) || 'Untitled Task';
      const safeSteps = sanitizeStepsList(input.steps ?? []);
      const newTask: CollegeTask = {
        id,
        userId: user?.uid,
        title: safeTitle,
        category: input.category,
        priority: input.priority,
        completed: false,
        steps: safeSteps,
        completedSteps: [],
        createdAt: now,
        updatedAt: now,
      };

      if (user && user.emailVerified) {
        const taskPath = `users/${user.uid}/tasks/${id}`;
        try {
          await setDoc(doc(db, taskPath), {
            userId: user.uid,
            title: safeTitle,
            category: input.category,
            priority: input.priority,
            completed: false,
            steps: safeSteps,
            completedSteps: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, taskPath);
        }
      } else {
        setTasks((prev) => [newTask, ...prev]);
      }

      return newTask;
    },
    [user]
  );

  const toggleTaskCompleted = useCallback(
    async (taskId: string, forceCompleted?: boolean) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;
      const nextCompleted =
        typeof forceCompleted === 'boolean' ? forceCompleted : !target.completed;

      if (user && user.emailVerified) {
        const taskPath = `users/${user.uid}/tasks/${taskId}`;
        try {
          await updateDoc(doc(db, taskPath), {
            completed: nextCompleted,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        }
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, completed: nextCompleted, updatedAt: Date.now() }
              : t
          )
        );
      }
    },
    [tasks, user]
  );

  const completeTaskByQuery = useCallback(
    async (titleOrId: string): Promise<CollegeTask | null> => {
      const needle = titleOrId.trim().toLowerCase();
      if (!needle) return null;
      const match =
        tasks.find((t) => t.id.toLowerCase() === needle) ||
        tasks.find((t) => !t.completed && t.title.toLowerCase().includes(needle)) ||
        tasks.find((t) => t.title.toLowerCase().includes(needle));
      if (!match) return null;
      await toggleTaskCompleted(match.id, true);
      return match;
    },
    [tasks, toggleTaskCompleted]
  );

  const updateTaskSteps = useCallback(
    async (taskId: string, steps: string[]) => {
      const safeSteps = sanitizeStepsList(steps);
      if (user && user.emailVerified) {
        const taskPath = `users/${user.uid}/tasks/${taskId}`;
        try {
          await updateDoc(doc(db, taskPath), {
            steps: safeSteps,
            completedSteps: [],
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        }
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, steps: safeSteps, completedSteps: [], updatedAt: Date.now() }
              : t
          )
        );
      }
    },
    [user]
  );

  const breakdownTaskByQuery = useCallback(
    async (titleOrId: string, steps: string[]): Promise<CollegeTask | null> => {
      const needle = titleOrId.trim().toLowerCase();
      const match =
        tasks.find((t) => t.id.toLowerCase() === needle) ||
        tasks.find((t) => t.title.toLowerCase().includes(needle));
      if (!match) return null;
      await updateTaskSteps(match.id, steps);
      return match;
    },
    [tasks, updateTaskSteps]
  );

  const toggleTaskStep = useCallback(
    async (taskId: string, stepText: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;
      const exists = target.completedSteps.includes(stepText);
      const nextCompletedSteps = exists
        ? target.completedSteps.filter((s) => s !== stepText)
        : sanitizeStepsList([...target.completedSteps, stepText]);

      if (user && user.emailVerified) {
        const taskPath = `users/${user.uid}/tasks/${taskId}`;
        try {
          await updateDoc(doc(db, taskPath), {
            completedSteps: nextCompletedSteps,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, taskPath);
        }
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, completedSteps: nextCompletedSteps, updatedAt: Date.now() }
              : t
          )
        );
      }
    },
    [tasks, user]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (user && user.emailVerified) {
        const taskPath = `users/${user.uid}/tasks/${taskId}`;
        try {
          await deleteDoc(doc(db, taskPath));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, taskPath);
        }
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    },
    [user]
  );

  const appendMessage = useCallback(
    async (msg: { role: 'user' | 'assistant'; content: string; actions?: string[] }) => {
      const id = makeSafeId('msg');
      const safeContent = msg.content.trim().slice(0, 12000) || '...';
      const safeActions = (msg.actions ?? [])
        .map((a) => String(a).slice(0, 200))
        .slice(0, 8);

      const newMsg: ChatMessage = {
        id,
        userId: user?.uid,
        role: msg.role,
        content: safeContent,
        actions: safeActions,
        createdAt: Date.now(),
      };

      if (user && user.emailVerified) {
        const msgPath = `users/${user.uid}/messages/${id}`;
        try {
          await setDoc(doc(db, msgPath), {
            userId: user.uid,
            role: msg.role,
            content: safeContent,
            actions: safeActions,
            createdAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, msgPath);
        }
      } else {
        setMessages((prev) => [...prev, newMsg]);
      }

      return newMsg;
    },
    [user]
  );

  const clearMessages = useCallback(async () => {
    if (user && user.emailVerified) {
      const current = [...messages];
      for (const m of current) {
        if (m.id === 'msg-welcome') continue;
        const msgPath = `users/${user.uid}/messages/${m.id}`;
        try {
          await deleteDoc(doc(db, msgPath));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, msgPath);
        }
      }
    } else {
      setMessages(INITIAL_MESSAGES);
    }
  }, [messages, user]);

  const updateSettings = useCallback(
    async (patch: Partial<JarvisSettings>) => {
      const next: JarvisSettings = {
        ...settings,
        ...patch,
        voiceName: (patch.voiceName ?? settings.voiceName).slice(0, 120),
        speechRate: Math.min(2.0, Math.max(0.5, patch.speechRate ?? settings.speechRate)),
        speechPitch: Math.min(2.0, Math.max(0.5, patch.speechPitch ?? settings.speechPitch)),
        focusMinutes: Math.min(
          120,
          Math.max(1, Math.round(patch.focusMinutes ?? settings.focusMinutes))
        ),
        courseTrack: (patch.courseTrack ?? settings.courseTrack).slice(0, 120),
      };
      setSettings(next);

      if (user && user.emailVerified) {
        const settingsPath = `users/${user.uid}/settings/preferences`;
        try {
          await setDoc(
            doc(db, settingsPath),
            {
              userId: user.uid,
              voiceEnabled: next.voiceEnabled,
              handsFreeMode: next.handsFreeMode,
              voiceName: next.voiceName,
              speechRate: next.speechRate,
              speechPitch: next.speechPitch,
              focusMinutes: next.focusMinutes,
              courseTrack: next.courseTrack,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, settingsPath);
        }
      }
    },
    [settings, user]
  );

  return {
    user,
    authReady,
    syncError,
    clearSyncError: () => setSyncError(null),
    tasks,
    messages,
    settings,
    signInWithGoogle,
    signOutUser,
    addTask,
    toggleTaskCompleted,
    completeTaskByQuery,
    updateTaskSteps,
    breakdownTaskByQuery,
    toggleTaskStep,
    deleteTask,
    appendMessage,
    clearMessages,
    updateSettings,
  };
}
