import { describe, expect, it } from 'vitest';

import { getBoopEmojiFileQueries } from './BoopEmojiDialog';

describe('getBoopEmojiFileQueries', () => {
    it('loads static and animated custom emoji files', () => {
        expect(getBoopEmojiFileQueries()).toEqual([
            { n: 100, tag: 'emoji' },
            { n: 100, tag: 'emojianimated' }
        ]);
    });
});
