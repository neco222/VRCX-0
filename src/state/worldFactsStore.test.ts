import { beforeEach, describe, expect, it } from 'vitest';

import { useWorldFactsStore } from './worldFactsStore';

describe('worldFactsStore', () => {
    beforeEach(() => {
        useWorldFactsStore.getState().resetWorldFacts();
    });

    it('caps mirrored world facts and evicts the oldest ids', () => {
        const worlds = Array.from({ length: 257 }, (_, index) => ({
            id: `wrld_${index}`,
            name: `World ${index}`
        }));

        useWorldFactsStore.getState().upsertWorldFacts(worlds);

        const state = useWorldFactsStore.getState();
        expect(Object.keys(state.worldsById)).toHaveLength(256);
        expect(state.order).toHaveLength(256);
        expect(state.getWorldFact('wrld_0')).toBeNull();
        expect(state.getWorldFact('wrld_1')).toMatchObject({
            id: 'wrld_1',
            name: 'World 1'
        });
        expect(state.getWorldFact('wrld_256')).toMatchObject({
            id: 'wrld_256',
            name: 'World 256'
        });
    });

    it('stores only summary fields from world payloads', () => {
        useWorldFactsStore.getState().upsertWorldFacts({
            id: ' wrld_summary ',
            name: 'Summary World',
            description: 'Kept summary',
            capacity: 32,
            tags: [' system_labs ', { tag: 'ignored' }, '', 'author_tag_test'],
            platforms: [' PC ', null, 'Quest'],
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
            unityPackages: [{ assetUrl: 'https://example.test/world.bundle' }],
            instances: [['123', 4]],
            unknownLargeField: { nested: true }
        });

        const fact = useWorldFactsStore.getState().getWorldFact('wrld_summary');

        expect(fact).toMatchObject({
            id: 'wrld_summary',
            name: 'Summary World',
            description: 'Kept summary',
            capacity: 32,
            tags: ['system_labs', 'author_tag_test'],
            platforms: ['PC', 'Quest'],
            createdAt: '2026-06-01T00:00:00.000Z',
            created_at: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
            updated_at: '2026-06-02T00:00:00.000Z'
        });
        expect(fact).not.toHaveProperty('unityPackages');
        expect(fact).not.toHaveProperty('instances');
        expect(fact).not.toHaveProperty('unknownLargeField');
    });

    it('preserves non-array summary values without coercing their shape', () => {
        const createdAt = { iso: '2026-06-01T00:00:00.000Z' };

        useWorldFactsStore.getState().upsertWorldFacts({
            id: 'wrld_raw_summary',
            capacity: '32',
            createdAt,
            tags: [' system_labs ', 42, 'author_tag_test']
        });

        expect(
            useWorldFactsStore.getState().getWorldFact('wrld_raw_summary')
        ).toMatchObject({
            id: 'wrld_raw_summary',
            capacity: '32',
            createdAt,
            created_at: createdAt,
            tags: ['system_labs', 'author_tag_test']
        });
    });
});
