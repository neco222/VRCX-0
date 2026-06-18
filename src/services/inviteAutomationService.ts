import { commands } from '@/platform/tauri/bindings';
import configRepository from '@/repositories/configRepository';
import notificationPersistenceRepository from '@/repositories/notificationPersistenceRepository';
import vrchatSearchRepository from '@/repositories/vrchatSearchRepository';
import { checkCanInvite } from '@/shared/utils/invite';
import { parseLocation } from '@/shared/utils/locationParser';
import { useFavoriteStore } from '@/state/favoriteStore';
import { useRuntimeStore } from '@/state/runtimeStore';
import { useVrcNotificationStore } from '@/state/vrcNotificationStore';

const AUTO_ACCEPT_OFF = 'Off';
const AUTO_ACCEPT_ALL_FAVORITES = 'All Favorites';
const AUTO_ACCEPT_SELECTED_FAVORITES = 'Selected Favorites';
const DEFAULT_AUTO_INVITE_SENDER_COOLDOWN_MS = 10 * 60 * 1000;

const senderCooldowns = new Map<string, number>();
const pendingSenderInvites = new Set<string>();

type UnknownRecord = Record<string, unknown>;
type AutoAcceptMode =
    | typeof AUTO_ACCEPT_OFF
    | typeof AUTO_ACCEPT_ALL_FAVORITES
    | typeof AUTO_ACCEPT_SELECTED_FAVORITES;
type LocalFavoriteGroups = Record<string, string[]>;

export type InviteAutomationNotification = {
    id?: string;
    type?: string;
    senderUserId?: string;
    version?: number;
};

type RuntimeGameState = {
    isGameRunning?: boolean;
    currentLocation?: unknown;
};

type CurrentInviteScope = {
    endpoint: string;
    currentUserId: string;
};

type SenderAllowlistInput = {
    senderUserId: string;
    mode: AutoAcceptMode;
    selectedGroups: string[];
};

type CurrentInviteValidationInput = CurrentInviteScope & {
    expectedLocation?: string;
};

type CurrentInviteValidation =
    | {
          valid: true;
          currentInviteLocation: string;
          parsedLocation: ReturnType<typeof parseLocation>;
      }
    | {
          valid: false;
          reason: string;
      };

type SendInviteForRequestInput = CurrentInviteScope & {
    notification: InviteAutomationNotification;
    currentInviteLocation: string;
    parsedLocation: ReturnType<typeof parseLocation>;
};

type CleanupInviteNotificationInput = CurrentInviteScope & {
    notification: InviteAutomationNotification;
    senderUserId: string;
};

type ExpireNotificationInput = {
    userId: string;
    notification: InviteAutomationNotification;
};

type SendInviteResult =
    | {
          sent: true;
      }
    | {
          sent: false;
          reason: string;
      };

export type InviteAutomationResult = {
    handled: boolean;
    reason: string;
    senderUserId?: string;
    notificationId?: string;
};

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function safeJsonStringArray(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) {
        return value as string[];
    }
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? (parsed as string[]) : fallback;
    } catch {
        return fallback;
    }
}

function normalizeAutoAcceptMode(value: unknown): AutoAcceptMode {
    if (
        value === true ||
        value === 'true' ||
        value === AUTO_ACCEPT_ALL_FAVORITES
    ) {
        return AUTO_ACCEPT_ALL_FAVORITES;
    }
    if (value === AUTO_ACCEPT_SELECTED_FAVORITES) {
        return AUTO_ACCEPT_SELECTED_FAVORITES;
    }
    return AUTO_ACCEPT_OFF;
}

function getCachedInstanceLocation(instance: unknown) {
    const record = isRecord(instance) ? instance : {};
    return String(
        record.location ||
            record.$location ||
            record.instanceLocation ||
            record.instanceId ||
            ''
    ).trim();
}

function buildCachedInstanceMap(instances: unknown) {
    const map = new Map<string, unknown>();
    for (const instance of Array.isArray(instances) ? instances : []) {
        const location = getCachedInstanceLocation(instance);
        if (location) {
            const record = instance as UnknownRecord;
            map.set(location, record.instance || instance);
        }
    }
    return map;
}

function resolveCurrentInviteLocation(gameState?: RuntimeGameState) {
    const currentLocation = String(gameState?.currentLocation || '').trim();
    return currentLocation && currentLocation !== 'traveling'
        ? currentLocation
        : '';
}

function isCurrentInviteScope({ endpoint, currentUserId }: CurrentInviteScope) {
    const auth = useRuntimeStore.getState().auth;
    const authCurrentUserId =
        auth.currentUserId || auth.currentUserSnapshot?.id || '';
    return (
        String(auth.currentUserEndpoint || '') === String(endpoint || '') &&
        String(authCurrentUserId) === String(currentUserId || '')
    );
}

