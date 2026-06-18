import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuntimeStore } from '@/state/runtimeStore';
import { useSessionStore } from '@/state/sessionStore';

import { handleIpcEvent } from './ipcEventService';

vi.mock('@/platform/tauri/bindings', () => ({
    commands: {
        appFocusWindow: vi.fn().mockResolvedValue(undefined)
    }
}));

describe('ipcEventService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRuntimeStore.getState().resetRuntimeState();
        useSessionStore.getState().resetSessionState();
    });

    it('ignores unsupported payload shapes without mutating runtime state', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        useSessionStore.getState().setLoggedIn(true);

        await handleIpcEvent(42);

        expect(warnSpy).toHaveBeenCalledWith(
            'IPC invalid payload:',
            42,
            expect.any(Error)
        );
        expect(
            useRuntimeStore.getState().gameState.externalNotifierVersion
        ).toBe(0);
        warnSpy.mockRestore();
    });

    it('parses string payloads and records external notifier version', async () => {
        useSessionStore.getState().setLoggedIn(true);

        await handleIpcEvent('{"type":"MsgPing","version":"24"}');

        expect(
            useRuntimeStore.getState().gameState.externalNotifierVersion
        ).toBe(24);
    });
});
