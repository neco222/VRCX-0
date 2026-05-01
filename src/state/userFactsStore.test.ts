import { beforeEach, describe, expect, it } from 'vitest';

import { useUserFactsStore } from './userFactsStore.js';

describe('userFactsStore', () => {
    beforeEach(() => {
        useUserFactsStore.getState().resetUserFacts();
    });

    it('stores known users by endpoint and keeps stable id arrays for unchanged lower-priority writes', () => {
        const store = useUserFactsStore.getState();

        store.upsertUserFact(
            {
                id: 'usr_test',
                displayName: 'Profile User'
            },
            { endpoint: 'api', source: 'profile' }
        );

        const firstState = useUserFactsStore.getState();
        const firstIds = firstState.userIdsByEndpoint.api;
        const firstFact = firstState.usersByKey['api::usr_test'];

        store.upsertUserFact(
            {
                id: 'usr_test',
                displayName: 'Seed User'
            },
            { endpoint: 'api', source: 'seed' }
        );

        const secondState = useUserFactsStore.getState();

        expect(secondState.userIdsByEndpoint.api).toBe(firstIds);
        expect(secondState.usersByKey['api::usr_test']).toBe(firstFact);
        expect(secondState.usersByKey['api::usr_test'].displayName).toBe(
            'Profile User'
        );
    });

    it('resets user facts on auth boundary changes', () => {
        useUserFactsStore.getState().upsertUserFact(
            {
                id: 'usr_test',
                displayName: 'Profile User'
            },
            { endpoint: 'api', source: 'profile' }
        );

        useUserFactsStore.getState().resetUserFacts();

        expect(useUserFactsStore.getState().usersByKey).toEqual({});
        expect(useUserFactsStore.getState().userIdsByEndpoint).toEqual({});
    });
});
