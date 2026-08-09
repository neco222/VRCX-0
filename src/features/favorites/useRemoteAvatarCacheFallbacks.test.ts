import { beforeEach, describe, expect, it, vi } from 'vitest';

import avatarCacheRepository from '@/repositories/avatarCacheRepository';

import {
    filterRemoteAvatarCacheFallbacksById,
    getRemoteAvatarCacheFallbackIds,
    loadRemoteAvatarCacheFallbacksById
} from './useRemoteAvatarCacheFallbacks';

vi.mock('@/repositories/avatarCacheRepository', () => ({
    default: {
        getCachedAvatarById: vi.fn()
    }
}));

function cachedAvatar(id: string, name: string, releaseStatus = 'private') {
    return {
        id,
        authorId: 'usr_author',
        authorName: 'Cache Author',
        created_at: '2026-06-01T00:00:00.000Z',
        description: 'Cached description',
        imageUrl: 'https://example.test/image.png',
        name,
        releaseStatus,
        thumbnailImageUrl: 'https://example.test/thumb.png',
        updated_at: '2026-06-02T00:00:00.000Z',
        version: 1
    };
}

function emptyAvatar(id: string) {
    return {
        id,
        authorId: '',
        authorName: '',
        created_at: '',
        description: '',
        imageUrl: '',
        name: '',
        releaseStatus: '',
        thumbnailImageUrl: '',
        updated_at: '',
        version: 0
    };
}

describe('useRemoteAvatarCacheFallbacks helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('only asks the DB for remote favorite avatars with no displayable detail source', async () => {
        const fallbackIds = getRemoteAvatarCacheFallbackIds({
            favoriteAvatarIds: ['avtr_remote', 'avtr_local', 'avtr_missing'],
            kind: 'avatar',
            localAvatarDetailsById: {
                avtr_local: { name: 'Local Baseline Avatar' }
            },
            remoteEntityDetailsData: {
                avtr_remote: { name: 'Remote Avatar' }
            },
            remoteEntityDetailsStatus: 'ready'
        });

        vi.mocked(avatarCacheRepository.getCachedAvatarById).mockResolvedValue(
            cachedAvatar('avtr_missing', 'DB Missing Avatar')
        );

        const fallbacks = await loadRemoteAvatarCacheFallbacksById(fallbackIds);

        expect(fallbackIds).toEqual(['avtr_missing']);
        expect(avatarCacheRepository.getCachedAvatarById).toHaveBeenCalledTimes(
            1
        );
        expect(avatarCacheRepository.getCachedAvatarById).toHaveBeenCalledWith(
            'avtr_missing'
        );
        expect(fallbacks).toMatchObject({
            avtr_missing: {
                name: 'DB Missing Avatar',
                releaseStatus: 'private'
            }
        });
    });

    it('ignores empty cache shells returned from avatar_cache', async () => {
        vi.mocked(avatarCacheRepository.getCachedAvatarById).mockImplementation(
            async (avatarId) => {
                if (avatarId === 'avtr_cached') {
                    return cachedAvatar(
                        'avtr_cached',
                        'Cached Avatar',
                        'public'
                    );
                }
                if (avatarId === 'avtr_shell') {
                    return emptyAvatar('avtr_shell');
                }
                return null;
            }
        );

        const fallbacks = await loadRemoteAvatarCacheFallbacksById([
            'avtr_cached',
            'avtr_shell',
            'avtr_missing'
        ]);

        expect(fallbacks).toMatchObject({
            avtr_cached: {
                name: 'Cached Avatar',
                releaseStatus: 'public'
            }
        });
        expect(fallbacks).not.toHaveProperty('avtr_shell');
        expect(fallbacks).not.toHaveProperty('avtr_missing');
    });

    it('filters stale fallback rows when the current favorite ids change', () => {
        const fallbacks = filterRemoteAvatarCacheFallbacksById(
            {
                avtr_old: cachedAvatar('avtr_old', 'Old Avatar'),
                avtr_new: cachedAvatar('avtr_new', 'New Avatar')
            },
            ['avtr_new']
        );

        expect(fallbacks).toMatchObject({
            avtr_new: {
                name: 'New Avatar'
            }
        });
        expect(fallbacks).not.toHaveProperty('avtr_old');
    });

    it('does not search avatar_cache before remote avatar details are ready', () => {
        expect(
            getRemoteAvatarCacheFallbackIds({
                favoriteAvatarIds: ['avtr_pending'],
                kind: 'avatar',
                remoteEntityDetailsStatus: 'running'
            })
        ).toEqual([]);
    });
});
