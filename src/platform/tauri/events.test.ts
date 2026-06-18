import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTauriEvent = {
    payload: unknown;
};

const eventMock = vi.hoisted(() => ({
    handlers: new Map<string, (event: MockTauriEvent) => void>(),
    listen: vi.fn(),
    unlisten: vi.fn()
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: eventMock.listen
}));

import { clearTauriEventListeners, subscribeTauriEvent } from './events';

describe('tauri events bridge', () => {
    beforeEach(() => {
        clearTauriEventListeners();
        eventMock.handlers.clear();
        eventMock.unlisten.mockReset();
        eventMock.listen.mockReset();
        eventMock.listen.mockImplementation(
            async (name: string, handler: (event: MockTauriEvent) => void) => {
                eventMock.handlers.set(name, handler);
                return eventMock.unlisten;
            }
        );
    });

    it('dispatches typed payloads from the shared Tauri subscription', async () => {
        const handler = vi.fn<(payload: { version: number }) => void>();
        const unsubscribe = await subscribeTauriEvent<{ version: number }>(
            'runtime:update',
            handler
        );

        expect(eventMock.listen).toHaveBeenCalledWith(
            'runtime:update',
            expect.any(Function)
        );

        eventMock.handlers.get('runtime:update')?.({
            payload: { version: 7 }
        });
        expect(handler).toHaveBeenCalledWith({ version: 7 });

        unsubscribe();
        eventMock.handlers.get('runtime:update')?.({
            payload: { version: 8 }
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(eventMock.unlisten).toHaveBeenCalledTimes(1);
    });

    it('shares one Tauri listener across multiple frontend handlers', async () => {
        const first = vi.fn();
        const second = vi.fn();

        const unsubscribeFirst = await subscribeTauriEvent(
            'runtime:game-log',
            first
        );
        const unsubscribeSecond = await subscribeTauriEvent(
            'runtime:game-log',
            second
        );

        expect(eventMock.listen).toHaveBeenCalledTimes(1);
        eventMock.handlers.get('runtime:game-log')?.({
            payload: { batch: 1 }
        });
        expect(first).toHaveBeenCalledWith({ batch: 1 });
        expect(second).toHaveBeenCalledWith({ batch: 1 });

        unsubscribeFirst();
        expect(eventMock.unlisten).not.toHaveBeenCalled();

        eventMock.handlers.get('runtime:game-log')?.({
            payload: { batch: 2 }
        });
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(2);

        unsubscribeSecond();
        expect(eventMock.unlisten).toHaveBeenCalledTimes(1);
    });
});
