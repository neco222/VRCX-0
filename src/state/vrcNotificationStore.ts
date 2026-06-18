import { create } from 'zustand';

import notificationPersistenceRepository from '@/repositories/notificationPersistenceRepository';
import {
    getNotificationCategory,
    getNotificationTs
} from '@/shared/utils/notificationCategory';
import { useRuntimeStore } from '@/state/runtimeStore';
import { useShellStore } from '@/state/shellStore';

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRANSIENT_V1_UNSEEN_TYPES = new Set(['friendRequest']);
const ACTION_REQUIRED_V1_TYPES = new Set(['friendRequest']);
const pendingSeenIds = new Set<string>();

type LoadStatus = 'idle' | 'running' | 'ready' | 'error';
type NotificationCategoryKey = 'friend' | 'group' | 'other';
type NotificationRow = Record<string, unknown> & {
    id?: string;
    version?: number;
    seen?: boolean;
    expired?: boolean;
    $isExpired?: boolean;
    expiresAt?: string;
    created_at?: string | number | null;
    createdAt?: string | number | null;
    type?: string;
};
type NotificationBucket = {
    unseen: NotificationRow[];
    recent: NotificationRow[];
};
type NotificationCategories = Record<
    NotificationCategoryKey,
    NotificationBucket
>;
type RuntimeAuthSnapshot = {
    currentUserId?: string | null;
    currentUserEndpoint?: string;
};
type VrcNotificationStore = {
    rows: NotificationRow[];
    categories: NotificationCategories;
    unseenCount: number;
    isCenterOpen: boolean;
    loadStatus: LoadStatus;
    detail: string;
    loadForCurrentUser(): Promise<NotificationRow[]>;
    setCenterOpen(isCenterOpen: unknown): void;
    openCenter(): void;
    upsertNotification(notification: NotificationRow): void;
    expireNotifications(ids: unknown | unknown[]): void;
    markNotificationsSeen(ids: unknown | unknown[]): void;
    markNotificationSeen(notification?: NotificationRow | null): Promise<void>;
    markAllSeen(): Promise<void>;
    resetVrcNotificationState(): void;
};

