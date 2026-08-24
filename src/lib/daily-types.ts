// Shared Daily client types + the global `window.DailyIframe` declaration.
// Used by both the desktop Prebuilt call page and the mobile custom call UI,
// so the two must not redeclare `window.DailyIframe` separately (TS2717).

export interface DailyCall {
  on: (event: string, cb: (data?: unknown) => void) => void;
  startCamera: () => Promise<unknown>;
  join: () => Promise<void>;
  leave: () => void;
  destroy: () => void | Promise<void>;
  setActiveSpeakerMode: (enabled: boolean) => void;
  loadCss: (opts: { bodyClass?: string; cssText?: string }) => void;
  participantCounts: () => { present: number };
  setLocalVideo: (enabled: boolean) => void;
  setLocalAudio: (enabled: boolean) => void;
  localVideo: () => boolean;
  localAudio: () => boolean;
  participants: () => Record<string, DailyParticipant>;
  sendAppMessage: (data: unknown, to?: string | string[]) => void;
}

export interface DailyParticipant {
  session_id: string;
  user_name: string;
  local: boolean;
  userData?: { avatar?: string; userName?: string };
}

declare global {
  interface Window {
    DailyIframe?: {
      createFrame: (
        container: HTMLElement | null,
        opts: Record<string, unknown>,
      ) => DailyCall;
      createCallObject: (opts: Record<string, unknown>) => DailyCall;
    };
  }
}
