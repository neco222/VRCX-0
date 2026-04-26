import { backend } from '../platform/tauri/index.js';
import {
    asString,
    safeJsonParse,
    safeJsonStringify
} from './baseRepository.js';

export class StorageRepository {
    #prefix = '';

    constructor(prefix = '') {
        this.#prefix = prefix;
    }

    key(key: string): string {
        return `${this.#prefix}${key}`;
    }

    withPrefix(prefix: string): StorageRepository {
        return new StorageRepository(`${this.#prefix}${prefix}`);
    }

    async getString(key: string, defaultValue: string | null = null) {
        const value = await backend.storage.get(this.key(key));
        if (value === null || value === undefined || value === 'undefined') {
            return defaultValue;
        }
        return asString(value, defaultValue ?? '');
    }

    async get(key: string, defaultValue: string | null = null) {
        return this.getString(key, defaultValue);
    }

    async getJson<T = unknown>(key: string, defaultValue: T | null = null) {
        const value = await this.getString(key, null);
        return safeJsonParse(value, defaultValue);
    }

    async setString(key: string, value: unknown) {
        return backend.storage.set(this.key(key), String(value));
    }

    async set(key: string, value: unknown) {
        return this.setString(key, value);
    }

    async setJson(key: string, value: unknown) {
        return this.setString(key, safeJsonStringify(value));
    }

    async remove(key: string) {
        return backend.storage.remove(this.key(key));
    }

    async has(key: string): Promise<boolean> {
        const value = await backend.storage.get(this.key(key));
        return value !== null && value !== undefined && value !== 'undefined';
    }

    async clear(): Promise<void> {
        const entries = (await backend.storage.getAll()) as Record<
            string,
            unknown
        >;
        const keys = Object.keys(entries || {}).filter((key) =>
            this.#prefix ? key.startsWith(this.#prefix) : true
        );
        await Promise.all(keys.map((key) => backend.storage.remove(key)));
        await backend.storage.flush();
    }
}

const storageRepository = new StorageRepository();

export default storageRepository;
