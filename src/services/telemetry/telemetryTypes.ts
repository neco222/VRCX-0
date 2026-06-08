import type { BackendRuntimeMode } from '@/platform/tauri/appCommandTypes';

export type TelemetryRuntimeMode = BackendRuntimeMode;

export type TelemetryContextPayload = {
    installId: string;
    sessionId: string;
    appVersion: string;
    platform: string;
    arch: string;
    locale: string;
    timezone: string;
    mode: TelemetryRuntimeMode;
    vrchatRunning: boolean;
    localWeekday: number;
    localHour: number;
    sessionEnded?: boolean;
};

export type TelemetryVrchatLifecycleState = 'started' | 'stopped';

export type TelemetryVrchatLifecyclePayload =
    TelemetryContextPayload & {
        state: TelemetryVrchatLifecycleState;
    };

export type TelemetrySessionState = {
    installId: string;
    sessionId: string;
    isNewInstall?: boolean;
};
