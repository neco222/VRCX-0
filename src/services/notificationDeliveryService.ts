import { commands } from '@/platform/tauri/bindings';
import { getKnownUserFact } from '@/domain/users/userFactAccess';
import configRepository from '@/repositories/configRepository';
import memoPersistenceRepository from '@/repositories/memoPersistenceRepository';
import { userImage as resolveUserImageUrl } from '@/services/entityMediaService';
import { onPreferenceChanged } from '@/shared/events/preferenceEvents';
import { extractFileId, extractFileVersion } from '@/shared/utils/fileUtils';
import { useFriendRosterStore } from '@/state/friendRosterStore';
import { useRuntimeStore } from '@/state/runtimeStore';

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
    desktopToast: 'Never',
    afkDesktopToast: false,
    desktopNotificationSound: false,
    notificationTTS: 'Never',
    notificationTTSVoice: '0',
    notificationTTSNickName: false,
    xsNotifications: true,
    ovrtHudNotifications: true,
    ovrtWristNotifications: false,
    imageNotifications: true,
    notificationTimeout: 3000,
    notificationOpacity: 100
});

const NOTIFICATION_PREFERENCE_KEYS = Object.keys(
    DEFAULT_NOTIFICATION_PREFERENCES
);
type NotificationPreferenceKey = keyof typeof DEFAULT_NOTIFICATION_PREFERENCES;

const LEGACY_OVERLAY_NOTIFICATION_KEYS = Object.freeze({
    xsNotifications: 'VRCX-0_xsNotifications',
    ovrtHudNotifications: 'VRCX-0_ovrtHudNotifications',
    ovrtWristNotifications: 'VRCX-0_ovrtWristNotifications',
    imageNotifications: 'VRCX-0_imageNotifications',
    notificationTimeout: 'VRCX-0_notificationTimeout',
    notificationOpacity: 'VRCX-0_notificationOpacity'
});

interface NotificationDeliveryDirective {
    sourceId?: string;
    activityType?: string;
    desktop?: boolean;
    vr?: boolean;
    title?: string;
    body?: string;
    text?: string;
    imageUrl?: string;
    actorUserId?: string;
}

let cachedPreferences: Record<
    NotificationPreferenceKey,
    string | boolean | number
> = {
    ...DEFAULT_NOTIFICATION_PREFERENCES
};
let preferencesLoaded = false;
let preferencesLoadPromise: Promise<typeof cachedPreferences> | null = null;
let unsubscribePreferences: (() => void) | null = null;

function normalizeInteger(
    value: any,
    fallback: any,
    min: any = Number.MIN_SAFE_INTEGER,
    max: any = Number.MAX_SAFE_INTEGER
) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

function normalizeNotificationPreference(
    key: NotificationPreferenceKey,
    value: unknown
) {
    switch (key) {
        case 'afkDesktopToast':
        case 'desktopNotificationSound':
        case 'notificationTTSNickName':
        case 'xsNotifications':
        case 'ovrtHudNotifications':
        case 'ovrtWristNotifications':
        case 'imageNotifications':
            return Boolean(value);
        case 'notificationTimeout':
            return normalizeInteger(value, 3000, 0, 600000);
        case 'notificationOpacity':
            return normalizeInteger(value, 100, 0, 100);
        default:
            return typeof value === 'string'
                ? value
                : String(value ?? DEFAULT_NOTIFICATION_PREFERENCES[key] ?? '');
    }
}

function getLegacyOverlayNotificationKey(key: string) {
    return LEGACY_OVERLAY_NOTIFICATION_KEYS[
        key as keyof typeof LEGACY_OVERLAY_NOTIFICATION_KEYS
    ];
}

async function getBoolPreferenceWithLegacy(key: string, defaultValue: boolean) {
    if ((await configRepository.getRawValue(key)) !== null) {
        return configRepository.getBool(key, defaultValue);
    }
    const legacyKey = getLegacyOverlayNotificationKey(key);
    if (legacyKey && (await configRepository.getRawValue(legacyKey)) !== null) {
        return configRepository.getBool(legacyKey, defaultValue);
    }
    return defaultValue;
}

async function getIntPreferenceWithLegacy(key: string, defaultValue: number) {
    if ((await configRepository.getRawValue(key)) !== null) {
        return configRepository.getInt(key, defaultValue);
    }
    const legacyKey = getLegacyOverlayNotificationKey(key);
    if (legacyKey && (await configRepository.getRawValue(legacyKey)) !== null) {
        return configRepository.getInt(legacyKey, defaultValue);
    }
    return defaultValue;
}

function initNotificationPreferenceSubscription() {
    if (unsubscribePreferences) {
        return;
    }
    unsubscribePreferences = onPreferenceChanged(
        NOTIFICATION_PREFERENCE_KEYS,
        (value: any, detail: any) => {
            const key = detail.normalizedKey as NotificationPreferenceKey;
            if (
                !Object.prototype.hasOwnProperty.call(
                    DEFAULT_NOTIFICATION_PREFERENCES,
                    key
                )
            ) {
                return;
            }
            cachedPreferences = {
                ...cachedPreferences,
                [key]: normalizeNotificationPreference(key, value)
            };
        }
    );
}

