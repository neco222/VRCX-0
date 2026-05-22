import { ArrowRightIcon } from 'lucide-react';

import type { FeedLocationActionPayload, FeedRow } from '../feedTypes';
import { AvatarInfoLine } from './FeedAvatarInfoLine';
import { FeedLocationLink } from './FeedLocationLink';
import { FeedStatusBadge } from './FeedStatusBadge';

type FeedDetailCellProps = {
    loadingHistoryKey: string;
    onNewInstance(payload?: FeedLocationActionPayload): void;
    onOpenPreviousInstances(payload?: FeedLocationActionPayload): void;
    row: FeedRow;
};

function FeedDetailCell({
    loadingHistoryKey,
    onNewInstance,
    onOpenPreviousInstances,
    row
}: FeedDetailCellProps) {
    const type = row?.type;

    if (type === 'GPS' || type === 'Online' || type === 'Offline') {
        return (
            <FeedLocationLink
                disableTooltip
                groupName={row?.groupName}
                loadingHistoryKey={loadingHistoryKey}
                location={row?.location}
                onNewInstance={onNewInstance}
                onOpenPreviousInstances={onOpenPreviousInstances}
                worldName={row?.worldName}
                className={type === 'GPS' ? 'text-primary' : undefined}
            />
        );
    }

    if (type === 'Status') {
        if (row?.statusDescription === row?.previousStatusDescription) {
            return (
                <div className="flex min-w-0 items-center gap-2 text-sm">
                    <FeedStatusBadge status={row?.previousStatus} />
                    <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" />
                    <FeedStatusBadge status={row?.status} />
                </div>
            );
        }

        return (
            <div className="flex min-w-0 items-center gap-2">
                <FeedStatusBadge status={row?.status} />
                <span className="block w-full min-w-0 truncate">
                    {String(row?.statusDescription || '')}
                </span>
            </div>
        );
    }

    if (type === 'Avatar') {
        return (
            <div className="w-full min-w-0 truncate">
                <AvatarInfoLine
                    avatarName={row?.avatarName}
                    avatarTags={row?.currentAvatarTags}
                    imageUrl={row?.currentAvatarImageUrl}
                    ownerId={row?.ownerId}
                    userId={row?.userId}
                />
            </div>
        );
    }

    if (type === 'Bio') {
        return (
            <span className="block w-full min-w-0 truncate">
                {String(row?.bio || '')}
            </span>
        );
    }

    return row?.message ? (
        <span className="block w-full min-w-0 truncate">
            {String(row.message)}
        </span>
    ) : null;
}

export { FeedDetailCell };
