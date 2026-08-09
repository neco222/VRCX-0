import { getFriendsSortFunction, sortStatus } from '@/shared/utils/friend';
import type { FriendSortMethod } from '@/shared/utils/friend';

import {
    type FriendLocationFriend,
    type SameInstanceGroup,
    normalizeFriendsLocationId as normalizeId,
    resolveLocationSummary,
    resolveLocationTarget
} from './friendsLocationsRows';

type TranslationFn = (
    key: string,
    options?: Record<string, unknown>
) => unknown;

type FriendSectionRecord = Record<string, unknown> & {
    displayName?: unknown;
    id?: unknown;
    name?: unknown;
    ref?: FriendSectionRecord | null;
    status?: unknown;
    username?: unknown;
};

type FavoriteGroupOption = {
    key?: unknown;
    displayName?: unknown;
    name?: unknown;
};

type FavoriteGroupLabelsByFriendId = Map<string, string[]>;

type FavoriteGroupLabelsInput = {
    favoriteFriendGroups?: FavoriteGroupOption[] | null;
    groupedFavoriteFriendIdsByGroupKey?: Record<string, unknown>;
    localFriendFavorites?: Record<string, unknown>;
    t?: TranslationFn | null;
};

type FavoriteGroupSortValue = {
    key: string;
    label?: string;
};

type FriendsLocationSectionDescriptor = {
    key: string;
    title: string;
    description: string;
    worldId: string;
    groupId: string;
    rawLocation?: string;
};

type FriendsLocationSection<
    TFriend extends FriendLocationFriend = FriendLocationFriend
> = FriendsLocationSectionDescriptor & {
    displayInstanceInfo?: boolean;
    friends: TFriend[];
};

type BuildSameInstanceSectionsInput<
    TFriend extends FriendLocationFriend = FriendLocationFriend
> = {
    sameInstanceGroups: SameInstanceGroup<TFriend>[];
    displayInstanceInfo?: boolean;
    favoriteIds?: Set<string>;
    favoriteGroupLabelsByFriendId?: FavoriteGroupLabelsByFriendId;
    t?: TranslationFn | null;
};

type BuildFriendSectionsInput<
    TFriend extends FriendLocationFriend = FriendLocationFriend
> = {
    friends: TFriend[];
    groupingMode: string;
    favoriteIds: Set<string>;
    favoriteGroupLabelsByFriendId: FavoriteGroupLabelsByFriendId;
    t?: TranslationFn | null;
};

function isRecord(value: unknown): value is FriendSectionRecord {
    return typeof value === 'object' && value !== null;
}

const FRIEND_SORT_METHODS = new Set<string>([
    'Sort Alphabetically',
    'Sort Private to Bottom',
    'Sort by Status',
    'Sort by Last Active',
    'Sort by Last Seen',
    'Sort by Time in Instance',
    'Sort by Location',
    'None'
]);

function isFriendSortMethod(value: unknown): value is FriendSortMethod {
    return typeof value === 'string' && FRIEND_SORT_METHODS.has(value);
}

function interpolateFallback(
    value: unknown,
    values: Record<string, unknown> = {}
) {
    return String(value ?? '').replace(/\{(\w+)\}/g, (match, key: string) =>
        Object.hasOwn(values, key) ? String(values[key]) : match
    );
}

function localized(
    t: TranslationFn | null | undefined,
    key: string,
    fallback: string,
    values: Record<string, unknown> = {}
) {
    if (typeof t !== 'function') {
        return interpolateFallback(fallback, values);
    }

    return interpolateFallback(
        t(key, { defaultValue: fallback, ...values }),
        values
    );
}

function appendLabel(
    labelsByFriendId: FavoriteGroupLabelsByFriendId,
    friendId: unknown,
    label: unknown
) {
    const normalizedFriendId = normalizeId(friendId);
    const normalizedLabel =
        typeof label === 'string' ? label.trim() : String(label ?? '').trim();
    if (!normalizedFriendId || !normalizedLabel) {
        return;
    }

    const labels = labelsByFriendId.get(normalizedFriendId) ?? [];
    if (!labels.includes(normalizedLabel)) {
        labels.push(normalizedLabel);
    }
    labelsByFriendId.set(normalizedFriendId, labels);
}

export function buildFavoriteGroupLabelsByFriendId({
    favoriteFriendGroups,
    groupedFavoriteFriendIdsByGroupKey,
    localFriendFavorites,
    t
}: FavoriteGroupLabelsInput) {
    const labelsByFriendId: FavoriteGroupLabelsByFriendId = new Map();

    for (const group of favoriteFriendGroups ?? []) {
        const groupKey = normalizeId(group?.key);
        if (!groupKey) {
            continue;
        }

        const label = group?.displayName || group?.name || groupKey;
        const friendIds = groupedFavoriteFriendIdsByGroupKey?.[groupKey];
        if (Array.isArray(friendIds)) {
            for (const friendId of friendIds) {
                appendLabel(labelsByFriendId, friendId, label);
            }
        }
    }

    for (const [groupName, friendIds] of Object.entries(
        localFriendFavorites ?? {}
    )) {
        if (!Array.isArray(friendIds)) {
            continue;
        }

        const label = localized(
            t,
            'view.friends_locations.local_group',
            'Local: {name}',
            {
                name:
                    groupName ||
                    localized(t, 'view.friends_locations.favorite', 'Favorites')
            }
        );
        for (const friendId of friendIds) {
            appendLabel(labelsByFriendId, friendId, label);
        }
    }

    return labelsByFriendId;
}

