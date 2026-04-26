import sqliteRepository from './sqliteRepository.js';
import { normalizeUserTablePrefix } from './userSessionRepository.js';

interface SaveUserMemoInput {
    userId?: unknown;
    memo?: unknown;
}

interface SaveWorldMemoInput {
    worldId?: unknown;
    memo?: unknown;
}

interface SaveAvatarMemoInput {
    avatarId?: unknown;
    memo?: unknown;
}

interface UserMemoEntry {
    userId: unknown;
    editedAt: unknown;
    memo: unknown;
}

interface WorldMemoEntry {
    worldId: unknown;
    editedAt: unknown;
    memo: unknown;
}

interface AvatarMemoEntry {
    avatarId: unknown;
    editedAt: unknown;
    memo: unknown;
}

function normalizeEntityId(value: unknown) {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function createEmptyUserMemo(userId: unknown = '') {
    return {
        userId,
        editedAt: '',
        memo: ''
    };
}

function createEmptyWorldMemo(worldId: unknown = '') {
    return {
        worldId,
        editedAt: '',
        memo: ''
    };
}

function createEmptyAvatarMemo(avatarId: unknown = '') {
    return {
        avatarId,
        editedAt: '',
        memo: ''
    };
}

async function getUserMemo(userId: unknown) {
    const normalizedUserId = normalizeEntityId(userId);
    if (!normalizedUserId) {
        return createEmptyUserMemo();
    }

    let row: UserMemoEntry = createEmptyUserMemo(normalizedUserId);
    await sqliteRepository.execute<unknown[]>(
        (dbRow) => {
            row = {
                userId: dbRow[0],
                editedAt: dbRow[1],
                memo: dbRow[2]
            };
        },
        'SELECT user_id, edited_at, memo FROM memos WHERE user_id = @user_id',
        {
            '@user_id': normalizedUserId
        }
    );
    return row;
}

async function getAllUserMemos() {
    const rows: Array<{
        userId: unknown;
        memo: unknown;
    }> = [];
    await sqliteRepository.execute<unknown[]>((dbRow) => {
        rows.push({
            userId: dbRow[0],
            memo: dbRow[1]
        });
    }, 'SELECT user_id, memo FROM memos');
    return rows;
}

async function getAllUserNotes(ownerUserId: unknown = '') {
    const normalizedOwnerUserId = normalizeEntityId(ownerUserId);
    if (!normalizedOwnerUserId) {
        return [];
    }

    const userPrefix = normalizeUserTablePrefix(normalizedOwnerUserId);
    const rows: Array<{
        userId: unknown;
        displayName: unknown;
        note: unknown;
        createdAt: unknown;
    }> = [];
    await sqliteRepository.execute<unknown[]>((dbRow) => {
        rows.push({
            userId: dbRow[0],
            displayName: dbRow[1],
            note: dbRow[2],
            createdAt: dbRow[3]
        });
    }, `SELECT user_id, display_name, note, created_at FROM ${userPrefix}_notes`);
    return rows;
}

async function saveUserMemo({ userId, memo }: SaveUserMemoInput) {
    const normalizedUserId = normalizeEntityId(userId);
    if (!normalizedUserId) {
        throw new Error('MemoRepository.saveUserMemo requires a user id.');
    }

    const nextMemo = typeof memo === 'string' ? memo : '';
    if (!nextMemo) {
        await sqliteRepository.executeNonQuery(
            'DELETE FROM memos WHERE user_id = @user_id',
            {
                '@user_id': normalizedUserId
            }
        );
        return createEmptyUserMemo(normalizedUserId);
    }

    const entry = {
        userId: normalizedUserId,
        editedAt: new Date().toJSON(),
        memo: nextMemo
    };
    await sqliteRepository.executeNonQuery(
        'INSERT OR REPLACE INTO memos (user_id, edited_at, memo) VALUES (@user_id, @edited_at, @memo)',
        {
            '@user_id': entry.userId,
            '@edited_at': entry.editedAt,
            '@memo': entry.memo
        }
    );
    return entry;
}

async function getWorldMemo(worldId: unknown) {
    const normalizedWorldId = normalizeEntityId(worldId);
    if (!normalizedWorldId) {
        return createEmptyWorldMemo();
    }

    let row: WorldMemoEntry = createEmptyWorldMemo(normalizedWorldId);
    await sqliteRepository.execute<unknown[]>(
        (dbRow) => {
            row = {
                worldId: dbRow[0],
                editedAt: dbRow[1],
                memo: dbRow[2]
            };
        },
        'SELECT world_id, edited_at, memo FROM world_memos WHERE world_id = @world_id',
        {
            '@world_id': normalizedWorldId
        }
    );
    return row;
}

async function saveWorldMemo({ worldId, memo }: SaveWorldMemoInput) {
    const normalizedWorldId = normalizeEntityId(worldId);
    if (!normalizedWorldId) {
        throw new Error('MemoRepository.saveWorldMemo requires a world id.');
    }

    const nextMemo = typeof memo === 'string' ? memo : '';
    if (!nextMemo) {
        await sqliteRepository.executeNonQuery(
            'DELETE FROM world_memos WHERE world_id = @world_id',
            {
                '@world_id': normalizedWorldId
            }
        );
        return createEmptyWorldMemo(normalizedWorldId);
    }

    const entry = {
        worldId: normalizedWorldId,
        editedAt: new Date().toJSON(),
        memo: nextMemo
    };
    await sqliteRepository.executeNonQuery(
        'INSERT OR REPLACE INTO world_memos (world_id, edited_at, memo) VALUES (@world_id, @edited_at, @memo)',
        {
            '@world_id': entry.worldId,
            '@edited_at': entry.editedAt,
            '@memo': entry.memo
        }
    );
    return entry;
}

async function getAvatarMemo(avatarId: unknown) {
    const normalizedAvatarId = normalizeEntityId(avatarId);
    if (!normalizedAvatarId) {
        return createEmptyAvatarMemo();
    }

    let row: AvatarMemoEntry = createEmptyAvatarMemo(normalizedAvatarId);
    await sqliteRepository.execute<unknown[]>(
        (dbRow) => {
            row = {
                avatarId: dbRow[0],
                editedAt: dbRow[1],
                memo: dbRow[2]
            };
        },
        'SELECT avatar_id, edited_at, memo FROM avatar_memos WHERE avatar_id = @avatar_id',
        {
            '@avatar_id': normalizedAvatarId
        }
    );
    return row;
}

async function saveAvatarMemo({ avatarId, memo }: SaveAvatarMemoInput) {
    const normalizedAvatarId = normalizeEntityId(avatarId);
    if (!normalizedAvatarId) {
        throw new Error('MemoRepository.saveAvatarMemo requires an avatar id.');
    }

    const nextMemo = typeof memo === 'string' ? memo : '';
    if (!nextMemo) {
        await sqliteRepository.executeNonQuery(
            'DELETE FROM avatar_memos WHERE avatar_id = @avatar_id',
            {
                '@avatar_id': normalizedAvatarId
            }
        );
        return createEmptyAvatarMemo(normalizedAvatarId);
    }

    const entry = {
        avatarId: normalizedAvatarId,
        editedAt: new Date().toJSON(),
        memo: nextMemo
    };
    await sqliteRepository.executeNonQuery(
        'INSERT OR REPLACE INTO avatar_memos (avatar_id, edited_at, memo) VALUES (@avatar_id, @edited_at, @memo)',
        {
            '@avatar_id': entry.avatarId,
            '@edited_at': entry.editedAt,
            '@memo': entry.memo
        }
    );
    return entry;
}

const memoRepository = Object.freeze({
    createEmptyUserMemo,
    createEmptyWorldMemo,
    createEmptyAvatarMemo,
    getUserMemo,
    getAllUserMemos,
    getAllUserNotes,
    saveUserMemo,
    getWorldMemo,
    saveWorldMemo,
    getAvatarMemo,
    saveAvatarMemo
});

export {
    createEmptyUserMemo,
    createEmptyWorldMemo,
    createEmptyAvatarMemo,
    getUserMemo,
    getAllUserMemos,
    getAllUserNotes,
    saveUserMemo,
    getWorldMemo,
    saveWorldMemo,
    getAvatarMemo,
    saveAvatarMemo
};
export default memoRepository;
