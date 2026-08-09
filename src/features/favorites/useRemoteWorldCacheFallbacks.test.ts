import { beforeEach, describe, expect, it, vi } from 'vitest';

import favoritePersistenceRepository, {
    type FavoriteCacheEntity
} from '@/repositories/favoritePersistenceRepository';

import {
    filterRemoteWorldCacheFallbacksById,
    getRemoteWorldCacheFallbackIds,
    loadRemoteWorldCacheFallbacksById
} from './useRemoteWorldCacheFallbacks';

vi.mock('@/repositories/favoritePersistenceRepository', () => ({
    default: {
        getCachedWorldById: vi.fn()
    }
}));

function cachedWorld(
    id: string,
    name: string,
    releaseStatus = 'private'
): FavoriteCacheEntity {
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

function emptyWorld(id: string): FavoriteCacheEntity {
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

describe('useRemoteWorldCacheFallbacks helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('only asks the DB for remote favorite worlds with no displayable detail source', async () => {
        const fallbackIds = getRemoteWorldCacheFallbackIds({
            favoriteWorldIds: [
                'wrld_remote',
                'wrld_fact',
                'wrld_local',
                'wrld_missing'
            ],
            kind: 'world',
            localWorldDetailsById: {
                wrld_local: { name: 'Local Baseline World' }
            },
            remoteEntityDetailsData: {
                wrld_remote: { name: 'Remote World' }
            },
            remoteEntityDetailsStatus: 'ready',
            worldFactsById: {
                wrld_fact: { name: 'World Fact' }
            }
        });

        vi.mocked(
            favoritePersistenceRepository.getCachedWorldById
        ).mockResolvedValue(cachedWorld('wrld_missing', 'DB Missing World'));

        const fallbacks = await loadRemoteWorldCacheFallbacksById(fallbackIds);

        expect(fallbackIds).toEqual(['wrld_missing']);
        expect(
            favoritePersistenceRepository.getCachedWorldById
        ).toHaveBeenCalledTimes(1);
        expect(
            favoritePersistenceRepository.getCachedWorldById
        ).toHaveBeenCalledWith('wrld_missing');
        expect(fallbacks).toMatchObject({
            wrld_missing: {
                name: 'DB Missing World',
                releaseStatus: 'private'
            }
        });
    });

    it('ignores empty cache shells returned from cache_world', async () => {
        vi.mocked(
            favoritePersistenceRepository.getCachedWorldById
        ).mockImplementation(async (worldId) => {
            if (worldId === 'wrld_cached') {
                return cachedWorld('wrld_cached', 'Cached World', 'public');
            }
            if (worldId === 'wrld_shell') {
                return emptyWorld('wrld_shell');
            }
            return null;
        });

        const fallbacks = await loadRemoteWorldCacheFallbacksById([
            'wrld_cached',
            'wrld_shell',
            'wrld_missing'
        ]);

        expect(fallbacks).toMatchObject({
            wrld_cached: {
                name: 'Cached World',
                releaseStatus: 'public'
            }
        });
        expect(fallbacks).not.toHaveProperty('wrld_shell');
        expect(fallbacks).not.toHaveProperty('wrld_missing');
    });

    it('filters stale fallback rows when the current favorite ids change', () => {
        const fallbacks = filterRemoteWorldCacheFallbacksById(
            {
                wrld_old: cachedWorld('wrld_old', 'Old World'),
                wrld_new: cachedWorld('wrld_new', 'New World')
            },
            ['wrld_new']
        );

        expect(fallbacks).toMatchObject({
            wrld_new: {
                name: 'New World'
            }
        });
        expect(fallbacks).not.toHaveProperty('wrld_old');
    });

    it('does not search cache_world before remote world details are ready', () => {
        expect(
            getRemoteWorldCacheFallbackIds({
                favoriteWorldIds: ['wrld_pending'],
                kind: 'world',
                remoteEntityDetailsStatus: 'running'
            })
        ).toEqual([]);
    });
});
