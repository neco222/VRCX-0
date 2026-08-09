import { commands } from '@/platform/tauri/bindings';

export async function getCurrentLogLocation(): Promise<unknown> {
    return commands.logWatcherGetCurrentLocation();
}
