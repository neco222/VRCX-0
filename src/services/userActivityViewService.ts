import activityPersistenceRepository from '@/repositories/activityPersistenceRepository';
import gameLogRepository from '@/repositories/gameLogRepository';
import {
    mergeSessions,
    type ActivityNormalizeConfig,
    type ActivitySession,
    type ActivityView,
    type OverlapView
} from '@/shared/utils/activityEngine';
import { runActivityWorkerTask } from '@/workers/activityWorkerRunner';

type UnknownRecord = Record<string, unknown>;

type ActivitySyncState = {
    userId: string;
    updatedAt: string;
    isSelf: boolean;
    sourceLastCreatedAt: string;
    pendingSessionStartAt: string | number | null;
    cachedRangeDays: number;
    ownerUserId: string;
};

type ActivitySnapshot = {
    userId: string;
    isSelf: boolean;
    sync: ActivitySyncState;
    sessions: ActivitySession[];
    activityViews: Map<string, CachedActivityView>;
    overlapViews: Map<string, CachedOverlapView>;
};

type ActivitySourceItem = UnknownRecord & {
    created_at?: unknown;
};

type ActivityRefreshResult = {
    sync?: unknown;
    sessions?: unknown;
    sourceCount?: unknown;
};

type SessionSnapshotWorkerResult = {
    sessions?: unknown;
    pendingSessionStartAt?: unknown;
};

type CachedActivityView = Pick<
    ActivityView,
    | 'rawBuckets'
    | 'normalizedBuckets'
    | 'peakDay'
    | 'peakTime'
    | 'filteredEventCount'
> & {
    builtFromCursor: string;
    builtAt: string;
};

type CachedOverlapView = Pick<
    OverlapView,
    'rawBuckets' | 'normalizedBuckets' | 'overlapPercent' | 'bestOverlapTime'
> & {
    builtFromCursor: string;
    builtAt: string;
};

export type ActivityViewResult = {
    hasAnyData: boolean;
    filteredEventCount: number;
    peakDay: string;
    peakTime: string;
    rawBuckets: number[];
    normalizedBuckets: number[];
};

export type OverlapViewResult = {
    hasOverlapData: boolean;
    overlapPercent: number;
    bestOverlapTime: string;
    rawBuckets: number[];
    normalizedBuckets: number[];
};

export type ActivityCacheSnapshot = {
    userId: string;
    isSelf: boolean;
    updatedAt: string;
    sourceLastCreatedAt: string;
    pendingSessionStartAt: string | number | null;
    cachedRangeDays: number;
    sessions: ActivitySession[];
};

type ExcludeHours = {
    enabled?: boolean;
    startHour?: number;
    endHour?: number;
};

type EnsureSnapshotOptions = {
    isSelf: boolean;
    rangeDays: number;
    forceRefresh?: boolean;
    ownerUserId?: unknown;
};

export type LoadActivityViewInput = {
    userId: unknown;
    ownerUserId?: unknown;
    isSelf?: boolean;
    rangeDays?: number;
    dayLabels: string[];
    forceRefresh?: boolean;
};

export type LoadOverlapViewInput = {
    currentUserId: unknown;
    targetUserId: unknown;
    ownerUserId?: unknown;
    rangeDays?: number;
    dayLabels: string[];
    excludeHours?: ExcludeHours | null;
    forceRefresh?: boolean;
};

export type LoadTopWorldsViewInput = {
    rangeDays?: number;
    limit?: number;
    sortBy?: 'time' | 'count' | string;
    excludeWorldId?: unknown;
};

export type UserActivityViewService = {
    FULL_CACHE_MAX_DAYS: number;
    getCache(
        userId: unknown,
        isSelf?: boolean,
        ownerUserId?: unknown
    ): Promise<ActivityCacheSnapshot>;
    invalidateUser(userId: unknown, ownerUserId?: unknown): void;
    loadActivityView(input: LoadActivityViewInput): Promise<ActivityViewResult>;
    loadOverlapView(input: LoadOverlapViewInput): Promise<OverlapViewResult>;
    loadTopWorldsView(input?: LoadTopWorldsViewInput): Promise<unknown[]>;
};

