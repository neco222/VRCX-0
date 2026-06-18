import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import { useInstancePresenceStore } from './instancePresenceStore';

describe('instancePresenceStore', () => {
    beforeEach(() => {
        useInstancePresenceStore.getState().resetInstancePresence();
    });

    it('keeps public presence actions typed', () => {
        const store = useInstancePresenceStore.getState();

        expectTypeOf(store.upsertInstancePresence).parameter(0).not.toBeAny();
    });

    it('indexes real instance locations by endpoint', () => {
        useInstancePresenceStore.getState().upsertInstancePresence({
            endpoint: 'api',
            location: 'wrld_test:12345~hidden(usr_owner)',
            source: 'gameRuntime',
            players: [{ userId: 'usr_friend', displayName: 'Friend' }]
        });

        expect(useInstancePresenceStore.getState()).toMatchObject({
            version: 1,
            locationsByEndpoint: {
                api: ['wrld_test:12345~hidden(usr_owner)']
            }
        });
    });
});
