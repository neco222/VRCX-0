import { beforeEach, describe, expect, it } from 'vitest';

import { useDialogStore, type ActiveDialog } from './dialogStore';

describe('dialogStore', () => {
    beforeEach(() => {
        useDialogStore.getState().clearDialogState();
    });

    it('opens a dialog and appends its crumb to the breadcrumb trail', () => {
        const dialog: ActiveDialog = {
            kind: 'user',
            entityId: 'usr_1',
            title: 'User One',
            crumb: {
                kind: 'user',
                entityId: 'usr_1',
                label: 'User One'
            }
        };

        useDialogStore.getState().openDialog(dialog);

        expect(useDialogStore.getState().activeDialog).toEqual(dialog);
        expect(useDialogStore.getState().breadcrumbs).toEqual([dialog.crumb]);
    });

    it('updates active dialog and breadcrumb metadata for the same entity', () => {
        useDialogStore.getState().setDialogTrail(
            {
                kind: 'world',
                entityId: 'wrld_1',
                title: 'Old World'
            },
            [
                {
                    kind: 'world',
                    entityId: 'wrld_1',
                    label: 'Old World'
                }
            ]
        );

        useDialogStore.getState().updateEntityDialogMetadata({
            kind: 'world',
            entityId: 'wrld_1',
            title: 'New World',
            description: 'Updated'
        });

        expect(useDialogStore.getState().activeDialog).toMatchObject({
            title: 'New World',
            description: 'Updated'
        });
        expect(useDialogStore.getState().breadcrumbs[0]).toMatchObject({
            label: 'New World',
            title: 'New World',
            description: 'Updated'
        });
    });
});