export function compareFavoriteGroups(
    left: FavoriteGroupSortValue,
    right: FavoriteGroupSortValue,
    order: string[] = []
) {
    const leftIndex = order.indexOf(left.key);
    const rightIndex = order.indexOf(right.key);
    if (leftIndex >= 0 && rightIndex >= 0) {
        return leftIndex - rightIndex;
    }
    if (leftIndex >= 0) {
        return -1;
    }
    if (rightIndex >= 0) {
        return 1;
    }
    return String(left.label || left.key || '').localeCompare(
        String(right.label || right.key || ''),
        undefined,
        { sensitivity: 'base' }
    );
}

function readFriendRef(
    friend: FriendLocationFriend | null | undefined
): FriendSectionRecord {
    if (!isRecord(friend)) {
        return {};
    }
    return isRecord(friend.ref) ? friend.ref : friend;
}

function readFriendStatusSource(
    friend: FriendLocationFriend | null | undefined
) {
    const ref = readFriendRef(friend);
    if (!ref || ref === friend) {
        return isRecord(friend) ? friend : {};
    }
    return {
        ...friend,
        ...ref
    };
}

function normalizeStatusText(value: unknown) {
    const status =
        typeof value === 'string'
            ? value.trim().toLowerCase()
            : String(value ?? '')
                  .trim()
                  .toLowerCase();
    if (status === 'joinme') {
        return 'join me';
    }
    if (status === 'askme') {
        return 'ask me';
    }
    return status;
}

function activeStatusSortValue(friend: FriendLocationFriend) {
    const source = readFriendStatusSource(friend);
    const status = normalizeStatusText(source?.status);
    if (status === 'join me' || status === 'ask me' || status === 'busy') {
        return status;
    }
    return 'active';
}

function compareByActiveStatus(
    left: FriendLocationFriend,
    right: FriendLocationFriend
) {
    return sortStatus(
        activeStatusSortValue(left),
        activeStatusSortValue(right)
    );
}

function toLegacyFriendSortRow(friend: FriendLocationFriend) {
    const ref = readFriendRef(friend);
    const source = isRecord(friend) ? friend : {};
    return {
        ...source,
        name:
            source.name ||
            source.displayName ||
            source.username ||
            source.id ||
            '',
        ref: ref && ref !== friend ? { ...source, ...ref } : source
    };
}

export function sortFriendsBySidebarPrefs<TFriend extends FriendLocationFriend>(
    friends: TFriend[],
    sortMethods: readonly string[] | null | undefined
) {
    const methods = [...(sortMethods ?? [])].filter(isFriendSortMethod);
    if (!methods.length) {
        return friends;
    }

    const sort = getFriendsSortFunction(methods);
    return [...friends].sort((left, right) =>
        sort(
            toLegacyFriendSortRow(left) as Parameters<typeof sort>[0],
            toLegacyFriendSortRow(right) as Parameters<typeof sort>[1]
        )
    );
}

export function sortActiveFriendsBySidebarPrefs<
    TFriend extends FriendLocationFriend
>(friends: TFriend[], sortMethods: readonly string[] | null | undefined) {
    return [...sortFriendsBySidebarPrefs(friends, sortMethods)].sort(
        compareByActiveStatus
    );
}

function resolveFavoriteGroupLabels(
    friend: FriendLocationFriend,
    favoriteGroupLabelsByFriendId: FavoriteGroupLabelsByFriendId,
    favoriteIds: Set<string>,
    t?: TranslationFn | null
) {
    const friendId = normalizeId(isRecord(friend) ? friend.id : '');
    if (!friendId) {
        return [];
    }

    const labels = favoriteGroupLabelsByFriendId.get(friendId) ?? [];
    if (labels.length > 0) {
        return labels;
    }

    return favoriteIds.has(friendId)
        ? [localized(t, 'view.friends_locations.favorite', 'Favorites')]
        : [];
}

