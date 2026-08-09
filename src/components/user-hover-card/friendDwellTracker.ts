import {
    normalizeLocationStatus,
    timestampMsFromValue
} from '@/components/sidebar/friends-sidebar/friendsSidebarModel';
import type {
    FriendRecord,
    FriendRosterById,
    FriendRosterStore
} from '@/domain/friends/friendRosterTypes';
import { parseLocation } from '@/shared/utils/location';
import { normalizeString as normalizeId } from '@/shared/utils/string';
import { useFriendRosterStore } from '@/state/friendRosterStore';

const firstSeenByUser = new Map<string, { location: string; since: number }>();
let started = false;

let previousFriendsById: FriendRosterById | null = null;

function getFriendRefRecord(friend: FriendRecord): Record<string, unknown> {
    return friend.ref && typeof friend.ref === 'object'
        ? (friend.ref as Record<string, unknown>)
        : friend;
}

function readLocationProjectionTag(value: unknown): unknown {
    return value && typeof value === 'object'
        ? (value as Record<string, unknown>).tag
        : undefined;
}

function readEntryLocationTag(friend: FriendRecord) {
    const ref = getFriendRefRecord(friend);
    return normalizeId(
        friend?.location ||
            ref?.location ||
            friend?.$location?.tag ||
            readLocationProjectionTag(ref?.$location)
    );
}

function readEntryUpstreamEpoch(friend: FriendRecord) {
    const ref = getFriendRefRecord(friend);
    return timestampMsFromValue(
        friend?.locationAt ||
            ref?.locationAt ||
            friend?.$location_at ||
            ref?.$location_at
    );
}

function applyFriendChange(userId: string, friend: FriendRecord) {
    const stateBucket = normalizeLocationStatus(
        friend?.stateBucket || friend?.state
    );
    const locationTag = readEntryLocationTag(friend);
    const inRealInstance =
        stateBucket === 'online' && parseLocation(locationTag).isRealInstance;

    // Drop the estimate when the friend leaves the instance or a genuine
    // upstream join epoch becomes available.
    if (!inRealInstance || readEntryUpstreamEpoch(friend)) {
        firstSeenByUser.delete(userId);
        return;
    }

    const tracked = firstSeenByUser.get(userId);
    if (!tracked || tracked.location !== locationTag) {
        firstSeenByUser.set(userId, {
            location: locationTag,
            since: Date.now()
        });
    }
}

function ingestRosterState(state: FriendRosterStore) {
    const friendsById = state?.friendsById;
    if (!friendsById || friendsById === previousFriendsById) {
        return;
    }
    const previous = previousFriendsById || {};
    previousFriendsById = friendsById;

    for (const userId in friendsById) {
        const friend = friendsById[userId];
        if (friend === previous[userId]) {
            continue;
        }
        applyFriendChange(normalizeId(friend?.id || userId), friend);
    }
}

function ensureStarted() {
    if (started) {
        return;
    }
    started = true;
    ingestRosterState(useFriendRosterStore.getState());
    useFriendRosterStore.subscribe(ingestRosterState);
}

export function getEstimatedDwellSince(userId: unknown, location: unknown) {
    ensureStarted();
    const tracked = firstSeenByUser.get(normalizeId(userId));
    if (tracked && tracked.location === normalizeId(location)) {
        return tracked.since;
    }
    return 0;
}

ensureStarted();
