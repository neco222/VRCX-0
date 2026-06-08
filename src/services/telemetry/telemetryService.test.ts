import { afterEach, describe, expect, it, vi } from 'vitest';

describe('startTelemetryLifecycle', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('does not start a second heartbeat while the previous heartbeat is pending', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', {
            setInterval: globalThis.setInterval,
            clearInterval: globalThis.clearInterval
        });
        const heartbeatResolvers: Array<() => void> = [];
        const postTelemetry = vi.fn((path: string) => {
            if (path.endsWith('/session/heartbeat')) {
                return new Promise<void>((resolve) => {
                    heartbeatResolvers.push(resolve);
                });
            }
            return Promise.resolve();
        });

        vi.doMock('./telemetryConfig', () => ({
            TELEMETRY_HEARTBEAT_INTERVAL_MS: 1_000,
            isAnonymousUsageTelemetryEnabled: () => true,
            isTelemetryEnabled: () => true
        }));
        vi.doMock('./telemetryClient', () => ({ postTelemetry }));
        vi.doMock('./telemetryIdentity', () => ({
            createTelemetrySessionId: () => 'session-test',
            getOrCreateTelemetryInstallIdentity: () =>
                Promise.resolve({ installId: 'install-test', isNewInstall: false })
        }));
        vi.doMock('@/repositories/configRepository', () => ({
            default: {
                getString: vi.fn(() => Promise.resolve('')),
                setString: vi.fn(() => Promise.resolve())
            }
        }));
        vi.doMock('./telemetryPayload', () => ({
            buildTelemetryContext: () => ({}),
            getCurrentTelemetryMode: () => 'foreground',
            waitForInitialTelemetryContext: () => Promise.resolve()
        }));
        vi.doMock('@/state/runtimeStore', () => ({
            useRuntimeStore: {
                subscribe: vi.fn(() => vi.fn())
            }
        }));

        const { startTelemetryLifecycle } = await import('./telemetryService');
        const cleanup = startTelemetryLifecycle();

        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/session/start',
                {}
            )
        );

        await vi.advanceTimersByTimeAsync(1_000);
        expect(
            postTelemetry.mock.calls.filter(([path]) =>
                String(path).endsWith('/session/heartbeat')
            )
        ).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(
            postTelemetry.mock.calls.filter(([path]) =>
                String(path).endsWith('/session/heartbeat')
            )
        ).toHaveLength(1);

        heartbeatResolvers[0]?.();
        await Promise.resolve();

        await vi.advanceTimersByTimeAsync(1_000);
        expect(
            postTelemetry.mock.calls.filter(([path]) =>
                String(path).endsWith('/session/heartbeat')
            )
        ).toHaveLength(2);

        cleanup();
    });

    it('posts VRChat lifecycle events on state changes and cleanup', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', {
            setInterval: globalThis.setInterval,
            clearInterval: globalThis.clearInterval
        });
        const postTelemetry = vi.fn((_path: string, _payload: unknown) =>
            Promise.resolve()
        );
        let vrchatRunning = false;
        let runtimeCallback:
            | ((state: any, previousState: any) => void)
            | undefined;
        const unsubscribe = vi.fn();

        vi.doMock('./telemetryConfig', () => ({
            TELEMETRY_HEARTBEAT_INTERVAL_MS: 1_000,
            isAnonymousUsageTelemetryEnabled: () => true,
            isTelemetryEnabled: () => true
        }));
        vi.doMock('./telemetryClient', () => ({ postTelemetry }));
        vi.doMock('./telemetryIdentity', () => ({
            createTelemetrySessionId: () => 'session-test',
            getOrCreateTelemetryInstallIdentity: () =>
                Promise.resolve({ installId: 'install-test', isNewInstall: false })
        }));
        vi.doMock('@/repositories/configRepository', () => ({
            default: {
                getString: vi.fn(() => Promise.resolve('')),
                setString: vi.fn(() => Promise.resolve())
            }
        }));
        vi.doMock('./telemetryPayload', () => ({
            buildTelemetryContext: () => ({ vrchatRunning }),
            getCurrentTelemetryMode: () => 'foreground',
            waitForInitialTelemetryContext: () => Promise.resolve()
        }));
        vi.doMock('@/state/runtimeStore', () => ({
            useRuntimeStore: {
                subscribe: vi.fn((callback) => {
                    runtimeCallback = callback;
                    return unsubscribe;
                })
            }
        }));

        const { startTelemetryLifecycle } = await import('./telemetryService');
        const cleanup = startTelemetryLifecycle();

        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/session/start',
                { vrchatRunning: false }
            )
        );

        vrchatRunning = true;
        runtimeCallback?.(
            { gameState: { isGameRunning: true } },
            { gameState: { isGameRunning: false } }
        );
        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/vrchat',
                { vrchatRunning: true, state: 'started' }
            )
        );

        cleanup();
        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/session/heartbeat',
                { vrchatRunning: true, sessionEnded: true }
            )
        );
        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/vrchat',
                { vrchatRunning: false, state: 'stopped' }
            )
        );
        expect(unsubscribe).toHaveBeenCalled();
    });

    it('keeps basic session telemetry when anonymous usage telemetry is off', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', {
            setInterval: globalThis.setInterval,
            clearInterval: globalThis.clearInterval
        });
        const postTelemetry = vi.fn((_path: string, _payload: unknown) =>
            Promise.resolve()
        );
        let runtimeCallback:
            | ((state: any, previousState: any) => void)
            | undefined;

        vi.doMock('./telemetryConfig', () => ({
            TELEMETRY_HEARTBEAT_INTERVAL_MS: 1_000,
            isAnonymousUsageTelemetryEnabled: () => false,
            isTelemetryEnabled: () => true
        }));
        vi.doMock('./telemetryClient', () => ({ postTelemetry }));
        vi.doMock('./telemetryIdentity', () => ({
            createTelemetrySessionId: () => 'session-test',
            getOrCreateTelemetryInstallIdentity: () =>
                Promise.resolve({ installId: 'install-test', isNewInstall: true })
        }));
        vi.doMock('@/repositories/configRepository', () => ({
            default: {
                getString: vi.fn(() => Promise.resolve('2.4.0')),
                setString: vi.fn(() => Promise.resolve())
            }
        }));
        vi.doMock('./telemetryPayload', () => ({
            buildBasicTelemetryContext: () => ({
                installId: 'install-test',
                sessionId: 'session-test',
                appVersion: '2.4.0',
                timezone: 'Asia/Tokyo',
                vrchatRunning: false
            }),
            buildTelemetryContext: () => ({
                installId: 'install-test',
                sessionId: 'session-test',
                appVersion: '2.4.0',
                timezone: 'Asia/Tokyo',
                vrchatRunning: true
            }),
            getCurrentTelemetryMode: () => 'foreground',
            waitForInitialTelemetryContext: () => Promise.resolve()
        }));
        vi.doMock('@/state/runtimeStore', () => ({
            useRuntimeStore: {
                subscribe: vi.fn((callback) => {
                    runtimeCallback = callback;
                    return vi.fn();
                })
            }
        }));

        const { startTelemetryLifecycle } = await import('./telemetryService');
        const cleanup = startTelemetryLifecycle();

        await vi.waitFor(() =>
            expect(postTelemetry).toHaveBeenCalledWith(
                '/api/v1/telemetry/session/start',
                {
                    installId: 'install-test',
                    sessionId: 'session-test',
                    appVersion: '2.4.0',
                    timezone: 'Asia/Tokyo',
                    vrchatRunning: false
                }
            )
        );

        await vi.advanceTimersByTimeAsync(1_000);
        runtimeCallback?.(
            { gameState: { isGameRunning: true } },
            { gameState: { isGameRunning: false } }
        );
        cleanup();

        expect(postTelemetry.mock.calls.map((call) => call[0])).toEqual([
            '/api/v1/telemetry/session/start'
        ]);
    });

    it('skips basic telemetry when anonymous usage telemetry is off and the version was already reported', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', {
            setInterval: globalThis.setInterval,
            clearInterval: globalThis.clearInterval
        });
        const postTelemetry = vi.fn((_path: string, _payload: unknown) =>
            Promise.resolve()
        );
        const subscribe = vi.fn(() => vi.fn());

        vi.doMock('./telemetryConfig', () => ({
            TELEMETRY_HEARTBEAT_INTERVAL_MS: 1_000,
            TELEMETRY_BASIC_INFO_REPORTED_VERSION_CONFIG_KEY:
                'telemetryBasicInfoReportedVersion',
            isAnonymousUsageTelemetryEnabled: () => false,
            isTelemetryEnabled: () => true
        }));
        vi.doMock('./telemetryClient', () => ({ postTelemetry }));
        vi.doMock('./telemetryIdentity', () => ({
            createTelemetrySessionId: () => 'session-test',
            getOrCreateTelemetryInstallIdentity: () =>
                Promise.resolve({ installId: 'install-test', isNewInstall: false })
        }));
        vi.doMock('@/repositories/configRepository', () => ({
            default: {
                getString: vi.fn(() => Promise.resolve('unknown')),
                setString: vi.fn(() => Promise.resolve())
            }
        }));
        vi.doMock('./telemetryPayload', () => ({
            buildBasicTelemetryContext: () => ({
                installId: 'install-test',
                sessionId: 'session-test',
                appVersion: '2.4.0',
                timezone: 'Asia/Tokyo',
                vrchatRunning: false
            }),
            buildTelemetryContext: () => ({
                installId: 'install-test',
                sessionId: 'session-test',
                appVersion: '2.4.0',
                timezone: 'Asia/Tokyo',
                vrchatRunning: false
            }),
            getCurrentTelemetryMode: () => 'foreground',
            waitForInitialTelemetryContext: () => Promise.resolve()
        }));
        vi.doMock('@/state/runtimeStore', () => ({
            useRuntimeStore: {
                subscribe
            }
        }));

        const { startTelemetryLifecycle } = await import('./telemetryService');
        const cleanup = startTelemetryLifecycle();

        await vi.waitFor(() => expect(subscribe).toHaveBeenCalled());
        cleanup();

        expect(postTelemetry).not.toHaveBeenCalled();
    });
});
