import { backend } from '@/platform/index.js';

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

const LEGACY_MIGRATION_I18N_PREFIX =
    'view.settings.advanced.advanced.database_cleanup';

export async function promptLegacyVrcxForceMigration({ confirm, t, toast }) {
    let status = null;
    try {
        status = await backend.app.GetLegacyVrcxForceMigrationStatus();
    } catch (error) {
        toast.error(
            t(`${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_failed`, {
                error: errorMessage(error)
            })
        );
        return;
    }

    if (!status?.available) {
        toast.error(
            status?.reason ||
                t(
                    `${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_not_available`
                )
        );
        return;
    }

    const result = await confirm({
        title: t(
            `${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_confirm_title`
        ),
        description: t(
            `${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_confirm_description`,
            {
                path: status.dbPath || '%APPDATA%\\VRCX'
            }
        ),
        confirmText: t(
            `${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_confirm`
        ),
        cancelText: t('common.actions.cancel'),
        destructive: true
    });
    if (!result.ok) {
        return;
    }

    try {
        const willRestart = await backend.app.RequestLegacyVrcxForceMigration();
        if (!willRestart) {
            toast.warning(
                t(
                    `${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_restart_manually`
                )
            );
        }
    } catch (error) {
        toast.error(
            t(`${LEGACY_MIGRATION_I18N_PREFIX}.legacy_migration_failed`, {
                error: errorMessage(error)
            })
        );
    }
}
