import { describe, expect, it } from 'vitest';

import { resolveFeedColumnInitialLiveSequence } from './useFeedColumnRows';

describe('feed column rows helpers', () => {
    it('uses the current live sequence as the initial merge floor', () => {
        expect(resolveFeedColumnInitialLiveSequence(7)).toBe(7);
        expect(resolveFeedColumnInitialLiveSequence('9')).toBe(9);
        expect(resolveFeedColumnInitialLiveSequence(-1)).toBe(0);
        expect(resolveFeedColumnInitialLiveSequence('bad')).toBe(0);
    });
});
