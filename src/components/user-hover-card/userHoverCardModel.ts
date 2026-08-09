import {
    normalizeLocationStatus,
    readFriendInstanceEpoch,
    readFriendRef,
    readFriendStatusSource,
    resolveSidebarStatusDotClassName,
    timestampMsFromValue,
    type SidebarFriendRecord
} from '@/components/sidebar/friends-sidebar/friendsSidebarModel';
import { userImage } from '@/services/entityMediaService';
import { parseLocation } from '@/shared/utils/location';
import { normalizeString as normalizeId } from '@/shared/utils/string';
import { resolveTrustColorKey } from '@/shared/utils/trustColors';
import { computeTrustLevel } from '@/shared/utils/userTransforms';

export type UserHoverCardVariant =
    | 'in-instance'
    | 'private'
    | 'active'
    | 'offline'
    | 'profile-only';

type HoverCardRecord = Record<string, unknown> & {
    $location?: unknown;
    $travelingToLocation?: unknown;
    $trustClass?: unknown;
    $isModerator?: unknown;
    $isTroll?: unknown;
    $isProbableTroll?: unknown;
    $userColour?: unknown;
    developerType?: unknown;
    displayName?: unknown;
    id?: unknown;
    last_login?: unknown;
    location?: unknown;
    note?: unknown;
    state?: unknown;
    stateBucket?: unknown;
    status?: unknown;
    statusDescription?: unknown;
    tags?: unknown;
    username?: unknown;
};

type UserHoverCardModelInput = {
    seed?: HoverCardRecord | SidebarFriendRecord | null;
    profile?: HoverCardRecord | null;
    nowMs: number;
};

function recordOrEmpty(value: unknown): HoverCardRecord {
    return value && typeof value === 'object' ? (value as HoverCardRecord) : {};
}

function locationTag(value: unknown) {
    return value && typeof value === 'object'
        ? (value as { tag?: unknown }).tag
        : undefined;
}

function sidebarSeed(value: unknown): SidebarFriendRecord | null {
    return value && typeof value === 'object'
        ? (value as SidebarFriendRecord)
        : null;
}

function statusKeyFromStatus(status: unknown) {
    const normalized = normalizeLocationStatus(status);
    if (normalized === 'join me' || normalized === 'joinme') {
        return 'join_me';
    }
    if (normalized === 'ask me' || normalized === 'askme') {
        return 'ask_me';
    }
    if (normalized === 'busy') {
        return 'busy';
    }
    if (normalized === 'active') {
        return 'online';
    }
    return '';
}

function statusKeyFromPresence(status: unknown, state: unknown) {
    if (normalizeLocationStatus(state) === 'active') {
        return 'active';
    }
    const statusKey = statusKeyFromStatus(status);
    if (statusKey) {
        return statusKey;
    }
    return '';
}

function resolveTrust(identity: HoverCardRecord) {
    const tags = Array.isArray(identity?.tags)
        ? identity.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
    const trust = computeTrustLevel(
        tags,
        String(identity?.developerType || '')
    );
    const trustSource = {
        $trustClass: identity?.$trustClass || trust.trustClass,
        $isModerator: identity?.$isModerator ?? trust.isModerator,
        $isTroll: identity?.$isTroll ?? trust.isTroll,
        $isProbableTroll: identity?.$isProbableTroll ?? trust.isProbableTroll
    };
    return { trustSource, trustKey: resolveTrustColorKey(trustSource) };
}

function estimatedOnlineMs(state: unknown, lastLogin: unknown, nowMs: number) {
    if (normalizeLocationStatus(state) !== 'online') {
        return 0;
    }
    const lastLoginMs = timestampMsFromValue(lastLogin);
    if (!lastLoginMs || lastLoginMs > nowMs) {
        return 0;
    }
    return nowMs - lastLoginMs;
}

