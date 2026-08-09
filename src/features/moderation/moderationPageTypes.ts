export type ModerationLoadStatus = 'idle' | 'running' | 'ready' | 'error';

export type ModerationRow = {
    id?: string;
    type?: string;
    sourceUserId?: string;
    sourceDisplayName?: string;
    targetUserId?: string;
    targetDisplayName?: string;
    created?: string;
};

export type ModerationPaginationState = {
    pageIndex: number;
    pageSize: number;
};

export type ModerationUserTarget = {
    userId?: string;
    title?: string;
};

export type DeleteModerationOptions = {
    skipConfirm?: boolean;
};