function isUserInLocalGroups(
    userId: string,
    localFriendFavorites: LocalFavoriteGroups,
    groupNames: string[] = []
) {
    const localGroups = groupNames?.length
        ? groupNames
        : Object.keys(localFriendFavorites || {});
    for (const groupName of localGroups) {
        const ids = localFriendFavorites?.[groupName];
        if (Array.isArray(ids) && ids.includes(userId)) {
            return true;
        }
    }
    return false;
}

function isSenderAllowed({
    senderUserId,
    mode,
    selectedGroups
}: SenderAllowlistInput) {
    if (!senderUserId || mode === AUTO_ACCEPT_OFF) {
        return false;
    }

    const favoriteState = useFavoriteStore.getState();
    if (mode === AUTO_ACCEPT_ALL_FAVORITES) {
        return (
            favoriteState.favoriteFriendIds.includes(senderUserId) ||
            isUserInLocalGroups(
                senderUserId,
                favoriteState.localFriendFavorites
            )
        );
    }

    for (const groupKey of selectedGroups) {
        if (groupKey.startsWith('local:')) {
            const groupName = groupKey.slice(6);
            if (
                isUserInLocalGroups(
                    senderUserId,
                    favoriteState.localFriendFavorites,
                    [groupName]
                )
            ) {
                return true;
            }
            continue;
        }

        const remoteIds =
            favoriteState.groupedFavoriteFriendIdsByGroupKey[groupKey] || [];
        if (remoteIds.includes(senderUserId)) {
            return true;
        }
    }

    return false;
}

function buildSenderScopeKey({
    endpoint,
    currentUserId,
    senderUserId
}: CurrentInviteScope & { senderUserId: string }) {
    return [endpoint || '', currentUserId || '', senderUserId || ''].join(':');
}

function isSenderCoolingDown(senderScopeKey: string, nowMs: number) {
    const lastSentAt = senderCooldowns.get(senderScopeKey) || 0;
    return nowMs - lastSentAt < DEFAULT_AUTO_INVITE_SENDER_COOLDOWN_MS;
}

function validateCurrentInviteLocation({
    endpoint,
    currentUserId,
    expectedLocation = ''
}: CurrentInviteValidationInput): CurrentInviteValidation {
    if (!isCurrentInviteScope({ endpoint, currentUserId })) {
        return { valid: false, reason: 'auth-context-changed' };
    }

    const runtimeState = useRuntimeStore.getState();
    if (!runtimeState.gameState?.isGameRunning) {
        return { valid: false, reason: 'game-not-running' };
    }

    const currentInviteLocation = resolveCurrentInviteLocation(
        runtimeState.gameState
    );
    if (!currentInviteLocation) {
        return {
            valid: false,
            reason: 'missing-current-session-or-location'
        };
    }
    if (expectedLocation && currentInviteLocation !== expectedLocation) {
        return { valid: false, reason: 'current-location-changed' };
    }

    const groupInstances =
        runtimeState.groupInstances.userId === currentUserId &&
        runtimeState.groupInstances.endpoint === endpoint
            ? runtimeState.groupInstances.instances
            : [];
    const cachedInstances = buildCachedInstanceMap(groupInstances);
    const canInviteFromCurrentLocation = checkCanInvite(currentInviteLocation, {
        currentUserId,
        lastLocationStr: resolveCurrentInviteLocation(runtimeState.gameState),
        cachedInstances
    });
    if (!canInviteFromCurrentLocation) {
        return { valid: false, reason: 'current-location-not-invitable' };
    }

    const parsedLocation = parseLocation(currentInviteLocation);
    if (!parsedLocation.worldId || !parsedLocation.instanceId) {
        return { valid: false, reason: 'current-location-not-concrete' };
    }

    return {
        valid: true,
        currentInviteLocation,
        parsedLocation
    };
}

async function expireNotificationLocally({
    userId,
    notification
}: ExpireNotificationInput) {
    if (!userId || !notification?.id) {
        return;
    }
    await commands.appExpireRealtimeNotification(userId, notification.id);
    const store = useVrcNotificationStore.getState();
    store.expireNotifications(notification.id);
    store.markNotificationsSeen(notification.id);
}

async function cleanupHandledInviteRequestNotification({
    currentUserId,
    endpoint,
    notification,
    senderUserId
}: CleanupInviteNotificationInput) {
    let cleanupFailed = false;

    try {
        await notificationPersistenceRepository.hideRemoteNotification({
            id: notification.id,
            version: notification.version,
            type: notification.type,
            senderUserId,
            endpoint
        });
    } catch (error) {
        cleanupFailed = true;
        console.warn(
            'Failed to hide handled invite request notification:',
            error
        );
    }

    try {
        await expireNotificationLocally({
            userId: currentUserId,
            notification
        });
    } catch (error) {
        cleanupFailed = true;
        console.warn(
            'Failed to expire handled invite request notification locally:',
            error
        );
    }

    return cleanupFailed ? 'invite-sent-cleanup-failed' : 'invite-sent';
}

