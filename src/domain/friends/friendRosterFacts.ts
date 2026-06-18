import type { UserFact } from '@/domain/users/userFacts';

import type {
    FriendRosterDerivedField,
    FriendRosterFactPatch,
    FriendRosterRecord
} from './friendRosterTypes';

const FACT_DERIVED_FIELDS = [
    '$trustLevel',
    '$trustClass',
    '$trustSortNum',
    '$isModerator',
    '$isTroll',
    '$isProbableTroll',
    '$platform'
] as const satisfies readonly FriendRosterDerivedField[];

function applyFactDerivedFields(
    friend: FriendRosterRecord,
    fact: FriendRosterFactPatch | null | undefined
): FriendRosterRecord {
    if (!fact) {
        return friend;
    }
    let next: FriendRosterRecord | null = null;
    for (const field of FACT_DERIVED_FIELDS) {
        const value = fact[field];
        if (value === undefined || value === null || value === friend[field]) {
            continue;
        }
        if (!next) {
            next = { ...friend };
        }
        const derivedFields = next as FriendRosterFactPatch;
        derivedFields[field] = value;
    }
    return next ?? friend;
}

function mergeRosterFriendFacts(
    friendsById: Record<string, FriendRosterRecord>,
    factsById: Record<string, UserFact | FriendRosterFactPatch | undefined>
): Record<string, FriendRosterRecord> {
    let next: Record<string, FriendRosterRecord> | null = null;
    for (const id of Object.keys(friendsById)) {
        const friend = friendsById[id];
        const merged = applyFactDerivedFields(friend, factsById[id]);
        if (merged !== friend) {
            if (!next) {
                next = { ...friendsById };
            }
            next[id] = merged;
        }
    }
    return next ?? friendsById;
}

export { applyFactDerivedFields, mergeRosterFriendFacts };
