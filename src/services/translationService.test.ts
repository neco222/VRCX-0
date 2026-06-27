import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getBool: vi.fn(),
    getString: vi.fn(),
    executeTranslationRequest: vi.fn()
}));

vi.mock('@/repositories/configRepository', () => ({
    default: {
        getBool: mocks.getBool,
        getString: mocks.getString
    }
}));

vi.mock('@/repositories/externalApiRepository', () => ({
    default: {
        executeTranslationRequest: mocks.executeTranslationRequest
    }
}));

import {
    normalizeDeepLTargetLanguage,
    translateText
} from './translationService';

describe('translationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getBool.mockResolvedValue(true);
        mocks.getString.mockImplementation((key: string, fallback = '') => {
            const values: Record<string, string> = {
                bioLanguage: 'ja',
                translationAPIType: 'deepl',
                translationAPIKey: 'deepl-key',
                translationAPIEndpoint:
                    'https://api.openai.com/v1/chat/completions',
                translationAPIModel: 'gpt-4o-mini',
                translationAPIPrompt: ''
            };
            return Promise.resolve(values[key] ?? String(fallback ?? ''));
        });
    });

    it('normalizes app language codes for DeepL target_lang', () => {
        expect(normalizeDeepLTargetLanguage('en')).toBe('EN-US');
        expect(normalizeDeepLTargetLanguage('pt')).toBe('PT-BR');
        expect(normalizeDeepLTargetLanguage('zh-CN')).toBe('ZH-HANS');
        expect(normalizeDeepLTargetLanguage('zh-TW')).toBe('ZH-HANT');
        expect(normalizeDeepLTargetLanguage('ja')).toBe('JA');
    });

    it('translates through the DeepL Free API', async () => {
        mocks.executeTranslationRequest.mockResolvedValue({
            status: 200,
            data: JSON.stringify({
                translations: [{ text: 'こんにちは' }]
            })
        });

        await expect(translateText('Hello', 'ja')).resolves.toBe('こんにちは');

        expect(mocks.executeTranslationRequest).toHaveBeenCalledWith({
            url: 'https://api-free.deepl.com/v2/translate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'DeepL-Auth-Key deepl-key'
            },
            body: JSON.stringify({
                text: ['Hello'],
                target_lang: 'JA'
            })
        });
    });
});
