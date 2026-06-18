import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { useRuntimeStore } from '@/state/runtimeStore';

import {
    executeNotificationDelivery,
    type NotificationDeliveryDirective
} from './notificationDeliveryService';

const commandsMock = vi.hoisted(() => ({
    appDesktopNotification: vi.fn(),
    appGetImage: vi.fn(),
    appOvrtNotification: vi.fn(),
    appXsNotification: vi.fn()
}));

const configRepositoryMock = vi.hoisted(() => ({
    getBool: vi.fn(),
    getInt: vi.fn(),
    getRawValue: vi.fn(),
    getString: vi.fn()
}));

vi.mock('@/platform/tauri/bindings', () => ({
    commands: commandsMock
}));

vi.mock('@/repositories/configRepository', () => ({
    default: configRepositoryMock
}));

vi.mock('@/repositories/memoPersistenceRepository', () => ({
    default: {
        getUserMemo: vi.fn()
    }
}));

vi.mock('@/services/entityMediaService', () => ({
    userImage: vi.fn(() => '')
}));

describe('notificationDeliveryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useRuntimeStore.getState().resetRuntimeState();
        useRuntimeStore.getState().setGameState({
            isGameRunning: true,
            isGameNoVR: false,
            isHmdAfk: false,
            isSteamVRRunning: true
        });

        configRepositoryMock.getRawValue.mockImplementation(
            async (key: string) =>
                [
                    'xsNotifications',
                    'ovrtHudNotifications',
                    'ovrtWristNotifications',
                    'imageNotifications',
                    'notificationTimeout',
                    'notificationOpacity'
                ].includes(key)
                    ? 'configured'
                    : null
        );
        configRepositoryMock.getString.mockImplementation(
            async (key: string, fallback: string) => {
                if (key === 'desktopToast') {
                    return 'Always';
                }
                if (key === 'notificationTTS') {
                    return 'Never';
                }
                return fallback;
            }
        );
        configRepositoryMock.getBool.mockImplementation(
            async (key: string, fallback: boolean) => fallback
        );
        configRepositoryMock.getInt.mockImplementation(
            async (key: string, fallback: number) => {
                if (key === 'notificationTimeout') {
                    return 4500;
                }
                if (key === 'notificationOpacity') {
                    return 80;
                }
                return fallback;
            }
        );
        commandsMock.appDesktopNotification.mockResolvedValue(undefined);
        commandsMock.appGetImage.mockResolvedValue('');
        commandsMock.appOvrtNotification.mockResolvedValue(undefined);
        commandsMock.appXsNotification.mockResolvedValue(undefined);
    });

    it('exports a typed notification delivery directive contract', () => {
        expectTypeOf<
            Parameters<typeof executeNotificationDelivery>[0]
        >().toEqualTypeOf<NotificationDeliveryDirective>();
        expectTypeOf<NotificationDeliveryDirective['title']>().not.toBeAny();
        expectTypeOf<
            NotificationDeliveryDirective['actorUserId']
        >().not.toBeAny();
    });

    it('normalizes overlay timeout and opacity before dispatching VR notifications', async () => {
        await executeNotificationDelivery({
            vr: true,
            title: 'Invite',
            body: 'Join me',
            text: 'Invite Join me'
        });

        expect(commandsMock.appXsNotification).toHaveBeenCalledWith(
            'VRCX',
            'Invite Join me',
            4,
            0.8,
            ''
        );
        expect(commandsMock.appOvrtNotification).toHaveBeenCalledWith(
            true,
            false,
            'VRCX',
            'Invite Join me',
            4,
            0.8,
            ''
        );
    });
});
