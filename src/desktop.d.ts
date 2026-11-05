export {};

type ViewMode = 'hud' | 'panel';
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
      processVoice: (payload: {bytes: Uint8Array; mimeType: string; character: string; situation: string}) => Promise<{transcript: string; translated: string; estimatedTextCostUsd: number}>;
      rewriteSpeech: (transcript: string, context: {character: string; situation: string}) => Promise<{text: string; estimatedTextCostUsd: number}>;
      copyText: (value: string) => Promise<void>;
      openUsage: () => Promise<void>;
      setHudMoveMode: (enabled: boolean) => void;
      saveRecording: (payload: {
        bytes: Uint8Array;
        extension: 'webm' | 'ogg';
      }) => Promise<SaveResult>;
      quit: () => void;
    };
  }
}
