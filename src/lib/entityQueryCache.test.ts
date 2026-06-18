import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import {
    clearEntityQueryCache,
    entityQueryPolicies,
    fetchWithEntityPolicy,
    getEntityQueryCacheStats,
    queryKeys,
    setCachedQueryData
} from '@/lib/entityQueryCache';

describe('entityQueryCache', () => {
    afterEach(async () => {
        await clearEntityQueryCache();
    });

    it('builds stable query keys with sorted params and normalized endpoints', () => {
        expect(
            queryKeys.worldsByUser(
                {
                    userId: 'usr_123',
                    offset: 100,
                    n: 50,
                    releaseStatus: undefined
                },
                'https://api.example.test///'
            )
        ).toEqual([
            'worlds',
            'user',
            'usr_123',
            {
                n: 50,
                offset: 100,
                userId: 'usr_123'
            },
            {
                endpoint: 'https://api.example.test'
            }
        ]);

        expect(
            queryKeys.worldPersistData({
                worldId: 'wrld_123',
                userId: 'usr_123'
            })
        ).toEqual(['world', 'wrld_123', 'persistData', 'usr_123']);
    });

    it('reports entity cache stats only for recognized entity ids', () => {
        setCachedQueryData(queryKeys.user('usr_1'), {});
        setCachedQueryData(queryKeys.user('not-a-user'), {});
        setCachedQueryData(queryKeys.world('wrld_1'), {});
        setCachedQueryData(queryKeys.avatar('avtr_1'), {});
        setCachedQueryData(queryKeys.group('grp_1'), {});
        setCachedQueryData(['misc', 'usr_2'], {});

        expect(getEntityQueryCacheStats()).toEqual({
            users: 1,
            worlds: 1,
            avatars: 1,
            groups: 1
        });
    });

    it('preserves typed cached fetch results through the entity policy helper', async () => {
        const result = await fetchWithEntityPolicy({
            queryKey: queryKeys.user('usr_1'),
            policy: entityQueryPolicies.avatar,
            queryFn: () => ({ id: 'usr_1', displayName: 'Example' })
        });

        expectTypeOf(result.data).toEqualTypeOf<{
            id: string;
            displayName: string;
        }>();
        expect(result).toEqual({
            data: {
                id: 'usr_1',
                displayName: 'Example'
            },
            cache: false
        });
    });
});
