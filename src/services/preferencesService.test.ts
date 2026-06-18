import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { usePreferencesStore } from '@/state/preferencesStore';

import {
    setAccessibleStatusIndicatorsPreference,
    setAppLanguagePreference,
    setBoolConfigPreference,
    setDataTableStripedPreference,
    setDiscordBoolPreference,
    setIntConfigPreference,
    setNavWidthPreference,
    setNotificationLayoutPreference,
    setRecentActionCooldownMinutesPreference,
    setSharedFeedFiltersPreference,
    setSidebarCollapsedPreference,
    setStringConfigPreference,
    setTablePageSizesPreference,
    setThemeColorPreference,
    setThemeModePreference,
    setTranslationApiConfigPreference,
    setTrustColorPreference,
    setZoomLevelPreference
} from './preferencesService';

const configRepositoryMock = vi.hoisted(() => ({
    getInt: vi.fn(),
    setArray: vi.fn(),
    setBool: vi.fn(),
    setInt: vi.fn(),
    setString: vi.fn()
}));

const commandsMock = vi.hoisted(() => ({
    appVrOverlayConfigReload: vi.fn()
}));

vi.mock('@/repositories/configRepository', () => ({
    default: configRepositoryMock
}));

vi.mock('@/platform/tauri/bindings', () => ({
    commands: commandsMock
}));

describe('preferencesService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configRepositoryMock.getInt.mockResolvedValue(20);
        configRepositoryMock.setArray.mockResolvedValue(undefined);
        configRepositoryMock.setBool.mockResolvedValue(undefined);
        configRepositoryMock.setInt.mockResolvedValue(undefined);
        configRepositoryMock.setString.mockResolvedValue(undefined);
        commandsMock.appVrOverlayConfigReload.mockResolvedValue(undefined);
        usePreferencesStore.getState().hydratePreferences({});
    });

    it('keeps generic config preference writers typed at the service boundary', () => {
        expectTypeOf(setBoolConfigPreference)
            .parameter(0)
            .toEqualTypeOf<string>();
        expectTypeOf(setBoolConfigPreference).parameter(1).not.toBeAny();
        expectTypeOf(setStringConfigPreference)
            .parameter(0)
            .toEqualTypeOf<string>();
        expectTypeOf(setStringConfigPreference).parameter(1).not.toBeAny();
        expectTypeOf(setIntConfigPreference)
            .parameter(0)
            .toEqualTypeOf<string>();
        expectTypeOf(setIntConfigPreference).parameter(1).not.toBeAny();
        expectTypeOf(setIntConfigPreference).parameter(2).not.toBeAny();
        expectTypeOf(setAccessibleStatusIndicatorsPreference)
            .parameter(0)
            .not.toBeAny();
        expectTypeOf(setAppLanguagePreference).parameter(0).not.toBeAny();
        expectTypeOf(setDataTableStripedPreference).parameter(0).not.toBeAny();
        expectTypeOf(setDiscordBoolPreference).parameter(1).not.toBeAny();
        expectTypeOf(setNavWidthPreference).parameter(0).not.toBeAny();
        expectTypeOf(setNotificationLayoutPreference)
            .parameter(0)
            .not.toBeAny();
        expectTypeOf(setRecentActionCooldownMinutesPreference)
            .parameter(0)
            .not.toBeAny();
        expectTypeOf(setSharedFeedFiltersPreference).parameter(0).not.toBeAny();
        expectTypeOf(setSidebarCollapsedPreference).parameter(0).not.toBeAny();
        expectTypeOf(setThemeColorPreference).parameter(0).not.toBeAny();
        expectTypeOf(setThemeModePreference).parameter(0).not.toBeAny();
        expectTypeOf(setTranslationApiConfigPreference)
            .parameter(0)
            .not.toBeAny();
        expectTypeOf(setTrustColorPreference).parameter(1).not.toBeAny();
        expectTypeOf(setZoomLevelPreference).parameter(0).not.toBeAny();
    });

    it('clamps int config preferences before persisting and patching state', async () => {
        const saved = await setIntConfigPreference('weekStartsOn', '9', {
            min: 0,
            max: 6,
            fallback: 1
        });

        expect(saved).toBe(6);
        expect(configRepositoryMock.setInt).toHaveBeenCalledWith(
            'weekStartsOn',
            6
        );
        expect(usePreferencesStore.getState().weekStartsOn).toBe(6);
    });

    it('keeps table page size valid when the saved size list changes', async () => {
        usePreferencesStore.getState().hydratePreferences({
            tablePageSize: 25,
            tablePageSizes: [10, 25, 50]
        });

        const saved = await setTablePageSizesPreference([10, 50]);

        expect(saved).toEqual([10, 50]);
        expect(configRepositoryMock.setArray).toHaveBeenCalledWith(
            'VRCX_tablePageSizes',
            [10, 50]
        );
        expect(configRepositoryMock.setInt).toHaveBeenCalledWith(
            'VRCX_tablePageSize',
            10
        );
        expect(usePreferencesStore.getState().tablePageSize).toBe(10);
        expect(usePreferencesStore.getState().tablePageSizes).toEqual([10, 50]);
    });
});
