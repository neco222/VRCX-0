import { normalizePlatformError } from '../platform/tauri/errors.js';
import { backend } from '../platform/tauri/index.js';

export interface WebExecuteOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface WebExecuteResponse<TData = unknown> {
    status: number;
    data: TData;
    raw: unknown;
}

type LegacyTupleResponse = {
    Item1?: unknown;
    Item2?: unknown;
};

type ObjectResponse = {
    status?: unknown;
    data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

async function clearCookies(): Promise<unknown> {
    return backend.web.clearCookies();
}

async function getCookies(): Promise<unknown> {
    return backend.web.getCookies();
}

async function setCookies(cookie: unknown): Promise<unknown> {
    return backend.web.setCookies(cookie);
}

async function execute(
    options: WebExecuteOptions
): Promise<WebExecuteResponse> {
    if (!options) {
        throw new Error('WebRepository.execute requires an options object');
    }

    try {
        const response = await backend.web.execute(options);

        if (isRecord(response)) {
            if ('Item1' in response || 'Item2' in response) {
                const tuple = response as LegacyTupleResponse;
                if (tuple.Item1 === -1) {
                    throw tuple.Item2 ?? new Error('Web API request failed');
                }

                return {
                    status: typeof tuple.Item1 === 'number' ? tuple.Item1 : 0,
                    data: tuple.Item2,
                    raw: response
                };
            }

            if ('status' in response || 'data' in response) {
                const objectResponse = response as ObjectResponse;
                return {
                    status:
                        typeof objectResponse.status === 'number'
                            ? objectResponse.status
                            : 0,
                    data: objectResponse.data ?? null,
                    raw: response
                };
            }
        }

        return {
            status: 0,
            data: response,
            raw: response
        };
    } catch (error) {
        throw normalizePlatformError(error, 'Web API execution failed');
    }
}

const webRepository = Object.freeze({
    clearCookies,
    getCookies,
    setCookies,
    execute
});

export { clearCookies, getCookies, setCookies, execute };
export default webRepository;
