import { getAvailablePlatforms } from '@/shared/utils/avatarPlatform';

import type { MyAvatarRow, MyAvatarTag } from './myAvatarsTypes';

export function toggleMyAvatarsTagFilter(
    currentTags: Iterable<string> | null | undefined,
    tag: string
) {
    const next = new Set(currentTags);
    if (next.has(tag)) {
        next.delete(tag);
    } else {
        next.add(tag);
    }
    return next;
}

export function collectMyAvatarTags(avatars: readonly MyAvatarRow[]) {
    const tagSet = new Set<string>();
    for (const avatar of avatars) {
        for (const entry of avatar?.$tags || []) {
            if (entry?.tag) {
                tagSet.add(entry.tag);
            }
        }
    }
    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
}

export function matchesMyAvatarsPlatformFilter(
    avatar: MyAvatarRow,
    platformFilter: string
) {
    if (platformFilter === 'all') {
        return true;
    }

    const platforms = getAvailablePlatforms(avatar?.unityPackages);
    return (
        Boolean(platforms?.isPC && platformFilter === 'pc') ||
        Boolean(platforms?.isQuest && platformFilter === 'android') ||
        Boolean(platforms?.isIos && platformFilter === 'ios')
    );
}

type FilterMyAvatarsInput = {
    avatars: readonly MyAvatarRow[] | null | undefined;
    searchQuery?: unknown;
    platformFilter: string;
    releaseStatusFilter: string;
    tagFilters?: Set<string>;
};

export function filterMyAvatars({
    avatars,
    searchQuery,
    platformFilter,
    releaseStatusFilter,
    tagFilters
}: FilterMyAvatarsInput) {
    const searchValue = String(searchQuery || '')
        .trim()
        .toLowerCase();
    const selectedTags =
        tagFilters instanceof Set ? tagFilters : new Set<string>();
    const avatarRows: readonly MyAvatarRow[] = Array.isArray(avatars)
        ? avatars
        : [];

    return avatarRows.filter((avatar) => {
        if (
            releaseStatusFilter !== 'all' &&
            avatar?.releaseStatus !== releaseStatusFilter
        ) {
            return false;
        }

        if (!matchesMyAvatarsPlatformFilter(avatar, platformFilter)) {
            return false;
        }

        if (selectedTags.size > 0) {
            const avatarTags = new Set(
                (avatar?.$tags || []).map((entry: MyAvatarTag) => entry.tag)
            );
            if (![...selectedTags].some((tag) => avatarTags.has(tag))) {
                return false;
            }
        }

        if (!searchValue) {
            return true;
        }

        return (
            String(avatar?.name || '')
                .toLowerCase()
                .includes(searchValue) ||
            String(avatar?.description || '')
                .toLowerCase()
                .includes(searchValue) ||
            (avatar?.$tags || []).some((entry) =>
                String(entry?.tag || '')
                    .toLowerCase()
                    .includes(searchValue)
            )
        );
    });
}