export function normalizeInstanceCounts(json: unknown) {
    if (!json || typeof json !== 'object') {
        return null;
    }
    const source = json as Record<string, unknown>;
    const nUsers = Number(source.n_users ?? source.userCount);
    if (!Number.isFinite(nUsers)) {
        return null;
    }
    const capacity = Number(source.capacity ?? source.recommendedCapacity);
    return { nUsers, capacity: Number.isFinite(capacity) ? capacity : 0 };
}

export function buildUserHoverCardModel({
    seed = null,
    profile = null,
    nowMs
}: UserHoverCardModelInput) {
    const seedRecord = sidebarSeed(seed);
    const statusSource = seedRecord ? readFriendStatusSource(seedRecord) : null;
    const ref = recordOrEmpty(readFriendRef(seedRecord));
    const profileRecord = recordOrEmpty(profile);
    const identity = profile ? profileRecord : ref;

    const state = normalizeLocationStatus(
        statusSource?.stateBucket ||
            statusSource?.state ||
            profileRecord?.stateBucket ||
            profileRecord?.state
    );
    const hasPresence = Boolean(statusSource) && Boolean(state);

    const rawLocation = normalizeId(
        statusSource?.location ||
            locationTag(statusSource?.$location) ||
            profileRecord?.location
    );
    const isTraveling = normalizeLocationStatus(rawLocation) === 'traveling';
    const travelingTo = normalizeId(
        statusSource?.travelingToLocation || statusSource?.$travelingToLocation
    );
    const effectiveLocation = isTraveling ? travelingTo : rawLocation;
    const parsed = parseLocation(effectiveLocation);
    const locationStatus = normalizeLocationStatus(effectiveLocation);

    let variant: UserHoverCardVariant;
    if (!hasPresence) {
        variant = 'profile-only';
    } else if (state === 'offline') {
        variant = 'offline';
    } else if (parsed.isRealInstance || (isTraveling && parsed.worldId)) {
        variant = 'in-instance';
    } else if (parsed.isPrivate || locationStatus === 'private') {
        variant = 'private';
    } else if (state === 'active') {
        variant = 'active';
    } else {
        variant = 'private';
    }

    const statusKey =
        hasPresence && state !== 'offline'
            ? statusKeyFromPresence(
                  profileRecord?.status || statusSource?.status,
                  state
              )
            : '';
    const statusDotClassName = hasPresence
        ? resolveSidebarStatusDotClassName(seedRecord, null, false, {
              hideNonFriend: false
          })
        : '';
    const { trustSource, trustKey } = resolveTrust(identity);

    return {
        variant,
        displayName:
            identity?.displayName ||
            identity?.username ||
            ref?.displayName ||
            normalizeId(identity?.id) ||
            'Unknown',
        avatarUrl: userImage(identity, true, '128'),
        avatarPreviewUrl: userImage(identity, false),
        userColour: identity?.$userColour || '',
        trustSource,
        trustKey,
        statusKey,
        statusDotClassName,
        statusDescription: String(
            profileRecord?.statusDescription || ref?.statusDescription || ''
        ).trim(),
        note: String(profileRecord?.note || '').trim(),
        onlineForMs: estimatedOnlineMs(state, identity?.last_login, nowMs),
        instanceEpoch:
            variant === 'in-instance'
                ? timestampMsFromValue(
                      readFriendInstanceEpoch(statusSource, isTraveling)
                  )
                : 0,
        lastOnlineAgoMs:
            variant === 'offline'
                ? (() => {
                      const lastLoginMs = timestampMsFromValue(
                          identity?.last_login
                      );
                      return lastLoginMs && lastLoginMs <= nowMs
                          ? nowMs - lastLoginMs
                          : 0;
                  })()
                : 0,
        location: {
            effectiveLocation,
            worldId: normalizeId(parsed.worldId),
            instanceId: normalizeId(parsed.instanceId),
            tag: normalizeId(parsed.tag),
            accessTypeName: parsed.accessTypeName || '',
            isRealInstance: Boolean(parsed.isRealInstance),
            isTraveling
        }
    };
}
