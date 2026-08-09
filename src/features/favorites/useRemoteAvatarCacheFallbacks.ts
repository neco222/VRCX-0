import { useMemo } from 'react';

import avatarCacheRepository from '@/repositories/avatarCacheRepository';

import {
    type DetailMap,
    filterRemoteEntityCacheFallbacksById,
    getRemoteEntityCacheFallbackIds,
    loadRemoteEntityCacheFallbacksById,
    useRemoteEntityCacheFallbackLoader
} from './remoteEntityCacheFallbacks';

type RemoteAvatarCacheFallbackInput = {
    favoriteAvatarIds?: unknown;
    kind: unknown;
    localAvatarDetailsById?: DetailMap;
    remoteEntityDetailsData?: DetailMap;
    remoteEntityDetailsStatus?: unknown;
};

const fetchCachedAvatarById = (avatarId: string) =>
    avatarCacheRepository.getCachedAvatarById(avatarId);

export function getRemoteAvatarCacheFallbackIds({
    favoriteAvatarIds,
    kind,
    localAvatarDetailsById,
    remoteEntityDetailsData,
    remoteEntityDetailsStatus
}: RemoteAvatarCacheFallbackInput): string[] {
    return getRemoteEntityCacheFallbackIds({
        entityIds: favoriteAvatarIds,
        detailSources: [remoteEntityDetailsData, localAvatarDetailsById],
        isReady: kind === 'avatar' && remoteEntityDetailsStatus === 'ready'
    });
}

export const filterRemoteAvatarCacheFallbacksById =
    filterRemoteEntityCacheFallbacksById;

export function loadRemoteAvatarCacheFallbacksById(
    avatarIds: string[]
): Promise<DetailMap> {
    return loadRemoteEntityCacheFallbacksById(avatarIds, fetchCachedAvatarById);
}

export function useRemoteAvatarCacheFallbacks(
    input: RemoteAvatarCacheFallbackInput
): DetailMap {
    const fallbackAvatarIds = useMemo(
        () => getRemoteAvatarCacheFallbackIds(input),
        [
            input.favoriteAvatarIds,
            input.kind,
            input.localAvatarDetailsById,
            input.remoteEntityDetailsData,
            input.remoteEntityDetailsStatus
        ]
    );

    return useRemoteEntityCacheFallbackLoader(
        fallbackAvatarIds,
        fetchCachedAvatarById
    );
}
