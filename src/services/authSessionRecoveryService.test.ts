import { beforeEach, describe, expect, it, vi } from 'vitest';

const vrchatRequestMocks = vi.hoisted(() => ({
    isVrchatSessionRecoveryError: vi.fn(),
    setVrchatAuthFailureHandler: vi.fn()
}));

const recoveryMocks = vi.hoisted(() => ({
    toastWarning: vi.fn(),
    recordLogout: vi.fn(),
    clearAuthCookies: vi.fn(),
    resetCurrentUserRuntimeAuth: vi.fn(),
    setSignedOutSessionState: vi.fn(),
    applySavedAuthSnapshot: vi.fn(),
    refreshSavedAuthSnapshot: vi.fn(),
    t: vi.fn()
}));

vi.mock('sonner', () => ({
    toast: {
        warning: recoveryMocks.toastWarning
    }
}));

vi.mock('@/repositories/vrchatRequest', () => ({
    isVrchatSessionRecoveryError:
        vrchatRequestMocks.isVrchatSessionRecoveryError,
    setVrchatAuthFailureHandler: vrchatRequestMocks.setVrchatAuthFailureHandler
}));

vi.mock('@/repositories/authRepository', () => ({
    default: {
        recordLogout: recoveryMocks.recordLogout
    }
}));

vi.mock('@/repositories/webRepository', () => ({
    default: {
        clearAuthCookies: recoveryMocks.clearAuthCookies
    }
}));

vi.mock('./authExecutionService', () => ({
    resetCurrentUserRuntimeAuth: recoveryMocks.resetCurrentUserRuntimeAuth,
    setSignedOutSessionState: recoveryMocks.setSignedOutSessionState
}));

vi.mock('./authSnapshotService', () => ({
    applySavedAuthSnapshot: recoveryMocks.applySavedAuthSnapshot,
    refreshSavedAuthSnapshot: recoveryMocks.refreshSavedAuthSnapshot
}));

vi.mock('./i18nService', () => ({
    default: {
        t: recoveryMocks.t
    }
}));

import { useRuntimeStore } from '@/state/runtimeStore';
import { useSessionStore } from '@/state/sessionStore';

import {
    handleRuntimeAuthFailure,
    runWithRuntimeAuthFailureRecoverySuppressed,
    shouldHandleRuntimeAuthFailure,
    startRuntimeAuthFailureRecovery
} from './authSessionRecoveryService';

describe('authSessionRecoveryService public guardrails', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        useRuntimeStore.getState().resetRuntimeState();
        useSessionStore.getState().resetSessionState();
        vrchatRequestMocks.isVrchatSessionRecoveryError.mockReturnValue(true);
        vrchatRequestMocks.setVrchatAuthFailureHandler.mockReturnValue(vi.fn());
        recoveryMocks.recordLogout.mockResolvedValue({
            lastUserLoggedIn: 'usr_1',
            savedCredentialCount: 1,
            autoLoginStatus: 'available',
            autoLoginReason: 'available',
            autoLoginDelayEnabled: false,
            autoLoginDelaySeconds: 0
        });
        recoveryMocks.clearAuthCookies.mockResolvedValue(undefined);
        recoveryMocks.resetCurrentUserRuntimeAuth.mockResolvedValue(undefined);
        recoveryMocks.applySavedAuthSnapshot.mockImplementation(
            (snapshot: unknown) => snapshot
        );
        recoveryMocks.t.mockImplementation((key: string) =>
            Promise.resolve(key)
        );
    });

    it('handles runtime auth failures only for ready signed-in sessions with a current user', () => {
        const error = new Error('Forbidden');

        expect(shouldHandleRuntimeAuthFailure(error)).toBe(false);

        useSessionStore.getState().setSessionState({
            sessionPhase: 'ready',
            isLoggedIn: true
        });
        useRuntimeStore.getState().setAuthBootstrap({
            currentUserId: 'usr_1'
        });

        expect(shouldHandleRuntimeAuthFailure(error)).toBe(true);
        expect(
            vrchatRequestMocks.isVrchatSessionRecoveryError
        ).toHaveBeenCalledWith(error);
    });

    it('suppresses recovery while protected auth execution is running', async () => {
        useSessionStore.getState().setSessionState({
            sessionPhase: 'ready',
            isLoggedIn: true
        });
        useRuntimeStore.getState().setAuthBootstrap({
            currentUserId: 'usr_1'
        });

        await runWithRuntimeAuthFailureRecoverySuppressed(async () => {
            expect(shouldHandleRuntimeAuthFailure(new Error('401'))).toBe(
                false
            );
        });

        expect(shouldHandleRuntimeAuthFailure(new Error('401'))).toBe(true);
    });

    it('registers the runtime auth failure handler and returns the unsubscribe callback', () => {
        const unsubscribe = vi.fn();
        vrchatRequestMocks.setVrchatAuthFailureHandler.mockReturnValueOnce(
            unsubscribe
        );

        const stopRecovery = startRuntimeAuthFailureRecovery();
        stopRecovery();

        expect(
            vrchatRequestMocks.setVrchatAuthFailureHandler
        ).toHaveBeenCalledWith(expect.any(Function));
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('keeps the last user target when runtime recovery prepares auto-login', async () => {
        useSessionStore.getState().setSessionState({
            sessionPhase: 'ready',
            isLoggedIn: true
        });
        useRuntimeStore.getState().setAuthBootstrap({
            currentUserId: 'usr_1',
            lastUserLoggedIn: 'usr_1'
        });

        const recovery = handleRuntimeAuthFailure(
            Object.assign(new Error('Missing Credentials'), {
                status: 401,
                endpoint: 'auth',
                payload: null
            })
        );

        await expect(recovery).resolves.toBeUndefined();

        expect(recoveryMocks.clearAuthCookies).toHaveBeenCalledTimes(1);
        expect(recoveryMocks.recordLogout).toHaveBeenCalledWith('usr_1', {
            clearLastUserLoggedIn: false,
            cookies: null
        });
        expect(recoveryMocks.applySavedAuthSnapshot).toHaveBeenCalledWith(
            expect.objectContaining({
                lastUserLoggedIn: 'usr_1',
                autoLoginStatus: 'available'
            })
        );
    });
});
