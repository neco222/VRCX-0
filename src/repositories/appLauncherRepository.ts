import { commands } from '@/platform/tauri/bindings';
import type {
    AppLauncherEntry,
    AppLauncherPickedTarget,
    AppLauncherSnapshot
} from '@/platform/tauri/bindings';

const appLauncherRepository = {
    snapshot(): Promise<AppLauncherSnapshot> {
        return commands.appAppLauncherSnapshotGet();
    },

    setEnabled(enabled: boolean): Promise<AppLauncherSnapshot> {
        return commands.appAppLauncherEnabledSet(enabled);
    },

    setEntries(entries: AppLauncherEntry[]): Promise<AppLauncherSnapshot> {
        return commands.appAppLauncherEntriesSet(entries);
    },

    pickTarget(): Promise<AppLauncherPickedTarget | null> {
        return commands.appAppLauncherTargetPick('auto');
    }
};

export default appLauncherRepository;
