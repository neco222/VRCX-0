import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import favoriteTransferRepository from '@/repositories/favoriteTransferRepository';
import { useModalStore } from '@/state/modalStore';

import type {
    FavoriteGroup,
    FavoriteItem,
    FavoriteKind,
    FavoriteSource
} from './favoritesTypes';
import {
    buildFavoriteTransferFailureDescription,
    buildFavoriteTransferInput,
    buildFavoriteTransferSuccessfulKeys,
    buildFavoriteTransferTargets
} from './favoriteTransfer';

export function useFavoritesBulkActions({
    currentEndpoint,
    handleRemoveLocalFavorite,
    handleRemoveRemoteFavorite,
    kind,
    localGroups,
    refreshFavorites,
    remoteGroups,
    selectedGroup,
    selectedContentItems,
    selectedGroupKey,
    selectedSource,
    setEditMode,
    setSelectedKeys
}: {
    currentEndpoint: string;
    handleRemoveLocalFavorite(
        item: FavoriteItem,
        options?: { silent?: boolean }
    ): Promise<boolean>;
    handleRemoveRemoteFavorite(
        item: FavoriteItem,
        options?: { silent?: boolean }
    ): Promise<boolean>;
    kind: FavoriteKind;
    localGroups: FavoriteGroup[];
    refreshFavorites(options?: { silent?: boolean }): Promise<void>;
    remoteGroups: FavoriteGroup[];
    selectedGroup: FavoriteGroup | null;
    selectedContentItems: FavoriteItem[];
    selectedGroupKey: string;
    selectedSource: FavoriteSource;
    setEditMode(value: boolean): void;
    setSelectedKeys(value: string[] | ((current: string[]) => string[])): void;
}) {
    const { t } = useTranslation();
    const confirm = useModalStore((state: any) => state.confirm);
    const moveTargets = useMemo(
        () =>
            buildFavoriteTransferTargets({
                remoteGroups,
                localGroups,
                selectedSource,
                selectedGroupKey
            }),
        [localGroups, remoteGroups, selectedGroupKey, selectedSource]
    );

    async function bulkRemoveSelection() {
        if (!selectedContentItems.length) {
            return;
        }
        const result = await confirm({
            title: t('view.favorites.modal.delete_value_favorites', {
                value: selectedContentItems.length
            }),
            description: t('view.favorites.modal.this_action_cannot_be_undone'),
            destructive: true,
            confirmText: t('common.actions.delete'),
            cancelText: t('common.actions.cancel')
        });
        if (!result.ok) {
            return;
        }
        let removedCount = 0;
        let failedCount = 0;
        const removedKeys = new Set<string>();
        for (const item of selectedContentItems) {
            try {
                const removed =
                    item.source === 'local'
                        ? await handleRemoveLocalFavorite(item, {
                              silent: true
                          })
                        : await handleRemoveRemoteFavorite(item, {
                              silent: true
                          });
                if (removed) {
                    removedCount += 1;
                    removedKeys.add(item.key);
                } else {
                    failedCount += 1;
                }
            } catch {
                failedCount += 1;
            }
        }
        if (removedCount > 0) {
            setSelectedKeys((current) =>
                current.filter((key) => !removedKeys.has(key))
            );
        }
        if (failedCount === 0) {
            setEditMode(false);
            toast.success(
                t('view.favorite.success.selected_favorites_removed')
            );
            return;
        }
        toast.error(
            t('view.favorites.dynamic.removed_value_value_failed', {
                value: removedCount,
                value2: failedCount
            })
        );
    }

    async function bulkMoveSelection(targetGroup: FavoriteGroup) {
        if (!selectedContentItems.length || !selectedGroup) {
            return;
        }
        try {
            const result = await favoriteTransferRepository.transferFavorites(
                buildFavoriteTransferInput({
                    endpoint: currentEndpoint,
                    kind,
                    sourceGroup: selectedGroup,
                    targetGroup,
                    selectedItems: selectedContentItems
                })
            );
            const successfulKeys = buildFavoriteTransferSuccessfulKeys(
                result.items
            );
            if (result.succeeded > 0) {
                await refreshFavorites({ silent: true });
                setSelectedKeys((current) =>
                    current.filter((key) => !successfulKeys.has(key))
                );
            }
            if (result.failed === 0) {
                const successMessage =
                    selectedGroup.source === 'local' &&
                    targetGroup.source === 'remote'
                        ? t('view.favorite.success.selected_favorites_copied')
                        : t('view.favorite.success.selected_favorites_moved');
                setEditMode(false);
                toast.success(successMessage);
                return;
            }
            const fallbackMessage = t(
                'view.favorites.toast.failed_to_move_selected_favorites'
            );
            const description = buildFavoriteTransferFailureDescription({
                results: result.items,
                selectedItems: selectedContentItems,
                fallbackMessage
            });
            toast.error(
                t('view.favorites.dynamic.transferred_value_value_failed', {
                    value: result.succeeded,
                    value2: result.failed
                }),
                description ? { description } : undefined
            );
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t(
                          'view.favorites.toast.failed_to_move_selected_favorites'
                      )
            );
        }
    }

    return {
        bulkMoveSelection,
        bulkRemoveSelection,
        moveTargets
    };
}
