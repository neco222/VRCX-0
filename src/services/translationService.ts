import configRepository from '@/repositories/configRepository';
import externalApiRepository from '@/repositories/externalApiRepository';

const DEFAULT_TRANSLATION_ENDPOINT =
    'https://api.openai.com/v1/chat/completions';
const DEFAULT_TRANSLATION_MODEL = 'gpt-4o-mini';
const DEEPL_FREE_TRANSLATION_ENDPOINT =
    'https://api-free.deepl.com/v2/translate';

type TranslationType = 'google' | 'openai' | 'deepl';
type TranslationConfig = {
    enabled: boolean;
    bioLanguage: string;
    type: TranslationType;
    key: string;
    endpoint: string;
    model: string;
    prompt: string;
};
type TranslationOverrides = Partial<TranslationConfig>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function parseWebJson(response: unknown): Record<string, unknown> {
    const responseRecord = isRecord(response) ? response : {};
    const data = responseRecord.data;
    if (data && typeof data === 'object') {
        return data as Record<string, unknown>;
    }
    if (typeof data === 'string' && data.trim()) {
        const parsed = JSON.parse(data);
        return isRecord(parsed) ? parsed : {};
    }
    return {};
}

function normalizeTranslationType(value: unknown): TranslationType {
    return value === 'openai' || value === 'deepl' ? value : 'google';
}

export function normalizeDeepLTargetLanguage(language: unknown): string {
    const value = String(language || 'en')
        .trim()
        .replace(/_/g, '-')
        .toLowerCase();
    if (value === 'en' || value.startsWith('en-')) {
        return 'EN-US';
    }
    if (value === 'pt' || value.startsWith('pt-')) {
        return 'PT-BR';
    }
    if (value === 'zh-tw' || value === 'zh-hant') {
        return 'ZH-HANT';
    }
    if (value === 'zh-cn' || value === 'zh-hans' || value === 'zh') {
        return 'ZH-HANS';
    }
    return value.toUpperCase();
}

export async function getTranslationConfig(): Promise<TranslationConfig> {
    const [enabled, bioLanguage, type, key, endpoint, model, prompt] =
        await Promise.all([
            configRepository.getBool('translationAPI', false),
            configRepository.getString('bioLanguage', 'en'),
            configRepository.getString('translationAPIType', 'google'),
            configRepository.getString('translationAPIKey', ''),
            configRepository.getString(
                'translationAPIEndpoint',
                DEFAULT_TRANSLATION_ENDPOINT
            ),
            configRepository.getString(
                'translationAPIModel',
                DEFAULT_TRANSLATION_MODEL
            ),
            configRepository.getString('translationAPIPrompt', '')
        ]);

    return {
        enabled: Boolean(enabled),
        bioLanguage: String(bioLanguage || 'en'),
        type: normalizeTranslationType(type),
        key: String(key || ''),
        endpoint: String(endpoint || DEFAULT_TRANSLATION_ENDPOINT),
        model: String(model || DEFAULT_TRANSLATION_MODEL),
        prompt: String(prompt || '')
    };
}

export async function translateText(
    text: string,
    targetLanguage: any = '',
    overrides: TranslationOverrides = {}
): Promise<string> {
    const storedConfig = await getTranslationConfig();
    const config: any = {
        ...storedConfig,
        ...overrides
    };
    const target = targetLanguage || config.bioLanguage || 'en';

    if (!config.enabled) {
        throw new Error('Translation API disabled.');
    }

    if (config.type === 'google') {
        if (!config.key) {
            throw new Error('No Translation API key configured.');
        }
        const response = await externalApiRepository.executeTranslationRequest({
            url: `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(config.key)}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: text,
                target,
                format: 'text'
            })
        });

        if (response.status !== 200) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const json = parseWebJson(response);
        const data = isRecord(json.data) ? json.data : {};
        const translations = Array.isArray(data.translations)
            ? data.translations
            : [];
        const firstTranslation = isRecord(translations[0])
            ? translations[0]
            : {};
        return typeof firstTranslation.translatedText === 'string'
            ? firstTranslation.translatedText
            : '';
    }

    if (config.type === 'deepl') {
        if (!config.key) {
            throw new Error('No Translation API key configured.');
        }
        const response = await externalApiRepository.executeTranslationRequest({
            url: DEEPL_FREE_TRANSLATION_ENDPOINT,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `DeepL-Auth-Key ${config.key}`
            },
            body: JSON.stringify({
                text: [text],
                target_lang: normalizeDeepLTargetLanguage(target)
            })
        });

        if (response.status !== 200) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const json = parseWebJson(response);
        const translations = Array.isArray(json.translations)
            ? json.translations
            : [];
        const firstTranslation = isRecord(translations[0])
            ? translations[0]
            : {};
        return typeof firstTranslation.text === 'string'
            ? firstTranslation.text.trim()
            : '';
    }

    const endpoint = config.endpoint || DEFAULT_TRANSLATION_ENDPOINT;
    const model = config.model || DEFAULT_TRANSLATION_MODEL;
    if (!endpoint || !model) {
        throw new Error('Translation endpoint/model missing.');
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (config.key) {
        headers.Authorization = `Bearer ${config.key}`;
    }

    const response = await externalApiRepository.executeTranslationRequest({
        url: endpoint,
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        config.prompt ||
                        `You are a translation assistant. Translate the user message into ${target}. Only return the translated text.`
                },
                {
                    role: 'user',
                    content: text
                }
            ]
        })
    });

    if (response.status !== 200) {
        throw new Error(`Translation API error: ${response.status}`);
    }

    const json = parseWebJson(response);
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : {};
    const message = isRecord(firstChoice.message) ? firstChoice.message : {};
    const translated = message.content;
    return typeof translated === 'string' ? translated.trim() : '';
}
