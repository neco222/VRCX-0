import { describe, expect, it } from 'vitest';

import type { FavoriteTransferItemResult } from '@/platform/tauri/bindings';

import type { FavoriteGroup, FavoriteItem } from './favoritesTypes';
import {
    buildFavoriteTransferFailureDescription,
    buildFavoriteTransferInput,
    buildFavoriteTransferSuccessfulKeys,
    buildFavoriteTransferTargets
} from './favoriteTransfer';

const remoteGroups: FavoriteGroup[] = [
    {
        key: 'world:group_0',
        source: 'remote',
        name: 'group_0',
        type: 'world',
        label: 'Remote A'
    },
    {
        key: 'world:group_1',
        source: 'remote',
        name: 'group_1',
        type: 'world',
        label: 'Remote B'
    }
];
const localGroups: FavoriteGroup[] = [
    { key: 'Local A', source: 'local', label: 'Local A' },
    { key: 'Local B', source: 'local', label: 'Local B' }
];
const remoteItem: FavoriteItem = {
    key: 'remote:world:group_0:wrld_1',
    id: 'wrld_1',
    kind: 'world',
    source: 'remote',
    groupKey: 'world:group_0',
    seedData: {
        id: 'wrld_1',
        name: 'World 1',
        releaseStatus: 'public',
        thumbnailImageUrl: 'https://example.test/world.png'
    }
};
const localItem: FavoriteItem = {
    key: 'local:Local A:wrld_1',
    id: 'wrld_1',
    kind: 'world',
    source: 'local',
    groupKey: 'Local A'
};
const successfulTransferResult: FavoriteTransferItemResult = {
    key: remoteItem.key,
    entityId: remoteItem.id,
    status: 'moved',
    stage: 'addLocal',
    message: '',
    remoteFavorite: null,
    localAffected: 1
};
const failedTransferResult: FavoriteTransferItemResult = {
    key: localItem.key,
    entityId: localItem.id,
    status: 'failed',
    stage: 'addRemote',
    message: 'Favorite limit reached',
    remoteFavorite: null,
    localAffected: 0
};

describe('favorite transfer helpers', () => {
    it('keeps move targets available across remote and local groups except the current group', () => {
        expect(
            buildFavoriteTransferTargets({
                remoteGroups,
                localGroups,
                selectedSource: 'remote',
                selectedGroupKey: 'world:group_0'
            }).map((target) => `${target.source}:${target.key}`)
        ).toEqual(['remote:world:group_1', 'local:Local A', 'local:Local B']);
    });

    it('builds remote to local payload with the entity id used as the remote delete object id', () => {
        const input = buildFavoriteTransferInput({
            endpoint: 'https://api.vrchat.cloud/api/1',
            kind: 'world',
            sourceGroup: remoteGroups[0],
            targetGroup: localGroups[0],
            selectedItems: [remoteItem]
        });

        expect(input).toMatchObject({
            kind: 'world',
            source: {
                location: 'remote',
                group: 'group_0'
            },
            target: {
                location: 'local',
                group: 'Local A'
            },
            items: [
                {
                    key: 'remote:world:group_0:wrld_1',
                    entityId: 'wrld_1'
                }
            ]
        });
        expect(input.items?.[0]?.entity).toEqual(remoteItem.seedData);
        expect(input.items?.[0]).not.toHaveProperty('remoteFavoriteRecordId');
    });

    it('builds local to remote payload as copy-only', () => {
        const input = buildFavoriteTransferInput({
            endpoint: '',
            kind: 'world',
            sourceGroup: localGroups[0],
            targetGroup: remoteGroups[1],
            selectedItems: [localItem]
        });

        expect(input).toMatchObject({
            source: {
                location: 'local',
                group: 'Local A'
            },
            target: {
                location: 'remote',
                group: 'group_1',
                favoriteType: 'world'
            },
            items: [
                {
                    entityId: 'wrld_1'
                }
            ]
        });
        expect(input.items?.[0]).not.toHaveProperty('remoteFavoriteRecordId');
    });

    it('returns only successful transfer keys for selection cleanup', () => {
        expect(
            Array.from(
                buildFavoriteTransferSuccessfulKeys([
                    successfulTransferResult,
                    failedTransferResult
                ])
            )
        ).toEqual([remoteItem.key]);
    });

    it('builds per-item failure details with the failing stage and message', () => {
        expect(
            buildFavoriteTransferFailureDescription({
                results: [successfulTransferResult, failedTransferResult],
                selectedItems: [remoteItem, localItem],
                fallbackMessage: 'Failed to move selected favorites'
            })
        ).toBe('wrld_1 [addRemote]: Favorite limit reached');
    });
});
