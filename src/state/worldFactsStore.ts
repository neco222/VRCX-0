import { create } from 'zustand';

type WorldFactInput = Record<string, unknown> & {
    id?: unknown;
    worldId?: unknown;
    authorId?: unknown;
    authorName?: unknown;
    capacity?: unknown;
    createdAt?: unknown;
    created_at?: unknown;
    description?: unknown;
    favorites?: unknown;
    hasPersistData?: unknown;
    heat?: unknown;
    imageUrl?: unknown;
    isLabs?: unknown;
    name?: unknown;
    occupants?: unknown;
    platforms?: unknown;
    popularity?: unknown;
    publicationDate?: unknown;
    recommendedCapacity?: unknown;
    releaseStatus?: unknown;
    tags?: unknown;
    thumbnailImageUrl?: unknown;
    updatedAt?: unknown;
    updated_at?: unknown;
    version?: unknown;
    visits?: unknown;
};

type WorldFact = Record<string, unknown> & {
    id: string;
};

interface WorldFactsStoreState {
    version: number;
    worldsById: Record<string, WorldFact>;
    order: string[];
    upsertWorldFacts: (
        worlds: WorldFactInput | WorldFactInput[] | null | undefined
    ) => void;
    getWorldFact: (worldId: unknown) => WorldFact | null;
    resetWorldFacts: () => void;
}

const WORLD_FACTS_CAPACITY = 256;
const WORLD_FACT_SUMMARY_FIELDS = [
    'name',
    'description',
    'authorId',
    'authorName',
    'releaseStatus',
    'thumbnailImageUrl',
    'imageUrl',
    'capacity',
    'occupants',
    'recommendedCapacity',
    'favorites',
    'visits',
    'popularity',
    'heat',
    'tags',
    'isLabs',
    'createdAt',
    'updatedAt',
    'publicationDate',
    'platforms',
    'version',
    'hasPersistData',
    'created_at',
    'updated_at'
] as const;

type WorldFactSummaryField = (typeof WORLD_FACT_SUMMARY_FIELDS)[number];

const initialState: Pick<
    WorldFactsStoreState,
    'version' | 'worldsById' | 'order'
> = {
    version: 0,
    worldsById: {},
    order: []
};

function normalizeWorldId(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function worldIdFromFact(world: WorldFactInput): string {
    return normalizeWorldId(world?.id ?? world?.worldId);
}

function hasOwnField(
    world: WorldFactInput,
    field: WorldFactSummaryField
): boolean {
    return Object.prototype.hasOwnProperty.call(world, field);
}

function normalizeSummaryArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

function summaryValue(field: WorldFactSummaryField, value: unknown): unknown {
    if (field === 'tags' || field === 'platforms') {
        return normalizeSummaryArray(value);
    }

    return value;
}

function toWorldFactSummary(
    world: WorldFactInput | null | undefined
): WorldFact | null {
    if (!world || typeof world !== 'object') {
        return null;
    }

    const worldId = worldIdFromFact(world);
    if (!worldId) {
        return null;
    }

    const summary: WorldFact = { id: worldId };
    for (const field of WORLD_FACT_SUMMARY_FIELDS) {
        if (!hasOwnField(world, field)) {
            continue;
        }
        const value = world[field];
        if (value !== undefined) {
            summary[field] = summaryValue(field, value);
        }
    }

    if (
        !hasOwnField(summary, 'created_at') &&
        summary.createdAt !== undefined
    ) {
        summary.created_at = summary.createdAt;
    }
    if (
        !hasOwnField(summary, 'updated_at') &&
        summary.updatedAt !== undefined
    ) {
        summary.updated_at = summary.updatedAt;
    }

    return summary;
}

export const useWorldFactsStore = create<WorldFactsStoreState>((set, get) => ({
    ...initialState,
    upsertWorldFacts(worlds) {
        const list = Array.isArray(worlds) ? worlds : [worlds];
        set((state) => {
            let changed = false;
            let worldsById = state.worldsById;
            let order = state.order;
            for (const world of list) {
                const summary = toWorldFactSummary(world);
                if (!summary) {
                    continue;
                }
                const worldId = summary.id;
                if (!changed) {
                    worldsById = { ...worldsById };
                    order = [...order];
                    changed = true;
                }
                const isNewWorld = !worldsById[worldId];
                worldsById[worldId] = {
                    ...(worldsById[worldId] || {}),
                    ...summary,
                    id: worldId
                };
                if (isNewWorld) {
                    order.push(worldId);
                }
                while (order.length > WORLD_FACTS_CAPACITY) {
                    const evictedWorldId = order.shift();
                    if (evictedWorldId) {
                        delete worldsById[evictedWorldId];
                    }
                }
            }
            if (!changed) {
                return state;
            }
            return {
                version: state.version + 1,
                worldsById,
                order
            };
        });
    },
    getWorldFact(worldId) {
        return get().worldsById[normalizeWorldId(worldId)] || null;
    },
    resetWorldFacts() {
        set(initialState);
    }
}));

export type { WorldFact, WorldFactsStoreState };
