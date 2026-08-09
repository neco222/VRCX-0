import {
    commands,
    type InstanceActivityRowOutput,
    type WorldSummaryOutput
} from '@/platform/tauri/bindings';
import { normalizeString } from '@/shared/utils/string';

interface InstanceActivityRow {
    id: number;
    created_at: string;
    type: string;
    display_name: string;
    location: string;
    user_id: string;
    time: number;
}

type WorldSummary = WorldSummaryOutput;

function normalizeInstanceActivityRow(
    row: InstanceActivityRowOutput
): InstanceActivityRow {
    return {
        id: row.id,
        created_at: row.createdAt,
        type: normalizeString(row.type),
        display_name: row.displayName,
        location: normalizeString(row.location),
        user_id: row.userId,
        time: Number(row?.time ?? 0) || 0
    };
}

async function getAvailableDates(userId: unknown): Promise<string[]> {
    const normalizedUserId = normalizeString(userId);
    if (!normalizedUserId) {
        return [];
    }

    const rows = await commands.appInstanceActivityDatesGet(normalizedUserId);
    return rows.filter(Boolean);
}

async function getInstanceActivityRows(
    startDate: string,
    endDate: string
): Promise<InstanceActivityRow[]> {
    const rows = await commands.appInstanceActivityRowsGet(startDate, endDate);

    return rows.map((row) => normalizeInstanceActivityRow(row));
}

async function getWorldSummariesByIds(
    worldIds: unknown
): Promise<Record<string, WorldSummary>> {
    const ids = Array.from(
        new Set(
            (Array.isArray(worldIds) ? worldIds : [])
                .map(normalizeString)
                .filter(Boolean)
        )
    );
    if (!ids.length) {
        return {};
    }

    const rows = await commands.appWorldSummariesGet(ids);

    const map: Record<string, WorldSummary> = {};
    for (const [worldId, row] of Object.entries(rows || {})) {
        if (!row) {
            continue;
        }
        const world = {
            ...row,
            id: row.id || worldId
        };
        if (!world.id) {
            continue;
        }
        map[world.id] = world;
    }

    return map;
}

const instanceActivityRepository = {
    getAvailableDates,
    getInstanceActivityRows,
    getWorldSummariesByIds
};

export { getAvailableDates, getInstanceActivityRows, getWorldSummariesByIds };
export default instanceActivityRepository;
