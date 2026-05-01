import { useMemo } from 'react';

import { instancePresenceKey } from '@/domain/presence/instancePresence.js';
import { useInstancePresenceStore } from '@/state/instancePresenceStore.js';
import { useRuntimeStore } from '@/state/runtimeStore.js';

function useCurrentInstancePresence() {
    const endpoint = useRuntimeStore(
        (state) => state.auth.currentUserEndpoint
    );
    const currentLocation = useRuntimeStore(
        (state) => state.gameState.currentLocation
    );
    const key = useMemo(
        () => instancePresenceKey(endpoint, currentLocation),
        [currentLocation, endpoint]
    );
    return useInstancePresenceStore((state) =>
        key ? state.presenceByKey[key] || null : null
    );
}

export { useCurrentInstancePresence };
