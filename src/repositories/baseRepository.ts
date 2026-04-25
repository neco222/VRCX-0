export function asString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) {
        return fallback;
    }
    return String(value);
}

export function safeJsonParse<T = unknown>(
    value: unknown,
    fallback: T | null = null
): T | null | unknown {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    try {
        return JSON.parse(String(value));
    } catch {
        return fallback;
    }
}

export function safeJsonStringify(value: unknown, fallback = 'null'): string {
    try {
        return JSON.stringify(value);
    } catch {
        return fallback;
    }
}

export function createKeyPrefixer(prefix: string): (key: string) => string {
    return (key: string) => `${prefix}${key}`;
}
