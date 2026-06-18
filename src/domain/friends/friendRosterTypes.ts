type FriendRosterBucket = 'online' | 'active' | 'offline';

type FriendRosterDerivedField =
    | '$trustLevel'
    | '$trustClass'
    | '$trustSortNum'
    | '$isModerator'
    | '$isTroll'
    | '$isProbableTroll'
    | '$platform';

type FriendRosterDerivedFields = Partial<
    Record<FriendRosterDerivedField, unknown>
>;

type FriendRosterFactPatch = FriendRosterDerivedFields;

type FriendRosterRecord = Record<string, unknown> &
    FriendRosterFactPatch & {
        id?: unknown;
        userId?: unknown;
        displayName?: unknown;
        username?: unknown;
        tags?: unknown;
        developerType?: unknown;
        platform?: unknown;
        last_platform?: unknown;
        lastPlatform?: unknown;
        location?: unknown;
        travelingToLocation?: unknown;
        worldId?: unknown;
        state?: unknown;
        stateBucket?: unknown;
        trustLevel?: unknown;
        friendNumber?: unknown;
        $friendNumber?: unknown;
        pendingOffline?: unknown;
        status?: unknown;
        statusDescription?: unknown;
        bio?: unknown;
    };

export type {
    FriendRosterBucket,
    FriendRosterDerivedField,
    FriendRosterDerivedFields,
    FriendRosterFactPatch,
    FriendRosterRecord
};
