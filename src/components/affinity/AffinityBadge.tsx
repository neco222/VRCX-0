import { HeartIcon, StarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

type AffinityBadgeProps = {
    isFriend?: boolean;
    isFavorite?: boolean;
    className?: string;
};

export function AffinityBadge({
    isFriend,
    isFavorite,
    className
}: AffinityBadgeProps) {
    const { t } = useTranslation();

    if (!isFriend) {
        return null;
    }

    const favorite = Boolean(isFavorite);
    const Icon = favorite ? StarIcon : HeartIcon;

    return (
        <span
            className={cn(
                'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-medium',
                favorite
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'bg-rose-500/10 text-rose-300',
                className
            )}
        >
            <Icon className="size-3 shrink-0 fill-current" />
            {t(
                favorite ? 'common.affinity.favorite' : 'common.affinity.friend'
            )}
        </span>
    );
}
