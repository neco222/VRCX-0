import { beforeEach, describe, expect, it } from 'vitest';

import {
    recordCurrentUserSnapshot,
    recordFriendPatch,
    recordFriendRosterFacts,
    recordGameRuntimePresence,
    recordLocationHintsFromInstances,
    recordKnownUser,
    resetDomainFacts
} from './domainIngestionService.js';
import { useInstancePresenceStore } from '@/state/instancePresenceStore.js';
import { useLocationHintStore } from '@/state/locationHintStore.js';
import { useUserFactsStore } from '@/state/userFactsStore.js';

describe('domainIngestionService', () => {
    beforeEach(() => {
        resetDomainFacts();
    });

    it('records current user, friend patches, and roster facts as lightweight user facts', () => {
        recordCurrentUserSnapshot(
            {
                id: 'usr_self',
                displayName: 'Self',
                isBoopingEnabled: false,
                location: 'private'
            },
            { endpoint: 'api' }
        );
        recordFriendPatch({
            endpoint: 'api',
            userId: 'usr_friend',
            stateBucket: 'online',
            patch: {
                displayName: 'Friend',
                location: 'wrld_live:123'
            }
        });
        recordFriendRosterFacts({
            endpoint: 'api',
            friendsById: {
                usr_other: {
                    id: 'usr_other',
                    displayName: 'Other',
                    stateBucket: 'active'
                }
            }
        });

        const facts = useUserFactsStore.getState().usersByKey;

        expect(facts['api::usr_self']).toMatchObject({
            id: 'usr_self',
            displayName: 'Self',
            isCurrentUser: true,
            isBoopingEnabled: false
        });
        expect(facts['api::usr_friend']).toMatchObject({
            id: 'usr_friend',
            displayName: 'Friend',
            isFriend: true,
            stateBucket: 'online',
            location: 'wrld_live:123'
        });
        expect(facts['api::usr_other']).toMatchObject({
            id: 'usr_other',
            displayName: 'Other',
            isFriend: true,
            stateBucket: 'active'
        });
    });

    it('records game runtime presence without trusting API private location over it', () => {
        recordCurrentUserSnapshot(
            {
                id: 'usr_self',
                displayName: 'Self',
                location: 'private'
            },
            { endpoint: 'api' }
        );
        recordGameRuntimePresence({
            endpoint: 'api',
            currentUserId: 'usr_self',
            currentUserSnapshot: {
                id: 'usr_self',
                displayName: 'Self'
            },
            currentLocation: 'wrld_game:12345',
            currentLocationStartedAt: '2026-01-01T00:00:00.000Z',
            currentLocationPlayers: [
                {
                    userId: 'usr_friend',
                    displayName: 'Friend',
                    joinedAt: '2026-01-01T00:00:00.000Z'
                }
            ]
        });

        expect(
            useUserFactsStore.getState().usersByKey['api::usr_self'].location
        ).toBe('wrld_game:12345');
        expect(
            useInstancePresenceStore.getState().presenceByKey[
                'api::wrld_game:12345'
            ].userIds
        ).toEqual(['usr_friend']);
    });

    it('keeps traveling as a sentinel and does not record destination as current presence', () => {
        recordGameRuntimePresence({
            endpoint: 'api',
            currentUserId: 'usr_self',
            currentUserSnapshot: {
                id: 'usr_self',
                displayName: 'Self'
            },
            currentLocation: 'traveling:traveling',
            currentDestination: 'wrld_destination:12345',
            currentLocationStartedAt: '2026-01-01T00:00:00.000Z',
            currentLocationPlayers: [
                {
                    userId: 'usr_friend',
                    displayName: 'Friend'
                }
            ]
        });

        expect(
            useUserFactsStore.getState().usersByKey['api::usr_self']
        ).toMatchObject({
            location: 'traveling',
            travelingToLocation: 'wrld_destination:12345'
        });
        expect(useInstancePresenceStore.getState().presenceByKey).toEqual({});
    });

    it('records instance display hints separately from full query data', () => {
        recordLocationHintsFromInstances({
            endpoint: 'api',
            instances: [
                {
                    location: 'wrld_test:12345~group(grp_test)',
                    worldName: 'World',
                    groupName: 'Group',
                    displayName: 'Instance',
                    closedAt: '2026-01-01T00:00:00.000Z',
                    users: [
                        {
                            id: 'usr_api',
                            displayName: 'API User'
                        }
                    ]
                }
            ]
        });

        expect(
            useLocationHintStore.getState().hintsByKey[
                'api::wrld_test:12345~group(grp_test)'
            ]
        ).toMatchObject({
            worldName: 'World',
            groupName: 'Group',
            instanceName: 'Instance',
            isClosed: true
        });
        expect(
            useUserFactsStore.getState().usersByKey['api::usr_api']
        ).toMatchObject({
            id: 'usr_api',
            displayName: 'API User'
        });
    });

    it('resets all domain stores on auth boundaries', () => {
        recordKnownUser(
            {
                id: 'usr_test',
                displayName: 'User'
            },
            { endpoint: 'api', source: 'profile' }
        );
        recordLocationHintsFromInstances({
            endpoint: 'api',
            instances: [{ location: 'wrld_test:12345', worldName: 'World' }]
        });

        resetDomainFacts();

        expect(useUserFactsStore.getState().usersByKey).toEqual({});
        expect(useInstancePresenceStore.getState().presenceByKey).toEqual({});
        expect(useLocationHintStore.getState().hintsByKey).toEqual({});
    });
});
