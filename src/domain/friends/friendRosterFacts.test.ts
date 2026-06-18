import { describe, expect, it } from 'vitest';

import {
    applyFactDerivedFields,
    mergeRosterFriendFacts
} from './friendRosterFacts';
import type { FriendRosterRecord } from './friendRosterTypes';

describe('friendRosterFacts', () => {
    it('lets UserFact win for derived trust/platform fields', () => {
        const friend: FriendRosterRecord = {
            id: 'usr_1',
            $trustClass: 'x-tag-untrusted',
            $trustLevel: 'Visitor',
            $platform: ''
        };
        const merged = applyFactDerivedFields(friend, {
            $trustClass: 'x-tag-veteran',
            $trustLevel: 'Trusted User',
            $platform: 'standalonewindows'
        });
        expect(merged.$trustClass).toBe('x-tag-veteran');
        expect(merged.$trustLevel).toBe('Trusted User');
        expect(merged.$platform).toBe('standalonewindows');
    });

    it('keeps the roster value as first-frame fallback when UserFact is missing', () => {
        const friend: FriendRosterRecord = {
            id: 'usr_1',
            $trustClass: 'x-tag-veteran'
        };
        expect(applyFactDerivedFields(friend, null)).toBe(friend);
        expect(applyFactDerivedFields(friend, undefined)).toBe(friend);
    });

    it('does not overwrite a roster field the UserFact lacks', () => {
        const friend: FriendRosterRecord = {
            id: 'usr_1',
            $trustClass: 'x-tag-veteran'
        };
        const merged = applyFactDerivedFields(friend, {
            $platform: 'standalonewindows'
        });
        expect(merged.$trustClass).toBe('x-tag-veteran');
        expect(merged.$platform).toBe('standalonewindows');
    });

    it('returns the same friend reference when nothing changed', () => {
        const friend: FriendRosterRecord = {
            id: 'usr_1',
            $trustClass: 'x-tag-veteran'
        };
        const merged = applyFactDerivedFields(friend, {
            $trustClass: 'x-tag-veteran'
        });
        expect(merged).toBe(friend);
    });

    it('returns the same map reference when no friend changed', () => {
        const friendsById: Record<string, FriendRosterRecord> = {
            usr_1: { id: 'usr_1', $trustClass: 'x-tag-veteran' }
        };
        const factsById = {
            usr_1: { $trustClass: 'x-tag-veteran' }
        };
        expect(mergeRosterFriendFacts(friendsById, factsById)).toBe(
            friendsById
        );
    });

    it('merges only changed friends into a new map', () => {
        const stable: FriendRosterRecord = {
            id: 'usr_1',
            $trustClass: 'x-tag-veteran'
        };
        const friendsById: Record<string, FriendRosterRecord> = {
            usr_1: stable,
            usr_2: { id: 'usr_2', $trustClass: 'x-tag-untrusted' }
        };
        const factsById = {
            usr_2: { $trustClass: 'x-tag-trusted' }
        };
        const merged = mergeRosterFriendFacts(friendsById, factsById);
        expect(merged).not.toBe(friendsById);
        expect(merged.usr_1).toBe(stable);
        expect(merged.usr_2.$trustClass).toBe('x-tag-trusted');
    });
});
