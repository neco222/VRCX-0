import { create } from 'zustand';

import type {
    CleanupWarning,
    PrintAutoCleanupEvent,
    PrintFavoriteState
} from '@/platform/tauri/bindings';
import {
    DEFAULT_PRINT_AUTO_DELETE_LIMIT,
    PRINT_FAVORITE_LIMIT_BUFFER
} from '@/state/preferencesStore';

const DEFAULT_MAX_FAVORITES =
    DEFAULT_PRINT_AUTO_DELETE_LIMIT - PRINT_FAVORITE_LIMIT_BUFFER;

type PrintFavoriteStoreState = {
    hydrated: boolean;
    lastCleanup: PrintAutoCleanupEvent | null;
    favoriteIds: string[];
    maxFavorites: number;
    warning: CleanupWarning | null;
    applyPrintCleanup(event: PrintAutoCleanupEvent): void;
    hydratePrintFavorites(state: PrintFavoriteState): void;
    removeFavoritePrintId(printId: unknown): void;
    resetPrintFavorites(): void;
};

function normalizePrintId(value: unknown): string {
    return String(value ?? '').trim();
}

function normalizeFavoriteIds(values: readonly unknown[] = []): string[] {
    const normalized = values.map(normalizePrintId).filter(Boolean);
    return Array.from(new Set(normalized));
}

function normalizeMaxFavorites(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0
        ? Math.floor(parsed)
        : DEFAULT_MAX_FAVORITES;
}

export const usePrintFavoriteStore = create<PrintFavoriteStoreState>((set) => ({
    hydrated: false,
    lastCleanup: null,
    favoriteIds: [],
    maxFavorites: DEFAULT_MAX_FAVORITES,
    warning: null,
    applyPrintCleanup(event) {
        set({
            lastCleanup: event
        });
    },
    hydratePrintFavorites(state) {
        set({
            hydrated: true,
            favoriteIds: normalizeFavoriteIds(state.favoriteIds),
            maxFavorites: normalizeMaxFavorites(state.maxFavorites),
            warning: state.warning ?? null
        });
    },
    removeFavoritePrintId(printId) {
        const normalizedPrintId = normalizePrintId(printId);
        if (!normalizedPrintId) {
            return;
        }
        set((current) => ({
            favoriteIds: current.favoriteIds.filter(
                (id) => id !== normalizedPrintId
            )
        }));
    },
    resetPrintFavorites() {
        set({
            hydrated: false,
            lastCleanup: null,
            favoriteIds: [],
            maxFavorites: DEFAULT_MAX_FAVORITES,
            warning: null
        });
    }
}));

export type { PrintFavoriteStoreState };
