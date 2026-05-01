import { describe, expect, it } from 'vitest';

import {
    mergeUserFact,
    normalizeUserId,
    userFactKey
} from './userFacts.js';

describe('userFacts domain model', () => {
    it('normalizes ids and scopes facts by endpoint', () => {
        expect(normalizeUserId(' usr_test ')).toBe('usr_test');
        expect(userFactKey('https://api.vrchat.cloud', ' usr_test ')).toBe(
            'https://api.vrchat.cloud::usr_test'
        );
    });

    it('keeps richer profile fields over seed data and ignores empty overwrites', () => {
        const seed = mergeUserFact(
            null,
            {
                id: 'usr_test',
                displayName: 'Seed User',
                userIcon: 'seed.webp'
            },
            { endpoint: 'api', source: 'seed' }
        );
        const profile = mergeUserFact(
            seed,
            {
                id: 'usr_test',
                displayName: 'Profile User',
                userIcon: 'profile.webp',
                profilePicOverrideThumbnail: 'profile-thumb.webp'
            },
            { endpoint: 'api', source: 'profile' }
        );
        const staleSeed = mergeUserFact(
            profile,
            {
                id: 'usr_test',
                displayName: '',
                userIcon: '',
                statusDescription: 'seed status'
            },
            { endpoint: 'api', source: 'seed' }
        );

        expect(staleSeed.displayName).toBe('Profile User');
        expect(staleSeed.userIcon).toBe('profile.webp');
        expect(staleSeed.profilePicOverrideThumbnail).toBe(
            'profile-thumb.webp'
        );
        expect(staleSeed.statusDescription).toBe('seed status');
    });

    it('lets live presence beat profile location and game runtime beat API presence for self', () => {
        const profile = mergeUserFact(
            null,
            {
                id: 'usr_self',
                displayName: 'Self',
                location: 'wrld_profile:1',
                status: 'join me'
            },
            { endpoint: 'api', source: 'profile' }
        );
        const realtime = mergeUserFact(
            profile,
            {
                id: 'usr_self',
                location: 'wrld_realtime:2',
                status: 'busy'
            },
            { endpoint: 'api', source: 'realtime', stateBucket: 'online' }
        );
        const staleProfile = mergeUserFact(
            realtime,
            {
                id: 'usr_self',
                location: 'private',
                status: 'active'
            },
            { endpoint: 'api', source: 'profile' }
        );
        const gameRuntime = mergeUserFact(
            staleProfile,
            {
                id: 'usr_self',
                location: 'wrld_game:3',
                $location_at: 1234,
                isBoopingEnabled: false
            },
            { endpoint: 'api', source: 'gameRuntime', isCurrentUser: true }
        );

        expect(gameRuntime.location).toBe('wrld_game:3');
        expect(gameRuntime.status).toBe('busy');
        expect(gameRuntime.stateBucket).toBe('online');
        expect(gameRuntime.isCurrentUser).toBe(true);
        expect(gameRuntime.isBoopingEnabled).toBe(false);
        expect(gameRuntime.locationAt).toBe(1234);
    });
});
