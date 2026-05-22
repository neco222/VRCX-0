import { describe, expect, it } from 'vitest';

import {
    languageCodeLabel,
    languageTooltipLabel,
    resolveFriendStatusMeta
} from './friendListDisplay';

describe('friendListDisplay', () => {
    it('shows compact language codes and readable fallbacks for the language column', () => {
        expect(languageCodeLabel('eng')).toBe('ENG');
        expect(languageCodeLabel('language_jpn')).toBe('JPN');
        expect(languageCodeLabel('')).toBe('');

        expect(
            languageTooltipLabel({ value: 'English', key: 'eng' }, 'ENG')
        ).toBe('English');
        expect(languageTooltipLabel({ key: 'jpn' }, 'JPN')).toBe('JPN');
        expect(languageTooltipLabel({}, '')).toBe('');
    });

    it('shows status text, indicator state, and sort rank for friend status badges', () => {
        const active = resolveFriendStatusMeta({
            status: 'active',
            statusDescription: '',
            state: 'online'
        });
        expect(active.label).toBe('active');
        expect(active.badgeVariant).toBe('outline');
        expect(active.showIndicator).toBe(true);
        expect(active.sortRank).toEqual(expect.any(Number));

        const custom = resolveFriendStatusMeta({
            status: 'busy',
            statusDescription: 'Do not disturb'
        });
        expect(custom.label).toBe('Do not disturb');

        const empty = resolveFriendStatusMeta(null);
        expect(empty.badgeVariant).toBe('outline');
        expect(empty.showIndicator).toBe(false);
    });
});