function resolveInstanceSectionDescriptor(
    friend: FriendLocationFriend,
    t?: TranslationFn | null
): FriendsLocationSectionDescriptor {
    const target = resolveLocationTarget(friend);
    const summary = resolveLocationSummary(friend, t);
    const descriptor: FriendsLocationSectionDescriptor = {
        key: 'instance:unknown',
        title: '',
        description: '',
        worldId: '',
        groupId: '',
        rawLocation: ''
    };

    if (target.isOffline) {
        return {
            ...descriptor,
            key: 'instance:offline',
            title: localized(t, 'location.offline', 'Offline')
        };
    }

    if (target.isPrivate) {
        return {
            ...descriptor,
            key: `instance:private:${target.worldId || target.rawLocation || 'private'}`,
            title: localized(t, 'location.private', 'Private'),
            description: '',
            worldId: target.worldId,
            rawLocation: target.rawLocation
        };
    }

    if (target.isTraveling) {
        return {
            ...descriptor,
            key: `instance:traveling:${target.rawLocation || 'traveling'}`,
            title: localized(t, 'location.traveling', 'Traveling'),
            description: summary.meta || '',
            worldId: target.worldId,
            groupId: target.groupId,
            rawLocation: target.rawLocation
        };
    }

    if (target.worldId) {
        return {
            ...descriptor,
            key: `instance:${target.rawLocation || target.worldId}`,
            title:
                summary.label ||
                target.worldId ||
                localized(t, 'view.friend_list.label.world', 'World'),
            description: [summary.meta].filter(Boolean).join(' · '),
            worldId: target.worldId,
            groupId: target.groupId,
            rawLocation: target.rawLocation
        };
    }

    return {
        ...descriptor,
        key: `instance:${summary.label || target.rawLocation || 'unknown'}`,
        title: summary.label || '',
        description: summary.meta || '',
        rawLocation: target.rawLocation
    };
}

export function buildSameInstanceSections<
    TFriend extends FriendLocationFriend
>({
    sameInstanceGroups,
    displayInstanceInfo = true,
    t
}: BuildSameInstanceSectionsInput<TFriend>): FriendsLocationSection<TFriend>[] {
    return sameInstanceGroups
        .map(({ location, friends }) => {
            const descriptor = resolveInstanceSectionDescriptor(
                {
                    ...friends[0],
                    location,
                    travelingToLocation: ''
                },
                t
            );

            return {
                ...descriptor,
                key: `instance:${location}`,
                rawLocation: location,
                displayInstanceInfo,
                friends
            };
        })
        .filter((section) => section.friends.length > 0);
}

function upsertSection<TFriend extends FriendLocationFriend>(
    sectionMap: Map<string, FriendsLocationSection<TFriend>>,
    descriptor: FriendsLocationSectionDescriptor,
    friend: TFriend
) {
    const existing = sectionMap.get(descriptor.key);
    if (existing) {
        existing.friends.push(friend);
        return;
    }

    sectionMap.set(descriptor.key, {
        ...descriptor,
        friends: [friend]
    });
}

export function buildFriendSections<TFriend extends FriendLocationFriend>({
    friends,
    groupingMode,
    favoriteIds,
    favoriteGroupLabelsByFriendId,
    t
}: BuildFriendSectionsInput<TFriend>): FriendsLocationSection<TFriend>[] {
    if (groupingMode === 'flat') {
        return [
            {
                key: 'flat',
                title: localized(
                    t,
                    'view.friends_locations.all_matching_friends',
                    'All matching friends'
                ),
                description: '',
                friends,
                worldId: '',
                groupId: ''
            }
        ];
    }

    const sectionsByKey = new Map<string, FriendsLocationSection<TFriend>>();

    for (const friend of friends) {
        if (groupingMode === 'favoriteGroup') {
            const labels = resolveFavoriteGroupLabels(
                friend,
                favoriteGroupLabelsByFriendId,
                favoriteIds,
                t
            );
            const label =
                labels.length > 0
                    ? labels.join(' / ')
                    : localized(
                          t,
                          'view.friends_locations.no_favorite_group',
                          'No favorite group'
                      );
            upsertSection(
                sectionsByKey,
                {
                    key: `favorite:${label}`,
                    title: label,
                    description:
                        labels.length > 0
                            ? localized(
                                  t,
                                  'view.friends_locations.favorite_group_segment',
                                  'Favorite group segment'
                              )
                            : localized(
                                  t,
                                  'view.friends_locations.friend_is_not_in_hydrated_favorite_group',
                                  'Friend is not in a hydrated favorite group.'
                              ),
                    worldId: '',
                    groupId: ''
                },
                friend
            );
            continue;
        }

        upsertSection(
            sectionsByKey,
            resolveInstanceSectionDescriptor(friend, t),
            friend
        );
    }

    return Array.from(sectionsByKey.values()).sort((left, right) => {
        if (
            left.key.startsWith('instance:offline') &&
            !right.key.startsWith('instance:offline')
        ) {
            return 1;
        }
        if (
            right.key.startsWith('instance:offline') &&
            !left.key.startsWith('instance:offline')
        ) {
            return -1;
        }
        return left.title.localeCompare(right.title, undefined, {
            sensitivity: 'base'
        });
    });
}
