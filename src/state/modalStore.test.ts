import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import { useModalStore, type ModalStore } from './modalStore';

describe('modalStore', () => {
    beforeEach(() => {
        useModalStore.getState().resetModalState();
    });

    it('keeps public modal actions typed', () => {
        const store = useModalStore.getState();

        expectTypeOf<ModalStore['alert']>().parameter(0).not.toBeAny();
        expectTypeOf<ModalStore['confirm']>().parameter(0).not.toBeAny();
        expectTypeOf<ModalStore['prompt']>().parameter(0).not.toBeAny();
        expectTypeOf<ModalStore['boopPrompt']>().parameter(0).not.toBeAny();
        expectTypeOf<ModalStore['otpPrompt']>().parameter(0).not.toBeAny();
        expectTypeOf(store.openImagePreview).parameter(0).not.toBeAny();
        expectTypeOf(store.handlePromptOk).parameter(0).not.toBeAny();
        expectTypeOf(store.updatePromptValue).parameter(0).not.toBeAny();
    });

    it('resolves a replaced prompt with the previous value', async () => {
        const store = useModalStore.getState();
        const first = store.prompt({ inputValue: 'old value' });

        const second = store.prompt({ inputValue: 'new value' });

        await expect(first).resolves.toEqual({
            ok: false,
            reason: 'replaced',
            value: 'old value'
        });
        expect(useModalStore.getState().promptDialog.value).toBe('new value');

        useModalStore.getState().handlePromptOk('done');
        await expect(second).resolves.toEqual({
            ok: true,
            reason: 'ok',
            value: 'done'
        });
    });
});