const snapshotMap = new Map<string, ActivitySnapshot>();
const inFlightJobs = new Map<string, Promise<ActivitySnapshot>>();
const FULL_CACHE_MAX_DAYS = 3650;
const MAX_SNAPSHOT_ENTRIES = 12;
let deferredWriteQueue: Promise<unknown> = Promise.resolve();

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeId(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function normalizeInteger(value: unknown, fallback = 0): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePendingSessionStartAt(
    value: unknown
): string | number | null {
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : null;
}

function isActivitySession(value: unknown): value is ActivitySession {
    if (!isRecord(value)) {
        return false;
    }
    return Number.isFinite(value.start) && Number.isFinite(value.end);
}

function toActivitySessions(value: unknown): ActivitySession[] {
    return Array.isArray(value) ? value.filter(isActivitySession) : [];
}

function toActivitySourceItems(value: unknown): ActivitySourceItem[] {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toNumberBuckets(value: unknown): number[] {
    return Array.isArray(value)
        ? value
              .map((entry) => Number(entry))
              .filter((entry) => Number.isFinite(entry))
        : [];
}

function normalizeSyncState(
    source: unknown,
    fallback: ActivitySyncState
): ActivitySyncState {
    const record = isRecord(source) ? source : {};
    return {
        userId: normalizeId(record.userId ?? record.user_id) || fallback.userId,
        updatedAt: String(
            record.updatedAt ?? record.updated_at ?? fallback.updatedAt ?? ''
        ),
        isSelf:
            typeof record.isSelf === 'boolean'
                ? record.isSelf
                : typeof record.is_self === 'boolean'
                  ? record.is_self
                  : fallback.isSelf,
        sourceLastCreatedAt: String(
            record.sourceLastCreatedAt ??
                record.source_last_created_at ??
                fallback.sourceLastCreatedAt ??
                ''
        ),
        pendingSessionStartAt: normalizePendingSessionStartAt(
            record.pendingSessionStartAt ??
                record.pending_session_start_at ??
                fallback.pendingSessionStartAt
        ),
        cachedRangeDays: normalizeInteger(
            record.cachedRangeDays ?? record.cached_range_days,
            fallback.cachedRangeDays
        ),
        ownerUserId:
            normalizeId(record.ownerUserId ?? record.owner_user_id) ||
            fallback.ownerUserId
    };
}

function normalizeActivityView(
    source: unknown,
    builtFromCursor: unknown,
    builtAt: unknown = new Date().toISOString()
): CachedActivityView {
    const record = isRecord(source) ? source : {};
    return {
        rawBuckets: toNumberBuckets(record.rawBuckets),
        normalizedBuckets: toNumberBuckets(record.normalizedBuckets),
        peakDay: String(record.peakDay ?? ''),
        peakTime: String(record.peakTime ?? ''),
        filteredEventCount: normalizeInteger(record.filteredEventCount),
        builtFromCursor: String(builtFromCursor ?? ''),
        builtAt: String(builtAt || new Date().toISOString())
    };
}

function normalizeOverlapView(
    source: unknown,
    builtFromCursor: unknown,
    builtAt: unknown = new Date().toISOString()
): CachedOverlapView {
    const record = isRecord(source) ? source : {};
    return {
        rawBuckets: toNumberBuckets(record.rawBuckets),
        normalizedBuckets: toNumberBuckets(record.normalizedBuckets),
        overlapPercent: normalizeInteger(record.overlapPercent),
        bestOverlapTime: String(record.bestOverlapTime ?? ''),
        builtFromCursor: String(builtFromCursor ?? ''),
        builtAt: String(builtAt || new Date().toISOString())
    };
}

function normalizePersistedActivityView(
    persisted: unknown
): CachedActivityView {
    const record = isRecord(persisted) ? persisted : {};
    return normalizeActivityView(
        {
            ...(isRecord(record.summary) ? record.summary : {}),
            rawBuckets: record.rawBuckets,
            normalizedBuckets: record.normalizedBuckets
        },
        record.builtFromCursor,
        record.builtAt
    );
}

function normalizePersistedOverlapView(persisted: unknown): CachedOverlapView {
    const record = isRecord(persisted) ? persisted : {};
    return normalizeOverlapView(
        {
            ...(isRecord(record.summary) ? record.summary : {}),
            rawBuckets: record.rawBuckets,
            normalizedBuckets: record.normalizedBuckets
        },
        record.builtFromCursor,
        record.builtAt
    );
}

function deferWrite(task: () => Promise<unknown> | unknown) {
    const run = () => {
        deferredWriteQueue = deferredWriteQueue
            .catch(() => {})
            .then(task)
            .catch((error: unknown) => {
                console.error('[Activity] deferred write failed:', error);
            });
        return deferredWriteQueue;
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run);
        return;
    }
    setTimeout(run, 0);
}

function snapshotKey(
    userId: unknown,
    isSelf: boolean,
    ownerUserId: unknown = ''
) {
    return `${normalizeId(ownerUserId)}:${isSelf ? 'self' : 'friend'}:${normalizeId(userId)}`;
}

function createSnapshot(userId: unknown, isSelf: boolean): ActivitySnapshot {
    const normalizedUserId = normalizeId(userId);
    return {
        userId: normalizedUserId,
        isSelf,
        sync: {
            userId: normalizedUserId,
            updatedAt: '',
            isSelf,
            sourceLastCreatedAt: '',
            pendingSessionStartAt: null,
            cachedRangeDays: 0,
            ownerUserId: ''
        },
        sessions: [] as ActivitySession[],
        activityViews: new Map(),
        overlapViews: new Map()
    };
}

function getSnapshot(
    userId: unknown,
    isSelf: boolean,
    ownerUserId: unknown = ''
): ActivitySnapshot {
    const normalizedUserId = normalizeId(userId);
    const key = snapshotKey(normalizedUserId, isSelf, ownerUserId);
    let snapshot = snapshotMap.get(key);
    if (!snapshot) {
        snapshot = createSnapshot(normalizedUserId, isSelf);
        snapshotMap.set(key, snapshot);
    } else if (typeof isSelf === 'boolean') {
        snapshot.isSelf = isSelf;
        snapshot.sync.isSelf = isSelf;
    }
    snapshot.sync.ownerUserId = String(ownerUserId || '').trim();
    touchSnapshot(key, snapshot);
    pruneSnapshots();
    return snapshot;
}

function touchSnapshot(key: string, snapshot: ActivitySnapshot) {
    snapshotMap.delete(key);
    snapshotMap.set(key, snapshot);
}

function isSnapshotInFlight(key: string) {
    const [ownerUserId, role, userId] = key.split(':');
    const isSelf = role === 'self';
    const jobPrefix = `${ownerUserId || ''}:${userId || ''}:${isSelf}:`;
    for (const jobKey of inFlightJobs.keys()) {
        if (jobKey.startsWith(jobPrefix)) {
            return true;
        }
    }
    return false;
}

function pruneSnapshots() {
    if (snapshotMap.size <= MAX_SNAPSHOT_ENTRIES) {
        return;
    }

    for (const [key] of snapshotMap) {
        if (isSnapshotInFlight(key)) {
            continue;
        }
        snapshotMap.delete(key);
        if (snapshotMap.size <= MAX_SNAPSHOT_ENTRIES) {
            break;
        }
    }
}

function clearDerivedViews(snapshot: ActivitySnapshot) {
    snapshot.activityViews.clear();
    snapshot.overlapViews.clear();
}

function overlapExcludeKey(excludeHours?: ExcludeHours | null) {
    if (!excludeHours?.enabled) {
        return '';
    }
    return `${excludeHours.startHour}-${excludeHours.endHour}`;
}

function pairCursor(leftCursor: unknown, rightCursor: unknown) {
    return `${leftCursor || ''}|${rightCursor || ''}`;
}

async function hydrateSnapshot(
    userId: unknown,
    isSelf: boolean,
    ownerUserId: unknown = ''
): Promise<ActivitySnapshot> {
    const snapshot = getSnapshot(userId, isSelf, ownerUserId);
    if (snapshot.sync.updatedAt || snapshot.sessions.length > 0) {
        return snapshot;
    }

    if (!isSelf) {
        return snapshot;
    }

    const [syncState, sessions] = await Promise.all([
        activityPersistenceRepository.getActivitySyncState(userId),
        activityPersistenceRepository.getActivitySessions(userId)
    ]);

    if (syncState) {
        snapshot.sync = normalizeSyncState(syncState, {
            ...snapshot.sync,
            isSelf: snapshot.isSelf
        });
    }
    if (Array.isArray(sessions) && sessions.length > 0) {
        snapshot.sessions = toActivitySessions(sessions);
    }
    return snapshot;
}

async function fullRefresh(snapshot: ActivitySnapshot, rangeDays: number) {
    if (snapshot.isSelf) {
        const result =
            await activityPersistenceRepository.refreshSelfActivitySessions({
                userId: snapshot.userId,
                mode: 'full',
                rangeDays,
                nowMs: Date.now()
            });
        applySelfRefreshResult(snapshot, result);
        clearDerivedViews(snapshot);
        return;
    }

    const sourceItems = toActivitySourceItems(
        await activityPersistenceRepository.getActivitySourceSlice({
            userId: snapshot.userId,
            ownerUserId: snapshot.sync.ownerUserId || '',
            isSelf: snapshot.isSelf,
            fromDays: rangeDays
        })
    );
    const sourceLastCreatedAt = sourceItems.length
        ? String(sourceItems[sourceItems.length - 1].created_at || '')
        : '';
    const result = (await runActivityWorkerTask('computeSessionsSnapshot', {
        sourceType: 'friend_presence',
        events: sourceItems,
        initialStart: null,
        nowMs: Date.now(),
        mayHaveOpenTail: false,
        sourceRevision: sourceLastCreatedAt
    })) as SessionSnapshotWorkerResult;

    snapshot.sessions = toActivitySessions(result.sessions);
    snapshot.sync = {
        ...snapshot.sync,
        updatedAt: new Date().toISOString(),
        isSelf: snapshot.isSelf,
        sourceLastCreatedAt,
        pendingSessionStartAt: normalizePendingSessionStartAt(
            result.pendingSessionStartAt
        ),
        cachedRangeDays: rangeDays
    };
    clearDerivedViews(snapshot);

    if (snapshot.isSelf) {
        await activityPersistenceRepository.replaceActivitySessions(
            snapshot.userId,
            snapshot.sessions
        );
        await activityPersistenceRepository.upsertActivitySyncState(
            snapshot.sync
        );
    }
}

async function incrementalRefresh(snapshot: ActivitySnapshot) {
    if (!snapshot.sync.sourceLastCreatedAt) {
        return;
    }

    if (snapshot.isSelf) {
        const result =
            await activityPersistenceRepository.refreshSelfActivitySessions({
                userId: snapshot.userId,
                mode: 'incremental',
                nowMs: Date.now()
            });
        const previousCursor = snapshot.sync.sourceLastCreatedAt;
        applySelfRefreshResult(snapshot, result);
        if (
            normalizeInteger(result.sourceCount) > 0 ||
            snapshot.sync.sourceLastCreatedAt !== previousCursor
        ) {
            clearDerivedViews(snapshot);
        }
        return;
    }

    const sourceItems = toActivitySourceItems(
        await activityPersistenceRepository.getActivitySourceAfter({
            userId: snapshot.userId,
            ownerUserId: snapshot.sync.ownerUserId || '',
            isSelf: snapshot.isSelf,
            afterCreatedAt: snapshot.sync.sourceLastCreatedAt,
            inclusive: snapshot.isSelf
        })
    );
    if (sourceItems.length === 0) {
        snapshot.sync.updatedAt = new Date().toISOString();
        if (snapshot.isSelf) {
            await activityPersistenceRepository.upsertActivitySyncState(
                snapshot.sync
            );
        }
        return;
    }

    const sourceLastCreatedAt = String(
        sourceItems[sourceItems.length - 1].created_at || ''
    );
    const result = (await runActivityWorkerTask('computeSessionsSnapshot', {
        sourceType: 'friend_presence',
        events: sourceItems,
        initialStart: snapshot.sync.pendingSessionStartAt,
        nowMs: Date.now(),
        mayHaveOpenTail: false,
        sourceRevision: sourceLastCreatedAt
    })) as SessionSnapshotWorkerResult;

    const replaceFromStartAt = snapshot.sessions.length
        ? snapshot.sessions[Math.max(snapshot.sessions.length - 1, 0)].start
        : null;
    const mergedSessions = mergeSessions(
        snapshot.sessions,
        toActivitySessions(result.sessions)
    );
    snapshot.sessions = mergedSessions;
    snapshot.sync = {
        ...snapshot.sync,
        updatedAt: new Date().toISOString(),
        sourceLastCreatedAt,
        pendingSessionStartAt: normalizePendingSessionStartAt(
            result.pendingSessionStartAt
        )
    };
    clearDerivedViews(snapshot);

    if (snapshot.isSelf) {
        await activityPersistenceRepository.appendActivitySessions({
            userId: snapshot.userId,
            sessions:
                replaceFromStartAt === null
                    ? mergedSessions
                    : mergedSessions.filter(
                          (session) => session.start >= replaceFromStartAt
                      ),
            replaceFromStartAt
        });
        await activityPersistenceRepository.upsertActivitySyncState(
            snapshot.sync
        );
    }
}

async function expandRange(snapshot: ActivitySnapshot, rangeDays: number) {
    const currentDays = snapshot.sync.cachedRangeDays || 0;
    if (rangeDays <= currentDays) {
        return;
    }

    if (snapshot.isSelf) {
        const result =
            await activityPersistenceRepository.refreshSelfActivitySessions({
                userId: snapshot.userId,
                mode: 'expand',
                rangeDays,
                nowMs: Date.now()
            });
        applySelfRefreshResult(snapshot, result);
        clearDerivedViews(snapshot);
        return;
    }

    const sourceItems = toActivitySourceItems(
        await activityPersistenceRepository.getActivitySourceSlice({
            userId: snapshot.userId,
            ownerUserId: snapshot.sync.ownerUserId || '',
            isSelf: snapshot.isSelf,
            fromDays: rangeDays,
            toDays: currentDays
        })
    );
    const result = (await runActivityWorkerTask('computeSessionsSnapshot', {
        sourceType: 'friend_presence',
        events: sourceItems,
        initialStart: null,
        nowMs: Date.now(),
        mayHaveOpenTail: false,
        sourceRevision: snapshot.sync.sourceLastCreatedAt
    })) as SessionSnapshotWorkerResult;

    const expandedSessions = toActivitySessions(result.sessions);
    if (expandedSessions.length > 0) {
        snapshot.sessions = mergeSessions(expandedSessions, snapshot.sessions);
        if (snapshot.isSelf) {
            await activityPersistenceRepository.replaceActivitySessions(
                snapshot.userId,
                snapshot.sessions
            );
        }
    }
    snapshot.sync.cachedRangeDays = rangeDays;
    snapshot.sync.updatedAt = new Date().toISOString();
    clearDerivedViews(snapshot);
    if (snapshot.isSelf) {
        await activityPersistenceRepository.upsertActivitySyncState(
            snapshot.sync
        );
    }
}

function applySelfRefreshResult(
    snapshot: ActivitySnapshot,
    result: ActivityRefreshResult
) {
    snapshot.sessions = Array.isArray(result?.sessions)
        ? (result.sessions as ActivitySession[])
        : [];
    snapshot.sync = {
        ...snapshot.sync,
        ...((result?.sync as Record<string, unknown>) || {})
    } as ActivitySyncState;
}

async function ensureSnapshot(
    userId: unknown,
    {
        isSelf,
        rangeDays,
        forceRefresh = false,
        ownerUserId = ''
    }: EnsureSnapshotOptions
): Promise<ActivitySnapshot> {
    const jobKey = `${ownerUserId}:${userId}:${isSelf}:${rangeDays}:${forceRefresh ? 'force' : 'normal'}`;
    const existingJob = inFlightJobs.get(jobKey);
    if (existingJob) {
        return existingJob;
    }

    const job = (async () => {
        const snapshot = await hydrateSnapshot(userId, isSelf, ownerUserId);
        if (
            forceRefresh ||
            !snapshot.sync.updatedAt ||
            !snapshot.sync.sourceLastCreatedAt
        ) {
            await fullRefresh(snapshot, rangeDays);
        } else {
            await incrementalRefresh(snapshot);
            if (rangeDays > snapshot.sync.cachedRangeDays) {
                await expandRange(snapshot, rangeDays);
            }
        }
        return snapshot;
    })().finally(() => {
        inFlightJobs.delete(jobKey);
    });

    inFlightJobs.set(jobKey, job);
    return job;
}

function pickActivityNormalizeConfig(
    isSelf: boolean,
    rangeDays: number
): ActivityNormalizeConfig {
    const common: Record<number, ActivityNormalizeConfig> = {
        7: {
            floorPercentile: 10,
            capPercentile: 80,
            rankWeight: 0.15,
            targetCoverage: 0.12,
            targetVolume: 40
        },
        30: {
            floorPercentile: 15,
            capPercentile: 85,
            rankWeight: 0.2,
            targetCoverage: 0.25,
            targetVolume: 60
        },
        90: {
            floorPercentile: 15,
            capPercentile: 85,
            rankWeight: 0.2,
            targetCoverage: 0.3,
            targetVolume: 50
        }
    };
    return (
        common[rangeDays] || {
            floorPercentile: 15,
            capPercentile: 85,
            rankWeight: 0.2,
            targetCoverage: isSelf ? 0.25 : 0.2,
            targetVolume: isSelf ? 60 : 35
        }
    );
}

function pickOverlapNormalizeConfig(
    rangeDays: number
): ActivityNormalizeConfig {
    return (
        (
            {
                7: {
                    floorPercentile: 10,
                    capPercentile: 80,
                    rankWeight: 0.15,
                    targetCoverage: 0.08,
                    targetVolume: 15
                },
                30: {
                    floorPercentile: 15,
                    capPercentile: 85,
                    rankWeight: 0.2,
                    targetCoverage: 0.15,
                    targetVolume: 25
                },
                90: {
                    floorPercentile: 15,
                    capPercentile: 85,
                    rankWeight: 0.2,
                    targetCoverage: 0.18,
                    targetVolume: 20
                }
            } satisfies Record<number, ActivityNormalizeConfig>
        )[rangeDays] || {
            floorPercentile: 15,
            capPercentile: 85,
            rankWeight: 0.2,
            targetCoverage: 0.15,
            targetVolume: 25
        }
    );
}

async function getCache(
    userId: unknown,
    isSelf = false,
    ownerUserId: unknown = ''
): Promise<ActivityCacheSnapshot> {
    const snapshot = await hydrateSnapshot(userId, isSelf, ownerUserId);
    return {
        userId: snapshot.userId,
        isSelf: snapshot.isSelf,
        updatedAt: snapshot.sync.updatedAt,
        sourceLastCreatedAt: snapshot.sync.sourceLastCreatedAt,
        pendingSessionStartAt: snapshot.sync.pendingSessionStartAt,
        cachedRangeDays: snapshot.sync.cachedRangeDays,
        sessions: snapshot.sessions
    };
}

async function loadActivityView({
    userId,
    ownerUserId = '',
    isSelf = false,
    rangeDays = 30,
    dayLabels,
    forceRefresh = false
}: LoadActivityViewInput): Promise<ActivityViewResult> {
    const snapshot = await ensureSnapshot(userId, {
        isSelf,
        rangeDays,
        forceRefresh,
        ownerUserId
    });
    const cacheOwnerUserId = normalizeId(ownerUserId) || normalizeId(userId);
    const cacheTargetUserId = isSelf ? '' : normalizeId(userId);
    const cacheKey = String(rangeDays);
    const currentCursor = snapshot.sync.sourceLastCreatedAt || '';
    let view = snapshot.activityViews.get(cacheKey);

    if (!forceRefresh && view?.builtFromCursor === currentCursor) {
        return {
            hasAnyData: snapshot.sessions.length > 0,
            filteredEventCount: view.filteredEventCount,
            peakDay: view.peakDay,
            peakTime: view.peakTime,
            rawBuckets: view.rawBuckets,
            normalizedBuckets: view.normalizedBuckets
        };
    }

    if (!forceRefresh && cacheOwnerUserId) {
        const persisted =
            await activityPersistenceRepository.getActivityBucketCache({
                ownerUserId: cacheOwnerUserId,
                targetUserId: cacheTargetUserId,
                rangeDays,
                viewKind:
                    activityPersistenceRepository.ACTIVITY_VIEW_KIND.ACTIVITY
            });
        if (persisted?.builtFromCursor === currentCursor) {
            view = normalizePersistedActivityView(persisted);
            snapshot.activityViews.set(cacheKey, view);
            return {
                hasAnyData: snapshot.sessions.length > 0,
                filteredEventCount: view.filteredEventCount,
                peakDay: view.peakDay,
                peakTime: view.peakTime,
                rawBuckets: view.rawBuckets,
                normalizedBuckets: view.normalizedBuckets
            };
        }
    }

    const computed = await runActivityWorkerTask('computeActivityView', {
        sessions: snapshot.sessions,
        dayLabels,
        rangeDays,
        normalizeConfig: pickActivityNormalizeConfig(isSelf, rangeDays)
    });
    view = normalizeActivityView(computed, currentCursor);
    snapshot.activityViews.set(cacheKey, view);
    if (cacheOwnerUserId) {
        deferWrite(() =>
            activityPersistenceRepository.upsertActivityBucketCache({
                ownerUserId: cacheOwnerUserId,
                targetUserId: cacheTargetUserId,
                rangeDays,
                viewKind:
                    activityPersistenceRepository.ACTIVITY_VIEW_KIND.ACTIVITY,
                builtFromCursor: currentCursor,
                rawBuckets: view.rawBuckets,
                normalizedBuckets: view.normalizedBuckets,
                summary: {
                    peakDay: view.peakDay,
                    peakTime: view.peakTime,
                    filteredEventCount: view.filteredEventCount
                },
                builtAt: view.builtAt
            })
        );
    }

    return {
        hasAnyData: snapshot.sessions.length > 0,
        filteredEventCount: view.filteredEventCount,
        peakDay: view.peakDay,
        peakTime: view.peakTime,
        rawBuckets: view.rawBuckets,
        normalizedBuckets: view.normalizedBuckets
    };
}

async function loadOverlapView({
    currentUserId,
    targetUserId,
    ownerUserId = currentUserId,
    rangeDays = 30,
    dayLabels,
    excludeHours,
    forceRefresh = false
}: LoadOverlapViewInput): Promise<OverlapViewResult> {
    const [selfSnapshot, targetSnapshot] = await Promise.all([
        ensureSnapshot(currentUserId, {
            isSelf: true,
            rangeDays,
            forceRefresh,
            ownerUserId
        }),
        ensureSnapshot(targetUserId, {
            isSelf: false,
            rangeDays,
            forceRefresh,
            ownerUserId
        })
    ]);
    const normalizedOwnerUserId = normalizeId(ownerUserId);
    const normalizedTargetUserId = normalizeId(targetUserId);
    const excludeKey = overlapExcludeKey(excludeHours);
    const cacheKey = `${normalizedTargetUserId}:${rangeDays}:${excludeKey}`;
    const cursor = pairCursor(
        selfSnapshot.sync.sourceLastCreatedAt,
        targetSnapshot.sync.sourceLastCreatedAt
    );
    let view = targetSnapshot.overlapViews.get(cacheKey);

    if (!forceRefresh && view?.builtFromCursor === cursor) {
        return {
            hasOverlapData: view.rawBuckets.some((value) => value > 0),
            overlapPercent: view.overlapPercent,
            bestOverlapTime: view.bestOverlapTime,
            rawBuckets: view.rawBuckets,
            normalizedBuckets: view.normalizedBuckets
        };
    }

    if (!forceRefresh && normalizedOwnerUserId) {
        const persisted =
            await activityPersistenceRepository.getActivityBucketCache({
                ownerUserId: normalizedOwnerUserId,
                targetUserId: normalizedTargetUserId,
                rangeDays,
                viewKind:
                    activityPersistenceRepository.ACTIVITY_VIEW_KIND.OVERLAP,
                excludeKey
            });
        if (persisted?.builtFromCursor === cursor) {
            view = normalizePersistedOverlapView(persisted);
            targetSnapshot.overlapViews.set(cacheKey, view);
            return {
                hasOverlapData: view.rawBuckets.some((value) => value > 0),
                overlapPercent: view.overlapPercent,
                bestOverlapTime: view.bestOverlapTime,
                rawBuckets: view.rawBuckets,
                normalizedBuckets: view.normalizedBuckets
            };
        }
    }

    view = normalizeOverlapView(
        await runActivityWorkerTask('computeOverlapView', {
            selfSessions: selfSnapshot.sessions,
            targetSessions: targetSnapshot.sessions,
            dayLabels,
            rangeDays,
            excludeHours: excludeHours?.enabled ? excludeHours : null,
            normalizeConfig: pickOverlapNormalizeConfig(rangeDays)
        }),
        cursor
    );
    targetSnapshot.overlapViews.set(cacheKey, view);
    if (normalizedOwnerUserId) {
        deferWrite(() =>
            activityPersistenceRepository.upsertActivityBucketCache({
                ownerUserId: normalizedOwnerUserId,
                targetUserId: normalizedTargetUserId,
                rangeDays,
                viewKind:
                    activityPersistenceRepository.ACTIVITY_VIEW_KIND.OVERLAP,
                excludeKey,
                builtFromCursor: cursor,
                rawBuckets: view.rawBuckets,
                normalizedBuckets: view.normalizedBuckets,
                summary: {
                    overlapPercent: view.overlapPercent,
                    bestOverlapTime: view.bestOverlapTime
                },
                builtAt: view.builtAt
            })
        );
    }

    return {
        hasOverlapData: view.rawBuckets.some((value) => value > 0),
        overlapPercent: view.overlapPercent,
        bestOverlapTime: view.bestOverlapTime,
        rawBuckets: view.rawBuckets,
        normalizedBuckets: view.normalizedBuckets
    };
}

async function loadTopWorldsView({
    rangeDays = 30,
    limit = 5,
    sortBy = 'time',
    excludeWorldId = ''
}: LoadTopWorldsViewInput = {}): Promise<unknown[]> {
    return gameLogRepository.getMyTopWorlds(
        rangeDays,
        limit,
        sortBy,
        excludeWorldId
    );
}

function invalidateUser(userId: unknown, ownerUserId: unknown = '') {
    const normalizedUserId = normalizeId(userId);
    const normalizedOwnerUserId = normalizeId(ownerUserId);
    for (const key of snapshotMap.keys()) {
        if (
            key.endsWith(`:${normalizedUserId}`) &&
            (!normalizedOwnerUserId ||
                key.startsWith(`${normalizedOwnerUserId}:`))
        ) {
            snapshotMap.delete(key);
        }
    }
}

const userActivityViewService: UserActivityViewService = {
    FULL_CACHE_MAX_DAYS,
    getCache,
    invalidateUser,
    loadActivityView,
    loadOverlapView,
    loadTopWorldsView
};

export { userActivityViewService };
