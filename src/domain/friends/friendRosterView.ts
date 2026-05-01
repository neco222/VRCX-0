import { normalizeUserId, type UserFact } from '@/domain/users/userFacts.js';

interface FriendRosterViewInput {
    orderedFriendIds?: string[];
    onlineIds?: string[];
    activeIds?: string[];
    offlineIds?: string[];
    usersById?: Record<string, UserFact | undefined>;
    favoriteIds?: Set<string> | string[];
}

function toSet(values: Set<string> | string[] | undefined): Set<string> {
    return values instanceof Set ? values : new Set(values || []);
}

function buildFriendRosterView({
    orderedFriendIds = [],
    onlineIds = [],
    activeIds = [],
    offlineIds = [],
    usersById = {},
    favoriteIds
}: FriendRosterViewInput = {}) {
    const favorites = toSet(favoriteIds);
    const rows = orderedFriendIds
        .map((id) => normalizeUserId(id))
        .filter(Boolean)
        .map((id) => usersById[id])
        .filter(Boolean)
        .map((user) => ({
            ...user,
            isFavorite: favorites.has(user.id)
        }));

    return {
        rows,
        onlineIds,
        activeIds,
        offlineIds,
        favoriteIds: rows.filter((row) => row.isFavorite).map((row) => row.id)
    };
}

export { buildFriendRosterView };
export type { FriendRosterViewInput };
