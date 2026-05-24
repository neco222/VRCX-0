import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import feedRepository from '@/repositories/feedRepository';
import type { FeedCursor } from '@/repositories/feedPersistenceRepository';
import { useFavoriteStore } from '@/state/favoriteStore';
import { useFeedLiveStore } from '@/state/feedLiveStore';
import { useRuntimeStore } from '@/state/runtimeStore';
import { useSessionStore } from '@/state/sessionStore';

import {
    buildFeedColumnExcludedFavoriteIds,
    buildFeedColumnFavoriteIds
} from '../feedColumnScope';
import type { FeedColumnConfig } from '../feedColumnsState';
import { getFeedRowId, normalizeFeedId as normalizeId } from '../feedRows';
import type { FeedLoadStatus, FeedRow } from '../feedTypes';

const FEED_COLUMN_PAGE_SIZE = 80;

export function resolveFeedColumnInitialLiveSequence(value: unknown) {
    const sequence = Number(value);
    return Number.isFinite(sequence) && sequence > 0 ? sequence : 0;
}

function resolveFeedCursor(row: FeedRow): FeedCursor | null {
    const createdAt = normalizeId(row?.created_at || row?.createdAt);
    const sourceRank = Number(row?.sourceRank ?? row?.source_rank);
    const rowId = Number(row?.rowId ?? row?.row_id);
    if (!createdAt || !Number.isFinite(sourceRank) || !Number.isFinite(rowId)) {
        return null;
    }
    return {
        createdAt,
        sourceRank,
        rowId
    };
}

function appendUniqueRows(currentRows: FeedRow[], nextRows: FeedRow[]) {
    const seen = new Set(currentRows.map(getFeedRowId));
    const output = [...currentRows];
    for (const row of nextRows) {
        const key = getFeedRowId(row);
        if (!seen.has(key)) {
            seen.add(key);
            output.push(row);
        }
    }
    return output;
}

