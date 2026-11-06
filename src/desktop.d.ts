export {};

type ViewMode = 'hud' | 'panel';
type HistoryEntry = {
  id: string;
  createdAt: number;
  durationMs: number;
  transcript: string;
  english: string;
  targetLanguage: string;
  presetId: string;
  estimatedTextCostUsd: number;
  transcriptionCostUsd: number;
  recognizedWords: number;
  extension: 'webm' | 'ogg';
  audioBytes: number;
};
type HistoryStats = {
  recordings: number;
  durationMs: number;
  words: number;
  estimatedCostUsd: number;
  audioBytes: number;
};
type HistorySnapshot = {
  entries: HistoryEntry[];
  stored: HistoryStats;
  lifetime: Omit<HistoryStats, 'audioBytes'>;
};

type SaveResult = { canceled: true } | { canceled: false; filePath: string };

declare global {
  interface Window {
    inCharacter: {
      onHoldKeyDown: (callback: () => void) => () => void;
      onHoldKeyUp: (callback: () => void) => () => void;
      onToggleRecording: (callback: () => void) => () => void;
      onViewModeChanged: (callback: (mode: ViewMode) => void) => () => void;
      onHudMoveModeChanged: (callback: (enabled: boolean) => void) => () => void;
      onShortcutStatus: (callback: (status: { recording: boolean; panel: boolean; move: boolean; hold: boolean }) => void) => () => void;
      setViewMode: (mode: ViewMode) => void;
      startHudDrag: () => void;
      moveHudDrag: () => void;
      endHudDrag: () => void;
      hasApiKey: () => Promise<boolean>;
      saveApiKey: (key: string) => Promise<boolean>;
      processVoice: (payload: {bytes: Uint8Array; mimeType: string; additionalContext: string; targetLanguage: string; presetId: string}) => Promise<{transcript: string; translated: string; estimatedTextCostUsd: number}>;
      rewriteSpeech: (transcript: string, context: {additionalContext: string; targetLanguage: string; presetId: string}) => Promise<{text: string; estimatedTextCostUsd: number}>;
      listPresets: () => Promise<Array<{
        id: string;
        name: { en: string; ru?: string; fr?: string; es?: string; de?: string };
        description: { en: string; ru?: string; fr?: string; es?: string; de?: string };
        source: 'built-in' | 'custom';
      }>>;
      openPresetsFolder: () => Promise<void>;
      copyText: (value: string) => Promise<void>;
      historyList: () => Promise<HistorySnapshot>;
      historyAdd: (input: {bytes: Uint8Array; mimeType:string; durationMs:number; targetLanguage:string; presetId:string}) => Promise<HistorySnapshot>;
      historyFinish: (id: string, result: {transcript:string; english:string; transcriptionCostUsd:number; estimatedTextCostUsd:number}) => Promise<HistorySnapshot>;
      historyEdit: (id: string, changes: {transcript?:string; english?:string}) => Promise<HistorySnapshot>;
      historyRewrite: (id: string, english: string, cost: number) => Promise<HistorySnapshot>;
      historyReadAudio: (id: string) => Promise<{bytes: Uint8Array; mimeType:string}>;
      historyDelete: (id: string) => Promise<HistorySnapshot>;
      historyClear: (days: number | null) => Promise<HistorySnapshot>;
      historyExport: (id: string) => Promise<SaveResult>;
      openUsage: () => Promise<void>;
      getPreferredLanguages: () => Promise<string[]>;
      setThemeBackground: (scheme: 'light' | 'dark') => void;
      setShortcutCapture: (active: boolean) => void;
      getShortcuts: () => Promise<{shortcuts: {record:string;panel:string;move:string};status: {recording:boolean;panel:boolean;move:boolean;hold:boolean}}>;
      setShortcuts: (value: {record:string;panel:string;move:string}) => Promise<{shortcuts: {record:string;panel:string;move:string};status: {recording:boolean;panel:boolean;move:boolean;hold:boolean}}>;
      setHudMoveMode: (enabled: boolean) => void;
      saveRecording: (payload: {
        bytes: Uint8Array;
        extension: 'webm' | 'ogg';
      }) => Promise<SaveResult>;
      quit: () => void;
    };
  }
}
