import { normalizeUserId, type UserFact } from '@/domain/users/userFacts';

import type { FriendRecord } from './friendRosterTypes';

type FriendRosterViewUser = (FriendRecord | UserFact) & { id?: unknown };
type FriendRosterViewRow = FriendRosterViewUser & {
    isFavorite: boolean;
};

interface FriendRosterViewInput {
    orderedFriendIds?: string[];
    onlineIds?: string[];
    activeIds?: string[];
    offlineIds?: string[];
    usersById?: Record<string, FriendRosterViewUser | undefined>;
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
        .filter((user): user is FriendRosterViewUser => Boolean(user))
        .map<FriendRosterViewRow>((user) => ({
            ...user,
            isFavorite: favorites.has(normalizeUserId(user.id))
        }));

    return {
        rows,
        onlineIds,
        activeIds,
        offlineIds,
        favoriteIds: rows
            .filter((row) => row.isFavorite)
            .map((row) => normalizeUserId(row.id))
            .filter(Boolean)
    };
}

export { buildFriendRosterView };
export type { FriendRosterViewInput };
