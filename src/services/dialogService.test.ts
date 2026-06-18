import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { useDialogStore } from '@/state/dialogStore';

import { openUserDialog, openWorldDialog } from './dialogService';

vi.mock('sonner', () => ({
    toast: {
        info: vi.fn()
    }
}));

vi.mock('@/domain/users/userFactAccess', () => ({
    recordUserProfile: vi.fn()
}));

describe('dialogService', () => {
    beforeEach(() => {
        useDialogStore.getState().clearDialogState();
    });

    it('keeps dialog seed data typed as unknown records at the service boundary', () => {
        type UserOptions = NonNullable<Parameters<typeof openUserDialog>[0]>;
        type WorldOptions = NonNullable<Parameters<typeof openWorldDialog>[0]>;

        expectTypeOf<NonNullable<UserOptions['seedData']>>().toEqualTypeOf<
            Record<string, unknown>
        >();
        expectTypeOf<
            NonNullable<WorldOptions['initialNewInstanceDefaults']>
        >().toEqualTypeOf<Record<string, unknown>>();
    });

    it('updates the active user dialog payload when reopening with an action', () => {
        openUserDialog({
            userId: ' usr_123 ',
            seedData: {
                id: 'usr_123',
                displayName: 'Example User'
            }
        });
        const firstNonce = useDialogStore.getState().activeDialog?.openNonce;

        openUserDialog({
            userId: 'usr_123',
            initialAction: 'show-notes'
        });

        const state = useDialogStore.getState();
        expect(state.activeDialog).toMatchObject({
            kind: 'user',
            entityId: 'usr_123',
            payload: {
                seedData: {
                    id: 'usr_123',
                    displayName: 'Example User'
                },
                initialAction: 'show-notes'
            }
        });
        expect(state.activeDialog?.openNonce).not.toBe(firstNonce);
        expect(state.breadcrumbs.at(-1)).toMatchObject({
            payload: state.activeDialog?.payload,
            openNonce: state.activeDialog?.openNonce
        });
    });
});
