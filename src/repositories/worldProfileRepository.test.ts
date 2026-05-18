import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMock = vi.hoisted(() => ({
    app: {
        VrchatWorldGet: vi.fn()
    }
}));

vi.mock('@/platform/tauri/client', () => ({
    tauriClient: tauriMock,
    default: tauriMock
}));

import worldProfileRepository from './worldProfileRepository';

describe('WorldProfileRepository', () => {
    beforeEach(() => {
        for (const command of Object.values(tauriMock.app)) {
            command.mockReset();
            command.mockResolvedValue({
                status: 200,
                data: '{"ok":true}',
                raw: { source: 'rust-api' }
            });
        }
    });

    it('normalizes raw world API data into the shape dialogs and lists consume', () => {
        expect(
            worldProfileRepository.normalize({
                id: ' wrld_123 ',
                name: ' Test World ',
                description: '  A world  ',
                authorId: ' usr_author ',
                authorName: '',
                releaseStatus: '',
                thumbnailImageUrl: ' thumb.png ',
                imageUrl: ' image.png ',
                occupants: '12',
                capacity: '40',
                recommendedCapacity: '24',
                favorites: '100',
                visits: '2000',
                popularity: '7',
                heat: '5',
                tags: [' system_labs ', '', null],
                created_at: '2026-01-01',
                updated_at: '2026-01-02',
                platforms: ['standalonewindows', 'quest'],
                unityPackages: [
                    { platform: 'android' },
                    { platformName: 'ios' },
                    { assetVersion: { platform: 'windows' } }
                ]
            })
        ).toMatchObject({
            id: 'wrld_123',
            name: 'Test World',
            description: 'A world',
            authorId: 'usr_author',
            authorName: 'usr_author',
            releaseStatus: 'unknown',
            thumbnailImageUrl: 'thumb.png',
            imageUrl: 'image.png',
            occupants: 12,
            capacity: 40,
            recommendedCapacity: 24,
            favorites: 100,
            visits: 2000,
            popularity: 7,
            heat: 5,
            tags: ['system_labs'],
            isLabs: true,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-02',
            platforms: ['PC', 'Quest', 'iOS']
        });
    });

    it('throws request errors with status, endpoint, and parsed payload details', async () => {
        tauriMock.app.VrchatWorldGet.mockResolvedValue({
            status: 404,
            data: JSON.stringify({
                error: {
                    message: 'World not found'
                }
            }),
            raw: {}
        });

        await expect(
            worldProfileRepository.getWorldProfile({
                worldId: 'wrld_missing',
                force: true
            })
        ).rejects.toMatchObject({
            message: 'World not found',
            status: 404,
            endpoint: 'worlds/wrld_missing',
            payload: {
                error: {
                    message: 'World not found'
                }
            }
        });
    });
});
