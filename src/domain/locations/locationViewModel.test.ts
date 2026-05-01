import { describe, expect, it } from 'vitest';

import {
    createLocationViewModel,
    resolveLocationMetadataModel
} from './locationViewModel.js';

describe('locationViewModel domain model', () => {
    it('uses traveling destination as the display target', () => {
        const model = createLocationViewModel({
            location: 'traveling',
            traveling: 'wrld_test:12345~region(jp)',
            metadata: {
                worldName: 'Travel World'
            }
        });

        expect(model.location).toBe('wrld_test:12345~region(jp)');
        expect(model.isTraveling).toBe(true);
        expect(model.worldName).toBe('Travel World');
        expect(model.region).toBe('jp');
        expect(model.actionTarget.isRealLaunchLocation).toBe(true);
    });

    it('resolves metadata by explicit hint, query profile, store hint, game log fallback, then raw id', () => {
        const explicit = resolveLocationMetadataModel({
            worldId: 'wrld_test',
            groupId: 'grp_test',
            explicitWorldNameHint: 'Explicit World',
            queryWorld: { name: 'Query World' },
            locationHint: { worldName: 'Hint World', groupName: 'Hint Group' },
            gameLogWorldName: 'Log World'
        });
        const query = resolveLocationMetadataModel({
            worldId: 'wrld_test',
            explicitWorldNameHint: 'Explicit World',
            queryWorld: { name: 'Query World' },
            locationHint: { worldName: 'Hint World' },
            gameLogWorldName: 'Log World'
        });
        const hint = resolveLocationMetadataModel({
            worldId: 'wrld_test',
            locationHint: { worldName: 'Hint World' },
            gameLogWorldName: 'Log World'
        });
        const fallback = resolveLocationMetadataModel({
            worldId: 'wrld_test',
            gameLogWorldName: 'Log World'
        });
        const raw = resolveLocationMetadataModel({
            worldId: 'wrld_test'
        });

        expect(explicit.worldName).toBe('Explicit World');
        expect(explicit.groupName).toBe('Hint Group');
        expect(query.worldName).toBe('Explicit World');
        expect(hint.worldName).toBe('Hint World');
        expect(fallback.worldName).toBe('Log World');
        expect(raw.worldName).toBe('wrld_test');
    });

    it('normalizes closed age-gated group instances into one view model', () => {
        const model = createLocationViewModel({
            location: 'wrld_test:12345~group(grp_test)~region(eu)~ageGate',
            metadata: {
                worldName: 'World',
                groupName: 'Group',
                instanceName: '12345',
                isClosed: true
            }
        });

        expect(model.worldId).toBe('wrld_test');
        expect(model.instanceId).toBe(
            '12345~group(grp_test)~region(eu)~ageGate'
        );
        expect(model.instanceName).toBe('12345');
        expect(model.groupId).toBe('grp_test');
        expect(model.region).toBe('eu');
        expect(model.worldName).toBe('World');
        expect(model.groupName).toBe('Group');
        expect(model.instanceName).toBe('12345');
        expect(model.isClosed).toBe(true);
        expect(model.isAgeRestricted).toBe(true);
    });
});
