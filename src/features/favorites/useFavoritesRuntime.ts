import { useMemo } from 'react';

import { checkCanInvite } from '@/shared/utils/invite';
import { useRuntimeStore } from '@/state/runtimeStore';

import { resolveCurrentInviteLocation } from './favoritesItems';

export function useFavoritesRuntime() {
    const currentEndpoint = useRuntimeStore(
        (state) => state.auth.currentUserEndpoint
    );
    const currentUserId = useRuntimeStore((state) => state.auth.currentUserId);
    const currentUserSnapshot = useRuntimeStore(
        (state) => state.auth.currentUserSnapshot
    );
    const runtimeCurrentLocation = useRuntimeStore(
        (state) => state.gameState.currentLocation
    );
    const runtimeCurrentDestination = useRuntimeStore(
        (state) => state.gameState.currentDestination
    );
    const isGameRunning = useRuntimeStore(
        (state) => state.gameState.isGameRunning
    );
    const normalizedCurrentUserId = currentUserId ?? '';
    const gameState = useMemo(
        () => ({
            currentLocation: runtimeCurrentLocation,
            currentDestination: runtimeCurrentDestination,
            isGameRunning
        }),
        [isGameRunning, runtimeCurrentDestination, runtimeCurrentLocation]
    );
    const currentInviteLocation = useMemo(
        () => resolveCurrentInviteLocation(gameState, currentUserSnapshot),
        [currentUserSnapshot, gameState]
    );
    const canInviteFromCurrentLocation = useMemo(
        () =>
            checkCanInvite(currentInviteLocation, {
                currentUserId: normalizedCurrentUserId,
                lastLocationStr: currentInviteLocation,
                cachedInstances: new Map()
            }),
        [currentInviteLocation, normalizedCurrentUserId]
    );
    const canSendInvite = Boolean(
        gameState.isGameRunning &&
        currentInviteLocation &&
        canInviteFromCurrentLocation
    );

    return {
        canBoop: Boolean(currentUserSnapshot?.isBoopingEnabled),
        canInviteFromCurrentLocation,
        canSendInvite,
        currentAvatarId: currentUserSnapshot?.currentAvatar || '',
        currentEndpoint,
        currentInviteLocation,
        currentUserId: normalizedCurrentUserId,
        currentUserSnapshot,
        gameState
    };
}
