import type { UnlistenFn } from '@tauri-apps/api/event';

import { normalizePlatformError } from './errors.js';

export type BackendEventHandler = (payload: unknown) => void;

interface BackendEventRegistration {
    promise: Promise<UnlistenFn>;
    unlisten: UnlistenFn | null;
}

const listeners = new Map<string, Set<BackendEventHandler>>();
const tauriRegistrations = new Map<string, BackendEventRegistration>();

async function loadListen() {
    const event = await import('@tauri-apps/api/event');
    return event.listen;
}

function getBucket(name: string): Set<BackendEventHandler> {
    let bucket = listeners.get(name);
    if (!bucket) {
        bucket = new Set();
        listeners.set(name, bucket);
    }
    return bucket;
}

function dispatch(name: string, payload: unknown): void {
    const bucket = listeners.get(name);
    if (!bucket || bucket.size === 0) {
        return;
    }

    for (const handler of bucket) {
        try {
            handler(payload);
        } catch (error) {
            console.error(`Error in backend event handler for ${name}:`, error);
        }
    }
}

async function ensureTauriSubscription(name: string): Promise<UnlistenFn> {
    const existing = tauriRegistrations.get(name);
    if (existing) {
        return existing.promise;
    }

    const bucket: BackendEventRegistration = {
        promise: Promise.resolve(() => undefined),
        unlisten: null
    };
    bucket.promise = (async () => {
        try {
            const listen = await loadListen();
            const unlisten = await listen<unknown>(name, (event) => {
                dispatch(name, event.payload);
            });
            bucket.unlisten = unlisten;

            if (!listeners.has(name) || listeners.get(name)?.size === 0) {
                try {
                    unlisten();
                } catch {
                    // ignore cleanup errors
                }
                tauriRegistrations.delete(name);
            }

            return unlisten;
        } catch (error) {
            throw normalizePlatformError(
                error,
                `Unable to subscribe to backend event: ${name}`
            );
        }
    })();

    tauriRegistrations.set(name, bucket);
    return bucket.promise;
}

export async function onBackendEvent(
    name: string,
    handler: BackendEventHandler
): Promise<() => void> {
    getBucket(name).add(handler);
    await ensureTauriSubscription(name);

    return () => offBackendEvent(name, handler);
}

export function offBackendEvent(
    name: string,
    handler: BackendEventHandler
): void {
    const bucket = listeners.get(name);
    if (!bucket) {
        return;
    }

    bucket.delete(handler);
    if (bucket.size === 0) {
        listeners.delete(name);
        const registration = tauriRegistrations.get(name);
        if (registration?.unlisten) {
            try {
                registration.unlisten();
            } catch {
                // ignore cleanup errors
            }
            tauriRegistrations.delete(name);
        }
    }
}

export function emitBackendEvent(name: string, payload?: unknown): void {
    dispatch(name, payload);
}

export function clearBackendEventListeners(name: string | null = null): void {
    if (name === null) {
        for (const registration of tauriRegistrations.values()) {
            if (registration?.unlisten) {
                try {
                    registration.unlisten();
                } catch {
                    // ignore cleanup errors
                }
            }
        }
        listeners.clear();
        tauriRegistrations.clear();
        return;
    }

    listeners.delete(name);
    const registration = tauriRegistrations.get(name);
    if (registration?.unlisten) {
        try {
            registration.unlisten();
        } catch {
            // ignore cleanup errors
        }
    }
    tauriRegistrations.delete(name);
}

export const backendEvents = Object.freeze({
    on: onBackendEvent,
    off: offBackendEvent,
    emit: emitBackendEvent,
    clear: clearBackendEventListeners,
    subscribe: onBackendEvent
});
