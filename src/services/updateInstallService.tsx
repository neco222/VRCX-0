import { toast } from 'sonner';

import { userFacingErrorMessage } from '@/lib/errorDisplay';
import { openExternalLink } from '@/services/entityMediaService';
import i18n from '@/services/i18nService';
import { restartApplication } from '@/services/shellIntegrationService';
import {
    downloadUpdate,
    downloadAndInstallUpdate,
    formatReleaseDisplayVersion,
    installPendingUpdate,
    isNoPendingUpdateError,
    isPendingUpdateVersionMismatchError,
    type NormalizedRelease,
    type UpdateDownloadProgress,
    type UpdateOptions
} from '@/services/updateService';
import { links } from '@/shared/constants/link';
import { useRuntimeStore } from '@/state/runtimeStore';

export const UPDATE_AVAILABLE_TOAST_ID = 'vrcx-update-available';

type DirectUpdateInstallOptions = {
    toastId?: string | number;
};

type DirectUpdateToastId = NonNullable<DirectUpdateInstallOptions['toastId']>;

type DownloadToastContentProps = {
    detail: string;
    progress: UpdateDownloadProgress;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function getString(value: unknown) {
    return typeof value === 'string' ? value : String(value || '');
}

function formatMegabytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0.00 MB';
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatProgressDetail(progress: UpdateDownloadProgress) {
    const percentText = `${progress.percent}%`;
    const downloadedText = formatMegabytes(progress.downloadedBytes);
    if (progress.totalBytes > 0) {
        return `${percentText} · ${downloadedText} / ${formatMegabytes(
            progress.totalBytes
        )}`;
    }
    return `${percentText} · ${downloadedText}`;
}

function DownloadToastContent({ detail, progress }: DownloadToastContentProps) {
    const percent = Math.max(0, Math.min(100, progress.percent || 0));

    return (
        <div className="mt-1 flex w-full flex-col gap-2">
            <div className="text-muted-foreground text-xs tabular-nums">
                {detail}
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                    className="bg-primary h-full transition-[width]"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

function readLatestUpdateRelease(): NormalizedRelease | null {
    const release = useRuntimeStore.getState().updateLoop.latestUpdaterRelease;
    if (!isRecord(release)) {
        return null;
    }

    return {
        manifestUrl: getString(release.manifestUrl).trim() || undefined,
        target: getString(release.target).trim() || undefined,
        canonicalVersion: getString(release.canonicalVersion),
        channel: 'Stable',
        displayVersion: getString(release.displayVersion),
        htmlUrl: getString(release.htmlUrl),
        tagName: getString(release.tagName),
        displayName: getString(release.displayName || release.title),
        prerelease: false,
        publishedAt: getString(release.publishedAt),
        body: '',
        updaterType:
            getString(release.updaterType) === 'tauri' ? 'tauri' : 'manual'
    };
}

function canInstallUpdateRelease(
    release: NormalizedRelease | null
): release is NormalizedRelease & {
    manifestUrl: string;
    target: string;
} {
    return Boolean(
        release &&
        release.updaterType === 'tauri' &&
        release.manifestUrl &&
        release.target
    );
}

function resetAutoDownloadInstallState() {
    useRuntimeStore.getState().setUpdateLoopState({
        autoDownloadState: 'idle',
        downloadedVersion: null,
        downloadProgress: 0
    });
}

function hasMatchingAutoDownload(release: NormalizedRelease) {
    const updateLoop = useRuntimeStore.getState().updateLoop;
    return (
        Boolean(release.canonicalVersion) &&
        updateLoop.downloadedVersion === release.canonicalVersion &&
        (updateLoop.autoDownloadState === 'downloaded' ||
            updateLoop.autoDownloadState === 'downloading')
    );
}

function isMatchingAutoDownloadStillDownloading(release: NormalizedRelease) {
    const updateLoop = useRuntimeStore.getState().updateLoop;
    return (
        updateLoop.autoDownloadState === 'downloading' &&
        updateLoop.downloadedVersion === release.canonicalVersion
    );
}

function isPendingUpdateFallbackError(error: unknown) {
    return (
        isNoPendingUpdateError(error) ||
        isPendingUpdateVersionMismatchError(error)
    );
}

function showInstallingUpdateToast(toastId: DirectUpdateToastId) {
    toast.loading(i18n.t('message.vrcx_updater.installing_update'), {
        id: toastId,
        duration: Infinity,
        position: 'bottom-right',
        dismissible: false
    });
}

async function tryInstallAutoDownloadedUpdate(
    release: NormalizedRelease,
    installOptions: UpdateOptions,
    toastId: DirectUpdateToastId
) {
    if (!hasMatchingAutoDownload(release)) {
        return false;
    }

    if (isMatchingAutoDownloadStillDownloading(release)) {
        await downloadUpdate(release, installOptions);
    }

    useRuntimeStore.getState().setUpdateLoopState({
        autoDownloadState: 'installing',
        downloadedVersion: release.canonicalVersion,
        downloadProgress: 100
    });
    showInstallingUpdateToast(toastId);

    try {
        await installPendingUpdate(release.canonicalVersion);
        return true;
    } catch (error) {
        if (!isPendingUpdateFallbackError(error)) {
            throw error;
        }
        resetAutoDownloadInstallState();
        return false;
    }
}

let directInstallInFlight: Promise<boolean> | null = null;

export function installUpdateRelease(
    release: NormalizedRelease | null,
    { toastId = UPDATE_AVAILABLE_TOAST_ID }: DirectUpdateInstallOptions = {}
) {
    if (directInstallInFlight) {
        return directInstallInFlight;
    }

    if (!canInstallUpdateRelease(release)) {
        toast.error(
            i18n.t('message.vrcx_updater.no_downloadable_releases_found'),
            {
                id: toastId,
                position: 'bottom-right',
                closeButton: true
            }
        );
        return Promise.resolve(false);
    }

    const runtimeState = useRuntimeStore.getState();
    const hostCapabilities = runtimeState.hostCapabilities;
    const displayVersion =
        release.displayVersion ||
        formatReleaseDisplayVersion(release.canonicalVersion) ||
        release.tagName ||
        '-';
    const downloadTitle = i18n.t(
        'host.system_dialogs.dynamic.downloading_value',
        {
            value: displayVersion
        }
    );

    directInstallInFlight = (async () => {
        const updateLoadingToast = (progress: UpdateDownloadProgress) => {
            if (progress.percent >= 100) {
                toast.loading(
                    i18n.t('message.vrcx_updater.installing_update'),
                    {
                        id: toastId,
                        duration: Infinity,
                        position: 'bottom-right',
                        dismissible: false
                    }
                );
                return;
            }

            toast.loading(downloadTitle, {
                id: toastId,
                description: (
                    <DownloadToastContent
                        detail={formatProgressDetail(progress)}
                        progress={progress}
                    />
                ),
                duration: Infinity,
                position: 'bottom-right',
                dismissible: false
            });
        };

        try {
            updateLoadingToast({
                downloadedBytes: 0,
                totalBytes: 0,
                percent: 0
            });
            const installOptions = {
                hostArch: getString(hostCapabilities.arch),
                hostPlatform: getString(hostCapabilities.platform),
                linuxPackageKind: getString(hostCapabilities.linuxPackageKind),
                onDownloadProgress: updateLoadingToast
            };
            if (
                !(await tryInstallAutoDownloadedUpdate(
                    release,
                    installOptions,
                    toastId
                ))
            ) {
                await downloadAndInstallUpdate(release, installOptions);
            }
            useRuntimeStore.getState().setUpdateLoopState({
                hasAvailableUpdate: false,
                latestUpdaterRelease: null,
                autoDownloadState: 'idle',
                downloadedVersion: null,
                downloadProgress: 0
            });
            toast.success(
                i18n.t('dialog.vrcx_updater.ready_for_update', {
                    value: displayVersion
                }),
                {
                    id: toastId,
                    duration: 4000,
                    position: 'bottom-right'
                }
            );
            await restartApplication();
            return true;
        } catch (error) {
            resetAutoDownloadInstallState();
            toast.error(
                userFacingErrorMessage(
                    error,
                    i18n.t('message.vrcx_updater.failed_install')
                ),
                {
                    id: toastId,
                    duration: Infinity,
                    position: 'bottom-right',
                    closeButton: true
                }
            );
            return false;
        } finally {
            directInstallInFlight = null;
        }
    })();

    return directInstallInFlight;
}

export function installLatestAvailableUpdate(
    options: DirectUpdateInstallOptions = {}
) {
    return installUpdateRelease(readLatestUpdateRelease(), options);
}

export async function openOrInstallLatestAvailableUpdate(
    options: DirectUpdateInstallOptions = {}
) {
    const release = readLatestUpdateRelease();
    if (canInstallUpdateRelease(release)) {
        return installUpdateRelease(release, options);
    }

    await openExternalLink(release?.htmlUrl || links.releases);
    return false;
}
