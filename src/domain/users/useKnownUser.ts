import { useMemo } from 'react';

import { useRuntimeStore } from '@/state/runtimeStore.js';
import { useUserFactsStore } from '@/state/userFactsStore.js';

import { normalizeEndpoint, normalizeUserId, userFactKey } from './userFacts.js';

interface UseKnownUserOptions {
    endpoint?: unknown;
}

function useKnownUserFact(userId: unknown, options: UseKnownUserOptions = {}) {
    const storeEndpoint = useRuntimeStore(
        (state) => state.auth.currentUserEndpoint
    );
    const endpoint = normalizeEndpoint(options.endpoint || storeEndpoint);
    const normalizedUserId = normalizeUserId(userId);
    const key = useMemo(
        () => userFactKey(endpoint, normalizedUserId),
        [endpoint, normalizedUserId]
    );
    return useUserFactsStore((state) =>
        key ? state.usersByKey[key] || null : null
    );
}

export { useKnownUserFact };
