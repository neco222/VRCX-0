import {
    commands,
    type LocalModerationOutput
} from '@/platform/tauri/bindings';

interface LocalModerationQueryInput {
    ownerUserId?: unknown;
    userId?: unknown;
}

function normalizeUserId(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

async function getAllLocalModerations(ownerUserId: unknown) {
    const normalizedOwnerUserId = normalizeUserId(ownerUserId);
    if (!normalizedOwnerUserId) {
        return [];
    }

    const rows = await commands.appLocalModerationList(normalizedOwnerUserId);
    return rows.map((row) => ({
        userId: row.userId,
        updatedAt: row.updatedAt,
        displayName: row.displayName,
        block: row.block,
        mute: row.mute
    }));
}

async function getLocalModerationRow(
    ownerUserId: unknown,
    userId: unknown
): Promise<LocalModerationOutput | null> {
    const normalizedOwnerUserId = normalizeUserId(ownerUserId);
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedOwnerUserId || !normalizedUserId) {
        return null;
    }

    const row = await commands.appLocalModerationGet(
        normalizedOwnerUserId,
        normalizedUserId
    );
    if (!row) {
        return null;
    }
    return row;
}

async function getLocalModeration({
    ownerUserId = '',
    userId
}: LocalModerationQueryInput = {}) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
        return {
            userId: '',
            block: false,
            mute: false
        };
    }

    const row = await getLocalModerationRow(ownerUserId, normalizedUserId);
    return {
        userId: normalizedUserId,
        block: Boolean(row?.block),
        mute: Boolean(row?.mute)
    };
}

const vrchatModerationRepository = Object.freeze({
    getAllLocalModerations,
    getLocalModeration
});

export { getAllLocalModerations, getLocalModeration };
export default vrchatModerationRepository;
