import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
    cancelMutualGraphFetch,
    refreshMutualGraphFetchStatus,
    startMutualGraphFetch,
    startMutualGraphFetchStatusPolling
} from '@/services/mutualGraphFetchService';
import { useRuntimeStore } from '@/state/runtimeStore';

export function useMutualFriendsGraphFetch({
    currentUserId,
    currentUserEndpoint = '',
    friendsById,
    orderedFriendIds,
    reloadSnapshot,
    setDetail
}: any) {
    const { t } = useTranslation();
    const startedRunIdsRef = useRef(new Set<number>());
    const lastHandledRunRef = useRef(0);
    const statusRunId = useRuntimeStore((state: any) => state.mutualGraph.runId);
    const statusName = useRuntimeStore(
        (state: any) => state.mutualGraph.status
    );
    const statusOwnerUserId = useRuntimeStore(
        (state: any) => state.mutualGraph.ownerUserId
    );
    const processedFriends = useRuntimeStore(
        (state: any) => state.mutualGraph.processedFriends
    );
    const totalFriends = useRuntimeStore(
        (state: any) => state.mutualGraph.totalFriends
    );
    const cancelRequested = useRuntimeStore(
        (state: any) => state.mutualGraph.cancelRequested
    );
    const lastError = useRuntimeStore(
        (state: any) => state.mutualGraph.lastError
    );

    useEffect(() => {
        refreshMutualGraphFetchStatus().catch(() => {});
    }, [currentUserId]);

    const isCurrentUserFetch =
        !statusOwnerUserId || statusOwnerUserId === currentUserId;
    const isFetching =
        isCurrentUserFetch &&
        (statusName === 'running' || statusName === 'cancelling');
    const fetchProgress = useMemo(
        () => ({
            isFetching,
            processedFriends: isCurrentUserFetch ? processedFriends : 0,
            totalFriends: isCurrentUserFetch ? totalFriends : 0,
            cancelRequested: cancelRequested || statusName === 'cancelling'
        }),
        [
            cancelRequested,
            isCurrentUserFetch,
            isFetching,
            processedFriends,
            statusName,
            totalFriends
        ]
    );
    const progressPercent = useMemo(
        () =>
            fetchProgress.totalFriends
                ? Math.min(
                      100,
                      Math.round(
                          (fetchProgress.processedFriends /
                              fetchProgress.totalFriends) *
                              100
                      )
                  )
                : 0,
        [fetchProgress.processedFriends, fetchProgress.totalFriends]
    );

    useEffect(() => {
        if (
            !isCurrentUserFetch ||
            !statusRunId ||
            statusRunId === lastHandledRunRef.current
        ) {
            return;
        }

        const startedHere = startedRunIdsRef.current.has(statusRunId);
        if (statusName === 'completed') {
            lastHandledRunRef.current = statusRunId;
            reloadSnapshot(
                'Fetched and cached the mutual-friends graph.',
                statusOwnerUserId
            ).catch((error: any) => {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : t(
                              'view.charts.toast.failed_to_fetch_mutual_friends_graph'
                    )
                );
            });
            if (startedHere) {
                toast.success(
                    t('view.charts.success.mutual_friends_graph_refreshed')
                );
            }
            return;
        }

        if (statusName === 'cancelled') {
            lastHandledRunRef.current = statusRunId;
            if (startedHere) {
                toast.warning(
                    t(
                        'view.charts.label.mutual_graph_fetch_cancelled_the_cached_graph_was_not_replaced'
                    )
                );
            }
            return;
        }

        if (statusName === 'error') {
            lastHandledRunRef.current = statusRunId;
            setDetail(lastError || 'Failed to fetch mutual-friends graph.');
            if (startedHere) {
                toast.error(
                    lastError ||
                        t(
                            'view.charts.toast.failed_to_fetch_mutual_friends_graph'
                        )
                );
            }
        }
    }, [
        isCurrentUserFetch,
        lastError,
        reloadSnapshot,
        setDetail,
        statusName,
        statusOwnerUserId,
        statusRunId,
        t
    ]);

    async function handleFetchGraph() {
        if (!currentUserId || isFetching) {
            return;
        }
        const ownerUserId = currentUserId;

        const friendSnapshot = orderedFriendIds
            .map((friendId: any) => friendsById[friendId])
            .filter((friend: any) => friend?.id);
        if (!friendSnapshot.length) {
            toast.info(
                t(
                    'view.charts.empty.no_friends_are_available_for_mutual_graph_fetching'
                )
            );
            return;
        }

        setDetail('Fetching mutual friends from VRChat.');

        try {
            const status = await startMutualGraphFetch({
                ownerUserId,
                endpoint: currentUserEndpoint,
                friendIds: friendSnapshot.map((friend: any) => friend.id)
            });
            if (status.runId) {
                startedRunIdsRef.current.add(status.runId);
            }
            startMutualGraphFetchStatusPolling();
        } catch (error) {
            setDetail(
                error instanceof Error
                    ? error.message
                    : 'Failed to fetch mutual-friends graph.'
            );
            toast.error(
                error instanceof Error
                    ? error.message
                    : t(
                          'view.charts.toast.failed_to_fetch_mutual_friends_graph'
                      )
            );
        }
    }

    function handleCancelFetch() {
        if (!currentUserId) {
            return;
        }
        cancelMutualGraphFetch(currentUserId).catch((error: any) => {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t('view.charts.toast.failed_to_fetch_mutual_friends_graph')
            );
        });
    }

    return {
        fetchProgress,
        handleCancelFetch,
        handleFetchGraph,
        progressPercent
    };
}