export function useFeedColumnRows(column: FeedColumnConfig) {
    const currentUserId = useRuntimeStore(
        (state: any) => state.auth.currentUserId
    );
    const isFavoritesLoaded = useSessionStore(
        (state: any) => state.isFavoritesLoaded
    );
    const remoteFavoritesById = useFavoriteStore(
        (state: any) => state.remoteFavoritesById
    );
    const localFriendFavorites = useFavoriteStore(
        (state: any) => state.localFriendFavorites
    );
    const liveVersion = useFeedLiveStore((state: any) => state.version);
    const [rows, setRows] = useState<FeedRow[]>([]);
    const [loadStatus, setLoadStatus] = useState<FeedLoadStatus>('idle');
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const cursorRef = useRef<FeedCursor | null>(null);
    const requestIdRef = useRef(0);
    const liveMergeRequestIdRef = useRef(0);
    const liveSequenceRef = useRef(0);
    const rowsRef = useRef(rows);

    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    const favoriteUserIds = useMemo(
        () =>
            Array.from(
                buildFeedColumnFavoriteIds({
                    column,
                    localFriendFavorites,
                    remoteFavoritesById
                })
            ),
        [column, localFriendFavorites, remoteFavoritesById]
    );
    const excludedFavoriteUserIds = useMemo(
        () =>
            Array.from(
                buildFeedColumnExcludedFavoriteIds({
                    column,
                    localFriendFavorites,
                    remoteFavoritesById
                })
            ),
        [column, localFriendFavorites, remoteFavoritesById]
    );
    const excludedGroupKeys = column.friendScope.excludedFavoriteGroupKeys;
    const excludesFavoriteGroups = Boolean(
        excludedGroupKeys === 'all' ||
            (Array.isArray(excludedGroupKeys) && excludedGroupKeys.length)
    );

    const favoritesReady =
        (column.friendScope.kind !== 'favorites' && !excludesFavoriteGroups) ||
        isFavoritesLoaded;
    const scopeHasRows =
        column.friendScope.kind !== 'favorites' || favoriteUserIds.length > 0;
    const queryKey = useMemo(
        () =>
            JSON.stringify({
                columnId: column.id,
                currentUserId: normalizeId(currentUserId),
                excludedFavoriteUserIds,
                favoriteUserIds,
                feedTypes: column.feedTypes,
                scope: column.friendScope
            }),
        [column, currentUserId, excludedFavoriteUserIds, favoriteUserIds]
    );

    const mergeWithLiveRows = useCallback(
        async ({
            minLiveSequence,
            requestIsCurrent,
            rows
        }: {
            minLiveSequence: number;
            requestIsCurrent(): boolean;
            rows: FeedRow[];
        }) => {
            const liveSnapshot = useFeedLiveStore.getState();
            const maxRows = Math.max(
                rows.length + liveSnapshot.entries.length,
                rows.length + FEED_COLUMN_PAGE_SIZE
            );
            const result = await feedRepository.mergeLiveRows({
                rows,
                userId: currentUserId,
                filters: column.feedTypes,
                excludedFavoriteUserIds,
                favoriteUserIds,
                liveEntries: liveSnapshot.entries,
                minLiveSequence,
                favoritesOnly: column.friendScope.kind === 'favorites',
                maxRows
            });
            if (!requestIsCurrent()) {
                return null;
            }
            return result as { rows: FeedRow[]; maxSequence: number };
        },
        [
            column.feedTypes,
            column.friendScope.kind,
            currentUserId,
            excludedFavoriteUserIds,
            favoriteUserIds
        ]
    );

    useEffect(() => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        liveMergeRequestIdRef.current += 1;
        cursorRef.current = null;
        liveSequenceRef.current = 0;
        setRows([]);
        setHasMore(true);

        if (!normalizeId(currentUserId) || !favoritesReady) {
            setLoadStatus('idle');
            return;
        }
        if (!scopeHasRows) {
            setLoadStatus('ready');
            setHasMore(false);
            return;
        }

        setLoadStatus('running');
        const liveFeedSequenceAtRequestStart =
            resolveFeedColumnInitialLiveSequence(
                useFeedLiveStore.getState().version
            );
        liveSequenceRef.current = liveFeedSequenceAtRequestStart;
        const requestIsCurrent = () => requestIdRef.current === requestId;

        feedRepository
            .queryFeedPage({
                userId: currentUserId,
                filters: column.feedTypes,
                excludedFavoriteUserIds,
                favoriteUserIds,
                maxEntries: FEED_COLUMN_PAGE_SIZE
            })
            .then(async (dbRows: unknown) => {
                if (!requestIsCurrent()) {
                    return;
                }
                const pageRows = Array.isArray(dbRows) ? (dbRows as FeedRow[]) : [];
                cursorRef.current = resolveFeedCursor(
                    pageRows[pageRows.length - 1] as FeedRow
                );
                setHasMore(pageRows.length >= FEED_COLUMN_PAGE_SIZE);
                const merged = await mergeWithLiveRows({
                    minLiveSequence: liveFeedSequenceAtRequestStart,
                    requestIsCurrent,
                    rows: pageRows
                });
                if (!merged) {
                    return;
                }
                liveSequenceRef.current = Math.max(
                    merged.maxSequence,
                    liveFeedSequenceAtRequestStart
                );
                setRows(merged.rows);
                setLoadStatus('ready');
            })
            .catch(() => {
                if (requestIsCurrent()) {
                    setLoadStatus('error');
                    setHasMore(false);
                }
            });
    }, [
        column.feedTypes,
        currentUserId,
        excludedFavoriteUserIds,
        favoriteUserIds,
        favoritesReady,
        mergeWithLiveRows,
        queryKey,
        scopeHasRows
    ]);

    useEffect(() => {
        if (
            loadStatus !== 'ready' ||
            liveVersion <= liveSequenceRef.current ||
            !normalizeId(currentUserId)
        ) {
            return;
        }
        const requestId = requestIdRef.current;
        const mergeRequestId = liveMergeRequestIdRef.current + 1;
        liveMergeRequestIdRef.current = mergeRequestId;
        const requestIsCurrent = () =>
            requestIdRef.current === requestId &&
            liveMergeRequestIdRef.current === mergeRequestId;
        mergeWithLiveRows({
            minLiveSequence: liveSequenceRef.current,
            requestIsCurrent,
            rows: rowsRef.current
        }).then((merged) => {
            if (!merged) {
                return;
            }
            if (!requestIsCurrent()) {
                return;
            }
            liveSequenceRef.current = merged.maxSequence;
            setRows(merged.rows);
        });
    }, [currentUserId, liveVersion, loadStatus, mergeWithLiveRows]);

    const loadOlder = useCallback(() => {
        const cursor = cursorRef.current;
        if (
            loadingOlder ||
            loadStatus !== 'ready' ||
            !hasMore ||
            !cursor ||
            !normalizeId(currentUserId)
        ) {
            return;
        }
        const requestId = requestIdRef.current;
        setLoadingOlder(true);
        feedRepository
            .queryFeedPage({
                userId: currentUserId,
                filters: column.feedTypes,
                excludedFavoriteUserIds,
                favoriteUserIds,
                maxEntries: FEED_COLUMN_PAGE_SIZE,
                cursor
            })
            .then((dbRows: unknown) => {
                if (requestIdRef.current !== requestId) {
                    return;
                }
                const pageRows = Array.isArray(dbRows) ? (dbRows as FeedRow[]) : [];
                cursorRef.current = resolveFeedCursor(
                    pageRows[pageRows.length - 1] as FeedRow
                );
                setHasMore(pageRows.length >= FEED_COLUMN_PAGE_SIZE);
                setRows((currentRows) => appendUniqueRows(currentRows, pageRows));
            })
            .catch(() => {
                if (requestIdRef.current === requestId) {
                    setHasMore(false);
                }
            })
            .finally(() => {
                if (requestIdRef.current === requestId) {
                    setLoadingOlder(false);
                }
            });
    }, [
        column.feedTypes,
        currentUserId,
        excludedFavoriteUserIds,
        favoriteUserIds,
        hasMore,
        loadingOlder,
        loadStatus
    ]);

    return {
        hasMore,
        loadOlder,
        loadingOlder,
        loadStatus,
        rows
    };
}
