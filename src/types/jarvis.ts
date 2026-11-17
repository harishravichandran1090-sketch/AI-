export type BrainState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export type TaskCategory =
  | 'Coursework'
  | 'Lab Record'
  | 'Exam Prep'
  | 'Project'
  | 'Coding'
  | 'Personal';

export type TaskPriority = 'high' | 'medium' | 'low';

export interface CollegeTask {
  id: string;
  userId?: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  completed: boolean;
  steps: string[];
  completedSteps: string[];
  createdAt: number;
  updatedAt: number;
}

export type JarvisAction =
  | {
      type: 'add_task';
      title: string;
      category: TaskCategory;
      priority: TaskPriority;
      steps: string[];
    }
  | {
      type: 'complete_task';
      title_or_id: string;
    }
  | {
      type: 'breakdown_task';
      title_or_id: string;
      steps: string[];
    }
  | {
      type: 'start_timer';
      minutes: number;
    }
  | {
      type: 'reset_timer';
    }
  | {
      type: 'brief_me';
    };

export interface ChatMessage {
  id: string;
  userId?: string;
  role: 'user' | 'assistant';
  content: string;
  actions: string[];
  createdAt: number;
}

export interface JarvisSettings {
  voiceEnabled: boolean;
  handsFreeMode: boolean;
  voiceName: string;
  speechRate: number;
  speechPitch: number;
  focusMinutes: number;
  courseTrack: string;
}

export interface TimerState {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
}

export interface JarvisChatResponse {
  reply: string;
  actions: JarvisAction[];
}