async function loadNotificationPreferences() {
    initNotificationPreferenceSubscription();
    if (preferencesLoaded) {
        return cachedPreferences;
    }
    if (!preferencesLoadPromise) {
        preferencesLoadPromise = Promise.all([
            configRepository.getString(
                'desktopToast',
                DEFAULT_NOTIFICATION_PREFERENCES.desktopToast
            ),
            configRepository.getBool(
                'afkDesktopToast',
                DEFAULT_NOTIFICATION_PREFERENCES.afkDesktopToast
            ),
            configRepository.getBool(
                'desktopNotificationSound',
                DEFAULT_NOTIFICATION_PREFERENCES.desktopNotificationSound
            ),
            configRepository.getString(
                'notificationTTS',
                DEFAULT_NOTIFICATION_PREFERENCES.notificationTTS
            ),
            configRepository.getString(
                'notificationTTSVoice',
                DEFAULT_NOTIFICATION_PREFERENCES.notificationTTSVoice
            ),
            configRepository.getBool(
                'notificationTTSNickName',
                DEFAULT_NOTIFICATION_PREFERENCES.notificationTTSNickName
            ),
            getBoolPreferenceWithLegacy(
                'xsNotifications',
                DEFAULT_NOTIFICATION_PREFERENCES.xsNotifications
            ),
            getBoolPreferenceWithLegacy(
                'ovrtHudNotifications',
                DEFAULT_NOTIFICATION_PREFERENCES.ovrtHudNotifications
            ),
            getBoolPreferenceWithLegacy(
                'ovrtWristNotifications',
                DEFAULT_NOTIFICATION_PREFERENCES.ovrtWristNotifications
            ),
            getBoolPreferenceWithLegacy(
                'imageNotifications',
                DEFAULT_NOTIFICATION_PREFERENCES.imageNotifications
            ),
            getIntPreferenceWithLegacy(
                'notificationTimeout',
                DEFAULT_NOTIFICATION_PREFERENCES.notificationTimeout
            ),
            getIntPreferenceWithLegacy(
                'notificationOpacity',
                DEFAULT_NOTIFICATION_PREFERENCES.notificationOpacity
            )
        ])
            .then(
                ([
                    desktopToast,
                    afkDesktopToast,
                    desktopNotificationSound,
                    notificationTTS,
                    notificationTTSVoice,
                    notificationTTSNickName,
                    xsNotifications,
                    ovrtHudNotifications,
                    ovrtWristNotifications,
                    imageNotifications,
                    notificationTimeout,
                    notificationOpacity
                ]: any) => {
                    cachedPreferences = {
                        desktopToast,
                        afkDesktopToast,
                        desktopNotificationSound,
                        notificationTTS,
                        notificationTTSVoice,
                        notificationTTSNickName,
                        xsNotifications,
                        ovrtHudNotifications,
                        ovrtWristNotifications,
                        imageNotifications,
                        notificationTimeout,
                        notificationOpacity
                    };
                    preferencesLoaded = true;
                    preferencesLoadPromise = null;
                    return cachedPreferences;
                }
            )
            .catch(() => {
                cachedPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
                preferencesLoaded = true;
                preferencesLoadPromise = null;
                return cachedPreferences;
            });
    }
    return preferencesLoadPromise;
}

function shouldPlayForCondition(condition: any, gameState: any) {
    switch (condition) {
        case 'Always':
            return true;
        case 'Inside VR':
            return Boolean(gameState.isSteamVRRunning);
        case 'Outside VR':
            return !gameState.isSteamVRRunning;
        case 'Game Closed':
            return !gameState.isGameRunning;
        case 'Game Running':
            return Boolean(gameState.isGameRunning);
        case 'Desktop Mode':
            return Boolean(gameState.isGameNoVR && gameState.isGameRunning);
        default:
            return false;
    }
}

function shouldPlayAfkDesktopToast(preferences: any, gameState: any) {
    return Boolean(
        preferences.afkDesktopToast &&
        gameState.isHmdAfk &&
        gameState.isGameRunning &&
        !gameState.isGameNoVR
    );
}

