import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const activityPersistenceRepositoryMock = vi.hoisted(() => ({
    ACTIVITY_VIEW_KIND: {
        ACTIVITY: 'activity',
        OVERLAP: 'overlap'
    },
    getActivitySyncState: vi.fn(),
    getActivitySessions: vi.fn(),
    refreshSelfActivitySessions: vi.fn(),
    getActivitySourceSlice: vi.fn(),
    getActivitySourceAfter: vi.fn(),
    getActivityBucketCache: vi.fn(),
    upsertActivityBucketCache: vi.fn(),
    replaceActivitySessions: vi.fn(),
    appendActivitySessions: vi.fn(),
    upsertActivitySyncState: vi.fn()
}));

const gameLogRepositoryMock = vi.hoisted(() => ({
    getMyTopWorlds: vi.fn()
}));

const runActivityWorkerTaskMock = vi.hoisted(() => vi.fn());

vi.mock('@/repositories/activityPersistenceRepository', () => ({
    default: activityPersistenceRepositoryMock
}));

vi.mock('@/repositories/gameLogRepository', () => ({
    default: gameLogRepositoryMock
}));

vi.mock('@/workers/activityWorkerRunner', () => ({
    runActivityWorkerTask: runActivityWorkerTaskMock
}));

import {
    userActivityViewService,
    type UserActivityViewService
} from './userActivityViewService';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

describe('userActivityViewService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        userActivityViewService.invalidateUser('usr_self', 'usr_self');
        activityPersistenceRepositoryMock.getActivitySyncState.mockResolvedValue(
            {
                userId: 'usr_self',
                updatedAt: '2026-01-01T00:00:00.000Z',
                isSelf: true,
                sourceLastCreatedAt: 'cursor_1',
                pendingSessionStartAt: null,
                cachedRangeDays: 30
            }
        );
        activityPersistenceRepositoryMock.getActivitySessions.mockResolvedValue(
            [{ start: 1000, end: 2000, sourceRevision: 'cursor_1' }]
        );
        activityPersistenceRepositoryMock.refreshSelfActivitySessions.mockResolvedValue(
            {
                sync: {
                    userId: 'usr_self',
                    updatedAt: '2026-01-01T00:01:00.000Z',
                    isSelf: true,
                    sourceLastCreatedAt: 'cursor_1',
                    pendingSessionStartAt: null,
                    cachedRangeDays: 30
                },
                sessions: [{ start: 1000, end: 2000 }],
                sourceCount: 0
            }
        );
    });

    it('keeps public view-service methods typed', () => {
        expectTypeOf<UserActivityViewService['loadActivityView']>()
            .parameter(0)
            .not.toBeAny();
        expectTypeOf<UserActivityViewService['loadOverlapView']>()
            .parameter(0)
            .not.toBeAny();
        expectTypeOf<UserActivityViewService['loadTopWorldsView']>()
            .parameter(0)
            .not.toBeAny();
        expectTypeOf<
            UserActivityViewService['getCache']
        >().returns.resolves.toHaveProperty('sessions');
    });

    it('reuses a persisted activity bucket when the cursor still matches', async () => {
        activityPersistenceRepositoryMock.getActivityBucketCache.mockResolvedValue(
            {
                builtFromCursor: 'cursor_1',
                rawBuckets: [0, 5],
                normalizedBuckets: [0, 100],
                summary: {
                    peakDay: 'Mon',
                    peakTime: '12:00',
                    filteredEventCount: 2
                },
                builtAt: '2026-01-01T00:02:00.000Z'
            }
        );

        const view = await userActivityViewService.loadActivityView({
            userId: 'usr_self',
            ownerUserId: 'usr_self',
            isSelf: true,
            rangeDays: 30,
            dayLabels: DAY_LABELS
        });

        expect(view).toEqual({
            hasAnyData: true,
            filteredEventCount: 2,
            peakDay: 'Mon',
            peakTime: '12:00',
            rawBuckets: [0, 5],
            normalizedBuckets: [0, 100]
        });
        expect(runActivityWorkerTaskMock).not.toHaveBeenCalledWith(
            'computeActivityView',
            expect.anything()
        );
    });
});
