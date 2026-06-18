import { describe, expect, it } from 'vitest';

import { resolveRemoteFavoriteGroupLabel } from './FavoriteActionMenu';

describe('FavoriteActionMenu helpers', () => {
    it('shows the remote favorite group display name instead of its key', () => {
        expect(
            resolveRemoteFavoriteGroupLabel(
                {
                    type: 'friend',
                    tags: ['group_0'],
                    $groupKey: 'friend:group_0'
                },
                [
                    {
                        key: 'friend:group_0',
                        name: 'group_0',
                        displayName: 'Best Friends'
                    }
                ]
            )
        ).toBe('Best Friends');
    });

    it('falls back to the remote favorite group key when metadata is unavailable', () => {
        expect(
            resolveRemoteFavoriteGroupLabel(
                {
                    type: 'friend',
                    tags: ['group_0'],
                    $groupKey: 'friend:group_0'
                },
                []
            )
        ).toBe('friend:group_0');
    });
});
