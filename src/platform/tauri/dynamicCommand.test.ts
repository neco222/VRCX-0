import { beforeEach, describe, expect, it, vi } from 'vitest';

const commandMocks = vi.hoisted(() => ({
    appGetUgcPhotoLocation: vi.fn(),
    appIpcAnnounceStart: vi.fn()
}));

vi.mock('./bindings', () => ({
    commands: commandMocks
}));

import { invokeAppCommand } from './dynamicCommand';

describe('invokeAppCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('maps legacy PascalCase method names to generated app command functions', async () => {
        commandMocks.appGetUgcPhotoLocation.mockResolvedValueOnce({
            path: 'C:/VRChat/Photos'
        });

        await expect(
            invokeAppCommand<{ path: string }>('GetUGCPhotoLocation', 'latest')
        ).resolves.toEqual({
            path: 'C:/VRChat/Photos'
        });
        expect(commandMocks.appGetUgcPhotoLocation).toHaveBeenCalledWith(
            'latest'
        );
    });

    it('normalizes acronym-heavy method names and unknown command errors', async () => {
        commandMocks.appIpcAnnounceStart.mockResolvedValueOnce(true);

        await expect(
            invokeAppCommand<boolean>('IPCAnnounceStart')
        ).resolves.toBe(true);
        await expect(invokeAppCommand('MissingCommand')).rejects.toThrow(
            'App command failed: MissingCommand: Unknown app command: MissingCommand'
        );
    });
});
