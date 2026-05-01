import { create } from 'zustand';

import {
    buildInstancePresenceFact,
    instancePresenceKey,
    type InstancePresenceFact,
    type InstancePresenceFactInput
} from '@/domain/presence/instancePresence.js';

interface InstancePresenceStoreState {
    version: number;
    presenceByKey: Record<string, InstancePresenceFact>;
    locationsByEndpoint: Record<string, string[]>;
    upsertInstancePresence: (input: InstancePresenceFactInput) => void;
    resetInstancePresence: () => void;
}

const initialState = {
    version: 0,
    presenceByKey: {},
    locationsByEndpoint: {}
};

function endpointFromKey(key: string): string {
    return key.split('::')[0] || 'default';
}

export const useInstancePresenceStore = create<InstancePresenceStoreState>(
    (set) => ({
        ...initialState,
        upsertInstancePresence(input) {
            set((state) => {
                const key = instancePresenceKey(input.endpoint, input.location);
                const fact = buildInstancePresenceFact(input);
                if (!key || !fact) {
                    return state;
                }
                const existing = state.presenceByKey[key];
                if (
                    existing &&
                    JSON.stringify(existing) === JSON.stringify(fact)
                ) {
                    return state;
                }
                const endpoint = endpointFromKey(key);
                const currentLocations =
                    state.locationsByEndpoint[endpoint] || [];
                const nextLocations = currentLocations.includes(
                    fact.locationKey
                )
                    ? currentLocations
                    : [...currentLocations, fact.locationKey];
                return {
                    version: state.version + 1,
                    presenceByKey: {
                        ...state.presenceByKey,
                        [key]: fact
                    },
                    locationsByEndpoint:
                        nextLocations === currentLocations
                            ? state.locationsByEndpoint
                            : {
                                  ...state.locationsByEndpoint,
                                  [endpoint]: nextLocations
                              }
                };
            });
        },
        resetInstancePresence() {
            set(initialState);
        }
    })
);

export type { InstancePresenceStoreState };