function isNotificationExpired(notification?: NotificationRow | null): boolean {
    if (notification?.$isExpired !== undefined) {
        return Boolean(notification.$isExpired);
    }
    if (notification?.expired !== undefined) {
        return Boolean(notification.expired);
    }
    if (!notification?.expiresAt) {
        return false;
    }
    const expiresAt = Date.parse(notification.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function isUnseenNotification(notification?: NotificationRow | null): boolean {
    const version = Number(notification?.version ?? 1);
    const type = String(notification?.type || '');
    const isTransientV1Unseen =
        version !== 2 &&
        TRANSIENT_V1_UNSEEN_TYPES.has(type) &&
        getNotificationTs(notification) > Date.now() - RECENT_WINDOW_MS;
    return (
        (version === 2 || isTransientV1Unseen) &&
        notification.seen === false &&
        !isNotificationExpired(notification)
    );
}

function shouldMarkSeenOnCenterClose(
    notification?: NotificationRow | null
): boolean {
    const version = Number(notification?.version ?? 1);
    const type = String(notification?.type || '');
    return !(version !== 2 && ACTION_REQUIRED_V1_TYPES.has(type));
}

function createEmptyCategories(): NotificationCategories {
    return {
        friend: { unseen: [], recent: [] },
        group: { unseen: [], recent: [] },
        other: { unseen: [], recent: [] }
    };
}

function buildCategories(rows: NotificationRow[]): NotificationCategories {
    const categories = createEmptyCategories();
    const recentCutoff = Date.now() - RECENT_WINDOW_MS;

    for (const notification of Array.isArray(rows) ? rows : []) {
        const category = getNotificationCategory(notification?.type as string);
        const bucket = categories[category] || categories.other;
        if (isUnseenNotification(notification)) {
            bucket.unseen.push(notification);
            continue;
        }
        if (
            !isNotificationExpired(notification) &&
            getNotificationTs(notification) > recentCutoff
        ) {
            bucket.recent.push(notification);
        }
    }

    for (const bucket of Object.values(categories)) {
        bucket.unseen.sort(
            (left: NotificationRow, right: NotificationRow) =>
                getNotificationTs(right) - getNotificationTs(left)
        );
        bucket.recent.sort(
            (left: NotificationRow, right: NotificationRow) =>
                getNotificationTs(right) - getNotificationTs(left)
        );
    }

    return categories;
}

function isNotificationRow(value: unknown): value is NotificationRow {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeNotificationId(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function toNotificationRows(rows: unknown): NotificationRow[] {
    return Array.isArray(rows) ? rows.filter(isNotificationRow) : [];
}

function toNotificationIdSet(ids: unknown | unknown[]): Set<string> {
    return new Set(
        (Array.isArray(ids) ? ids : [ids])
            .map(normalizeNotificationId)
            .filter(Boolean)
    );
}

function sortRows(rows: unknown): NotificationRow[] {
    return [...toNotificationRows(rows)].sort(
        (left: NotificationRow, right: NotificationRow) => {
            const leftTime = getNotificationTs(left);
            const rightTime = getNotificationTs(right);
            if (leftTime !== rightTime) {
                return rightTime - leftTime;
            }
            return String(right?.id || '').localeCompare(
                String(left?.id || '')
            );
        }
    );
}

function createNotificationState(rows: unknown, detail = '') {
    const sortedRows = sortRows(rows);
    return {
        rows: sortedRows,
        categories: buildCategories(sortedRows),
        unseenCount: getUnseenRows(sortedRows).length,
        detail
    };
}

function getCurrentAuth(): RuntimeAuthSnapshot {
    return (useRuntimeStore.getState().auth || {}) as RuntimeAuthSnapshot;
}

function getUnseenRows(rows: unknown): NotificationRow[] {
    return toNotificationRows(rows).filter(isUnseenNotification);
}

function applyPendingSeenRows(rows: NotificationRow[]): NotificationRow[] {
    if (!pendingSeenIds.size) {
        return rows;
    }
    return rows.map((row) =>
        pendingSeenIds.has(normalizeNotificationId(row.id))
            ? {
                  ...row,
                  seen: true
              }
            : row
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function syncShellUnseenCount(unseenCount: number) {
    useShellStore.getState().setVrcUnseenNotificationCount(unseenCount);
}

export const useVrcNotificationStore = create<VrcNotificationStore>(
    (set, get) => ({
        rows: [],
        categories: createEmptyCategories(),
        unseenCount: 0,
        isCenterOpen: false,
        loadStatus: 'idle',
        detail: '',
        async loadForCurrentUser() {
            const auth = getCurrentAuth();
            if (!auth.currentUserId) {
                set({
                    rows: [],
                    categories: createEmptyCategories(),
                    unseenCount: 0,
                    loadStatus: 'idle',
                    detail: 'No current user session is available.'
                });
                syncShellUnseenCount(0);
                return [];
            }

            set({ loadStatus: 'running', detail: '' });
            try {
                const rows = applyPendingSeenRows(
                    await notificationPersistenceRepository.queryNotifications({
                        userId: auth.currentUserId
                    })
                );
                set({
                    ...createNotificationState(rows),
                    loadStatus: 'ready'
                });
                syncShellUnseenCount(get().unseenCount);
                return rows;
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Failed to load VRChat notifications.';
                set({
                    rows: [],
                    categories: createEmptyCategories(),
                    unseenCount: 0,
                    loadStatus: 'error',
                    detail: message
                });
                syncShellUnseenCount(0);
                throw error;
            }
        },
        setCenterOpen(isCenterOpen: unknown) {
            const nextOpen = Boolean(isCenterOpen);
            set({ isCenterOpen: nextOpen });
            if (nextOpen) {
                get()
                    .loadForCurrentUser()
                    .catch(() => {});
            }
        },
        openCenter() {
            get().setCenterOpen(true);
        },
        upsertNotification(notification: NotificationRow) {
            if (!notification?.id) {
                return;
            }
            set((state) => {
                const existing =
                    state.rows.find((row) => row.id === notification.id) || {};
                const rows = [
                    { ...existing, ...notification },
                    ...state.rows.filter((row) => row.id !== notification.id)
                ];
                return createNotificationState(rows, state.detail);
            });
            syncShellUnseenCount(get().unseenCount);
        },
        expireNotifications(ids: unknown | unknown[]) {
            const idSet = toNotificationIdSet(ids);
            if (!idSet.size) {
                return;
            }
            const expiresAt = new Date().toISOString();
            set((state) =>
                createNotificationState(
                    state.rows.map((row) =>
                        idSet.has(normalizeNotificationId(row.id))
                            ? {
                                  ...row,
                                  expiresAt,
                                  expired: true,
                                  seen: true
                              }
                            : row
                    ),
                    state.detail
                )
            );
            syncShellUnseenCount(get().unseenCount);
        },
        markNotificationsSeen(ids: unknown | unknown[]) {
            const idSet = toNotificationIdSet(ids);
            if (!idSet.size) {
                return;
            }
            set((state) =>
                createNotificationState(
                    state.rows.map((row) =>
                        idSet.has(normalizeNotificationId(row.id))
                            ? {
                                  ...row,
                                  seen: true
                              }
                            : row
                    ),
                    state.detail
                )
            );
            syncShellUnseenCount(get().unseenCount);
        },
        async markNotificationSeen(notification?: NotificationRow | null) {
            const auth = getCurrentAuth();
            if (
                !auth.currentUserId ||
                !notification?.id ||
                !isUnseenNotification(notification)
            ) {
                return;
            }
            await notificationPersistenceRepository.markSeen({
                userId: auth.currentUserId,
                id: notification.id,
                version: notification.version,
                endpoint: auth.currentUserEndpoint
            });
            get().markNotificationsSeen(notification.id);
            await get().loadForCurrentUser();
        },
        async markAllSeen() {
            const auth = getCurrentAuth();
            const unseenRows = getUnseenRows(get().rows);
            if (!auth.currentUserId || !unseenRows.length) {
                return;
            }

            const markableRows = unseenRows.filter(shouldMarkSeenOnCenterClose);
            const ids = markableRows
                .map((notification) => notification.id)
                .filter(Boolean);
            if (!ids.length) {
                return;
            }
            const localV2Ids = markableRows
                .filter((notification) => Number(notification.version) === 2)
                .map((notification) => notification.id)
                .filter(Boolean);
            for (const id of ids) {
                pendingSeenIds.add(id);
            }
            get().markNotificationsSeen(ids);
            try {
                await notificationPersistenceRepository.markSeenLocalBulk({
                    userId: auth.currentUserId,
                    ids: localV2Ids
                });
                for (const notification of markableRows) {
                    await notificationPersistenceRepository
                        .markSeen({
                            userId: auth.currentUserId,
                            id: notification.id,
                            version: notification.version,
                            endpoint: auth.currentUserEndpoint
                        })
                        .catch((error: unknown) => {
                            console.warn(
                                'Failed to mark VRChat notification as seen:',
                                error
                            );
                        });
                    await delay(250);
                }
                await get().loadForCurrentUser();
            } finally {
                for (const id of ids) {
                    pendingSeenIds.delete(id);
                }
            }
        },
        resetVrcNotificationState() {
            set({
                rows: [],
                categories: createEmptyCategories(),
                unseenCount: 0,
                isCenterOpen: false,
                loadStatus: 'idle',
                detail: ''
            });
            syncShellUnseenCount(0);
        }
    })
);
