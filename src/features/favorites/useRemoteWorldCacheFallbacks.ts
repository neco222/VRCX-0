import { useMemo } from 'react';

import favoritePersistenceRepository from '@/repositories/favoritePersistenceRepository';

import {
    type DetailMap,
    filterRemoteEntityCacheFallbacksById,
    getRemoteEntityCacheFallbackIds,
    loadRemoteEntityCacheFallbacksById,
    useRemoteEntityCacheFallbackLoader
} from './remoteEntityCacheFallbacks';

type RemoteWorldCacheFallbackInput = {
    favoriteWorldIds?: unknown;
    kind: unknown;
    localWorldDetailsById?: DetailMap;
    remoteEntityDetailsData?: DetailMap;
    remoteEntityDetailsStatus?: unknown;
    worldFactsById?: DetailMap;
};

const fetchCachedWorldById = (worldId: string) =>
    favoritePersistenceRepository.getCachedWorldById(worldId);

export function getRemoteWorldCacheFallbackIds({
    favoriteWorldIds,
    kind,
    localWorldDetailsById,
    remoteEntityDetailsData,
    remoteEntityDetailsStatus,
    worldFactsById
}: RemoteWorldCacheFallbackInput): string[] {
    return getRemoteEntityCacheFallbackIds({
        entityIds: favoriteWorldIds,
        detailSources: [
            remoteEntityDetailsData,
            worldFactsById,
            localWorldDetailsById
        ],
        isReady: kind === 'world' && remoteEntityDetailsStatus === 'ready'
    });
}

export const filterRemoteWorldCacheFallbacksById =
    filterRemoteEntityCacheFallbacksById;

export function loadRemoteWorldCacheFallbacksById(
    worldIds: string[]
): Promise<DetailMap> {
    return loadRemoteEntityCacheFallbacksById(worldIds, fetchCachedWorldById);
}

export function useRemoteWorldCacheFallbacks(
    input: RemoteWorldCacheFallbackInput
): DetailMap {
    const fallbackWorldIds = useMemo(
        () => getRemoteWorldCacheFallbackIds(input),
        [
            input.favoriteWorldIds,
            input.kind,
            input.localWorldDetailsById,
            input.remoteEntityDetailsData,
            input.remoteEntityDetailsStatus,
            input.worldFactsById
        ]
    );

    return useRemoteEntityCacheFallbackLoader(
        fallbackWorldIds,
        fetchCachedWorldById
    );
}