async function sendInviteForRequest({
    notification,
    endpoint,
    currentUserId,
    currentInviteLocation,
    parsedLocation
}: SendInviteForRequestInput): Promise<SendInviteResult> {
    const worldResponse = await vrchatSearchRepository.getWorlds(
        {},
        parsedLocation.worldId,
        { endpoint }
    );
    const currentLocationValidation = validateCurrentInviteLocation({
        endpoint,
        currentUserId,
        expectedLocation: currentInviteLocation
    });
    if (currentLocationValidation.valid === false) {
        return { sent: false, reason: currentLocationValidation.reason };
    }
    const worldJson = isRecord(worldResponse.json) ? worldResponse.json : {};
    await notificationPersistenceRepository.sendInvite({
        receiverUserId: normalizeText(notification.senderUserId),
        endpoint,
        params: {
            instanceId: currentInviteLocation,
            worldId: parsedLocation.worldId,
            worldName: normalizeText(worldJson.name) || parsedLocation.worldId,
            rsvp: true
        }
    });
    return { sent: true };
}

export async function handleInviteAutomationNotification(
    notification: InviteAutomationNotification
): Promise<InviteAutomationResult> {
    if (notification?.type !== 'requestInvite') {
        return { handled: false, reason: 'not-request-invite' };
    }

    const senderUserId = normalizeText(notification.senderUserId);
    const notificationId = normalizeText(notification.id);
    if (!notificationId || !senderUserId) {
        return { handled: false, reason: 'missing-notification-or-sender' };
    }

    const mode = normalizeAutoAcceptMode(
        await configRepository.getString(
            'autoAcceptInviteRequests',
            AUTO_ACCEPT_OFF
        )
    );
    if (mode === AUTO_ACCEPT_OFF) {
        return { handled: false, reason: 'disabled' };
    }

    const selectedGroups = safeJsonStringArray(
        await configRepository.getString('autoAcceptInviteGroups', '[]'),
        []
    );
    if (!isSenderAllowed({ senderUserId, mode, selectedGroups })) {
        return { handled: false, reason: 'sender-not-allowlisted' };
    }

    const runtimeState = useRuntimeStore.getState();
    const auth = runtimeState.auth;
    if (!runtimeState.gameState?.isGameRunning) {
        return { handled: false, reason: 'game-not-running' };
    }

    const currentUserId = normalizeText(
        auth.currentUserId || auth.currentUserSnapshot?.id
    );
    const endpoint = normalizeText(auth.currentUserEndpoint);
    const currentInviteLocation = resolveCurrentInviteLocation(
        runtimeState.gameState
    );
    if (!currentUserId || !currentInviteLocation) {
        return {
            handled: false,
            reason: 'missing-current-session-or-location'
        };
    }

    const nowMs = Date.now();
    const senderScopeKey = buildSenderScopeKey({
        endpoint,
        currentUserId,
        senderUserId
    });
    if (isSenderCoolingDown(senderScopeKey, nowMs)) {
        return { handled: false, reason: 'sender-cooldown' };
    }
    if (pendingSenderInvites.has(senderScopeKey)) {
        return { handled: false, reason: 'sender-invite-pending' };
    }

    const currentLocationValidation = validateCurrentInviteLocation({
        endpoint,
        currentUserId,
        expectedLocation: currentInviteLocation
    });
    if (currentLocationValidation.valid === false) {
        return {
            handled: false,
            reason: currentLocationValidation.reason
        };
    }

    pendingSenderInvites.add(senderScopeKey);
    try {
        if (!isCurrentInviteScope({ endpoint, currentUserId })) {
            return { handled: false, reason: 'auth-context-changed' };
        }
        const sendResult = await sendInviteForRequest({
            notification,
            endpoint,
            currentUserId,
            currentInviteLocation,
            parsedLocation: currentLocationValidation.parsedLocation
        });
        if (sendResult.sent === false) {
            return { handled: false, reason: sendResult.reason };
        }
        senderCooldowns.set(senderScopeKey, nowMs);
        if (!isCurrentInviteScope({ endpoint, currentUserId })) {
            return {
                handled: true,
                reason: 'invite-sent-auth-context-changed',
                senderUserId,
                notificationId
            };
        }

        const cleanupReason = await cleanupHandledInviteRequestNotification({
            currentUserId,
            endpoint,
            notification,
            senderUserId
        });
        return {
            handled: true,
            reason: cleanupReason,
            senderUserId,
            notificationId
        };
    } finally {
        pendingSenderInvites.delete(senderScopeKey);
    }
}

export function resetInviteAutomationService() {
    senderCooldowns.clear();
    pendingSenderInvites.clear();
}
