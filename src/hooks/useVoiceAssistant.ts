import { useCallback, useEffect, useRef, useState } from 'react';
import type { JarvisSettings } from '../types/jarvis.ts';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

export function cleanTextForSpeech(markdown: string): string {
  let cleaned = markdown;
  // Replace fenced code blocks with a concise spoken notice
  cleaned = cleaned.replace(
    /```([a-zA-Z0-9_+-]*)\n[\s\S]*?```/g,
    (_match, lang: string) =>
      lang ? ` I have displayed the ${lang} code on your HUD. ` : ' I have displayed the code block on your HUD. '
  );
  // Strip inline code backticks, bold/italic markers, headings, and bullet symbols
  cleaned = cleaned
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > 750) {
    cleaned = cleaned.slice(0, 750).replace(/\s+\S*$/, '') + '.';
  }
  return cleaned;
}

export function playTimerChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  } catch {
    // Ignore audio context autoplay errors
  }
}

interface UseVoiceAssistantOptions {
  settings: JarvisSettings;
  onTranscriptFinal: (text: string) => void;
}

export function useVoiceAssistant({
  settings,
  onTranscriptFinal,
}: UseVoiceAssistantOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalCallbackRef = useRef(onTranscriptFinal);
  const settingsRef = useRef(settings);
  const manualStopRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});

  finalCallbackRef.current = onTranscriptFinal;
  settingsRef.current = settings;
  isSpeakingRef.current = isSpeaking;

  const speechRecognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const speechSynthesisSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Populate available TTS voices
  useEffect(() => {
    if (!speechSynthesisSupported) return;
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setAvailableVoices(list);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [speechSynthesisSupported]);

  // Simulate smooth audio level pulse while listening or speaking
  useEffect(() => {
    if (!isListening && !isSpeaking) {
      setAudioLevel(0);
      return;
    }
    let rafId = 0;
    let phase = 0;
    const tick = () => {
      phase += isSpeaking ? 0.24 : 0.16;
      const base = isSpeaking ? 0.52 : 0.42;
      const wave =
        Math.sin(phase) * 0.22 +
        Math.sin(phase * 2.3) * 0.14 +
        Math.cos(phase * 0.7) * 0.1;
      setAudioLevel(Math.max(0.12, Math.min(1, base + wave)));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isListening, isSpeaking]);

  const stopSpeaking = useCallback(() => {
    if (!speechSynthesisSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [speechSynthesisSupported]);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop race
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    setVoiceError(null);
    if (!speechRecognitionSupported) {
      setVoiceError(
        'Voice input requires a browser with Web Speech API support (Chrome, Edge, or Safari).'
      );
      return;
    }

    // Cancel any ongoing TTS before listening so JARVIS never hears himself
    if (isSpeakingRef.current) {
      stopSpeaking();
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    manualStopRef.current = false;

    let finalBuffer = '';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalBuffer += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript((finalBuffer + interim).trim());

      if (finalBuffer.trim()) {
        const textToSubmit = finalBuffer.trim();
        finalBuffer = '';
        setInterimTranscript('');
        try {
          recognition.stop();
        } catch {
          // Ignore
        }
        setIsListening(false);
        finalCallbackRef.current(textToSubmit);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setIsListening(false);
        setInterimTranscript('');
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError(
          'Microphone permission was denied. Please allow mic access in your browser.'
        );
      } else {
        setVoiceError(`Voice recognition error: ${event.error}`);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [speechRecognitionSupported, stopSpeaking]);

  startListeningRef.current = startListening;

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const speak = useCallback(
    (rawText: string, options?: { force?: boolean; allowHandsFreeResume?: boolean }) => {
      const shouldSpeak = options?.force || settingsRef.current.voiceEnabled;
      if (!shouldSpeak || !speechSynthesisSupported) {
        if (options?.allowHandsFreeResume && settingsRef.current.handsFreeMode) {
          setTimeout(() => startListeningRef.current(), 350);
        }
        return;
      }

      const spokenText = cleanTextForSpeech(rawText);
      if (!spokenText) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.name === settingsRef.current.voiceName) ||
        voices.find(
          (v) =>
            /en-(GB|AU)/i.test(v.lang) &&
            /daniel|arthur|oliver|george|ryan|google uk english male/i.test(v.name)
        ) ||
        voices.find((v) => /en-(GB|US)/i.test(v.lang));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.rate = settingsRef.current.speechRate;
      utterance.pitch = settingsRef.current.speechPitch;

      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        if (options?.allowHandsFreeResume && settingsRef.current.handsFreeMode && !manualStopRef.current) {
          setTimeout(() => {
            startListeningRef.current();
          }, 350);
        }
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [speechSynthesisSupported]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore
      }
      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSynthesisSupported]);

  return {
    isListening,
    isSpeaking,
    interimTranscript,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    availableVoices,
    audioLevel,
    speechRecognitionSupported,
    speechSynthesisSupported,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