function speakNotification(text: any, preferences: any) {
    if (
        !text ||
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        !window.SpeechSynthesisUtterance
    ) {
        return;
    }
    const voices = window.speechSynthesis.getVoices();
    const utterance = new window.SpeechSynthesisUtterance();
    const voiceIndex = normalizeInteger(
        preferences.notificationTTSVoice,
        0,
        0,
        Math.max(0, voices.length - 1)
    );
    if (voices[voiceIndex]) {
        utterance.voice = voices[voiceIndex];
    }
    utterance.text = text;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

async function resolveTtsText(
    directive: NotificationDeliveryDirective,
    overlayText: string,
    title: string,
    preferences: any
) {
    if (
        !preferences.notificationTTSNickName ||
        !directive.actorUserId ||
        !title.trim()
    ) {
        return overlayText;
    }
    const memo = await memoPersistenceRepository
        .getUserMemo(directive.actorUserId)
        .catch(() => null);
    const nickName =
        typeof memo?.memo === 'string' ? memo.memo.split('\n')[0]?.trim() : '';
    if (!nickName) {
        return overlayText;
    }
    return overlayText.split(title).join(nickName);
}

async function resolveActorImageUrl(userId: unknown) {
    const id = String(userId ?? '').trim();
    if (!id || id.startsWith('grp_')) {
        return '';
    }
    const runtimeState = useRuntimeStore.getState();
    const endpoint = runtimeState.auth.currentUserEndpoint;
    const currentUserSnapshot = runtimeState.auth.currentUserSnapshot;
    const user =
        (String(currentUserSnapshot?.id || '') === id
            ? currentUserSnapshot
            : null) ||
        useFriendRosterStore.getState().friendsById?.[id] ||
        getKnownUserFact(endpoint, id);
    return resolveUserImageUrl(user, true, '128');
}

async function resolveDeliveryImage(directive: NotificationDeliveryDirective) {
    const imageUrl =
        (typeof directive.imageUrl === 'string' && directive.imageUrl) ||
        (await resolveActorImageUrl(directive.actorUserId));
    if (!imageUrl || !String(imageUrl).startsWith('http')) {
        return '';
    }
    try {
        let fileId = extractFileId(imageUrl);
        let fileVersion = extractFileVersion(imageUrl);
        if (!fileId || !fileVersion) {
            fileVersion = String(imageUrl).split('/').pop() || '';
            fileId = fileVersion.split('.').shift() || '';
        }
        if (!fileId || !fileVersion) {
            return '';
        }
        return await commands.appGetImage(imageUrl, fileId, fileVersion);
    } catch (error) {
        console.warn('Failed to resolve notification image:', error);
        return '';
    }
}

export async function executeNotificationDelivery(
    directive: NotificationDeliveryDirective
) {
    if (!directive || (!directive.desktop && !directive.vr)) {
        return;
    }
    const preferences: any = await loadNotificationPreferences();
    const gameState: any = useRuntimeStore.getState().gameState || {};

    const desktopAllowed = Boolean(directive.desktop);
    const vrAllowed = Boolean(directive.vr);

    const playDesktopToast =
        desktopAllowed &&
        (shouldPlayForCondition(preferences.desktopToast, gameState) ||
            shouldPlayAfkDesktopToast(preferences, gameState));
    const playVrNotification = vrAllowed && Boolean(gameState.isSteamVRRunning);
    const playXSNotification =
        playVrNotification && Boolean(preferences.xsNotifications);
    const playOvrtHudNotifications =
        playVrNotification && Boolean(preferences.ovrtHudNotifications);
    const playOvrtWristNotifications =
        playVrNotification && Boolean(preferences.ovrtWristNotifications);
    const playNotificationTTS =
        (desktopAllowed || vrAllowed) &&
        shouldPlayForCondition(preferences.notificationTTS, gameState);

    if (
        !playDesktopToast &&
        !playXSNotification &&
        !playOvrtHudNotifications &&
        !playOvrtWristNotifications &&
        !playNotificationTTS
    ) {
        return;
    }

    const title = String(directive.title ?? '');
    const body = String(directive.body ?? '');
    const overlayText =
        String(directive.text ?? '') || [title, body].filter(Boolean).join(' ');

    if (playNotificationTTS) {
        speakNotification(
            await resolveTtsText(directive, overlayText, title, preferences),
            preferences
        );
    }

    const playVisualNotification =
        playDesktopToast ||
        playXSNotification ||
        playOvrtHudNotifications ||
        playOvrtWristNotifications;
    if (!playVisualNotification) {
        return;
    }

    const image = preferences.imageNotifications
        ? await resolveDeliveryImage(directive)
        : '';
    const overlayTimeout = Math.floor(
        normalizeInteger(preferences.notificationTimeout, 3000, 0, 600000) /
            1000
    );
    const overlayOpacity =
        normalizeInteger(preferences.notificationOpacity, 100, 0, 100) / 100;

    const deliveries = [];
    if (playDesktopToast) {
        deliveries.push(
            commands.appDesktopNotification(
                title,
                body,
                image,
                Boolean(preferences.desktopNotificationSound)
            )
        );
    }
    if (playXSNotification) {
        deliveries.push(
            commands.appXsNotification(
                'VRCX',
                overlayText,
                overlayTimeout,
                overlayOpacity,
                image
            )
        );
    }
    if (playOvrtHudNotifications || playOvrtWristNotifications) {
        deliveries.push(
            commands.appOvrtNotification(
                playOvrtHudNotifications,
                playOvrtWristNotifications,
                'VRCX',
                overlayText,
                overlayTimeout,
                overlayOpacity,
                image
            )
        );
    }

    const results = await Promise.allSettled(deliveries);
    for (const result of results) {
        if (result.status === 'rejected') {
            console.warn('Notification delivery failed:', result.reason);
        }
    }
}
