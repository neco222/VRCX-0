import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setTrayIconNotification } from '@/services/shellIntegrationService';

import { useShellStore } from './shellStore';

vi.mock('@/services/shellIntegrationService', () => ({
    setTrayIconNotification: vi.fn().mockResolvedValue(undefined)
}));

describe('shellStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useShellStore.setState({
            notificationIconDot: true,
            notificationLayout: 'table',
            notifiedMenus: [],
            trayIconNotify: false,
            vrcUnseenNotificationCount: 0
        });
    });

    it('tracks notified menus once and syncs the tray icon state', () => {
        useShellStore.getState().notifyMenu('friend-log');
        useShellStore.getState().notifyMenu('friend-log');

        expect(useShellStore.getState().notifiedMenus).toEqual(['friend-log']);
        expect(useShellStore.getState().trayIconNotify).toBe(true);
        expect(setTrayIconNotification).toHaveBeenLastCalledWith(true);
    });
});
