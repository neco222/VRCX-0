import { commands } from '@/platform/tauri/bindings';
import type { RegistryBackupSnapshot } from '@/platform/tauri/bindings';

import { requireHostCapability } from './hostCapabilityService';

async function listVrcRegistryBackups(): Promise<RegistryBackupSnapshot[]> {
    requireHostCapability('registryPrefs');
    return commands.appRegistryBackupList();
}

async function backupVrcRegistry(
    name: string = 'Manual Backup'
): Promise<RegistryBackupSnapshot[]> {
    requireHostCapability('registryPrefs');
    return commands.appRegistryBackupCreate(name);
}

async function restoreVrcRegistryBackup(
    key: string
): Promise<RegistryBackupSnapshot> {
    requireHostCapability('registryPrefs');
    return commands.appRegistryBackupRestore(key);
}

async function saveVrcRegistryBackupToFile(key: string): Promise<unknown> {
    requireHostCapability('registryPrefs');
    const backups = await listVrcRegistryBackups();
    const backup = backups.find((item) => item.key === key);
    if (!backup) {
        throw new Error('Registry backup not found.');
    }
    const json = await commands.appRegistryBackupExportJson(key);
    return commands.appSaveVrcRegJsonFile(
        null,
        `${backup.name || 'VRChat Registry Backup'}.json`,
        json
    );
}

async function restoreVrcRegistryBackupFromFile(): Promise<boolean> {
    requireHostCapability('registryPrefs');
    const filePath = await commands.appOpenFileSelectorDialog(
        null,
        '.json',
        'JSON Files (*.json)|*.json'
    );
    if (!filePath) {
        return false;
    }

    const json = await commands.appReadVrcRegJsonFile(filePath);
    await commands.appRegistryBackupImportJson(String(json));
    return true;
}

async function deleteVrcRegistryFolder(): Promise<unknown> {
    requireHostCapability('registryPrefs');
    return commands.appDeleteVrchatRegistryFolder();
}

async function deleteVrcRegistryBackup(
    key: string
): Promise<RegistryBackupSnapshot[]> {
    requireHostCapability('registryPrefs');
    return commands.appRegistryBackupDelete(key);
}

export {
    backupVrcRegistry,
    deleteVrcRegistryBackup,
    deleteVrcRegistryFolder,
    listVrcRegistryBackups,
    restoreVrcRegistryBackup,
    restoreVrcRegistryBackupFromFile,
    saveVrcRegistryBackupToFile
};
