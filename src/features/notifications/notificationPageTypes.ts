import type { NotificationRow } from '@/repositories/notificationPersistenceRepository';
import type { LoadStatus } from '@/state/vrcNotificationStore';

export type { NotificationRow };
export type NotificationLoadStatus = LoadStatus;

export type NotificationDialogRequest = {
    notification: NotificationRow;
    messageType?: string;
} | null;
