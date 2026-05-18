import { useTranslation } from 'react-i18next';

import {
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger
} from '@/ui/shadcn/context-menu';

const VISIBILITY_MENU_ITEMS = [
    ['vrchat', 'status_bar.game'],
    ['servers', 'status_bar.servers'],
    ['steamvr', 'status_bar.steamvr'],
    ['instanceQueue', 'status_bar.instance_queue'],
    ['proxy', 'status_bar.proxy'],
    ['ws', 'status_bar.realtime_connection'],
    ['uptime', 'status_bar.app_uptime_short'],
    ['zoom', 'status_bar.zoom'],
    ['nowPlaying', 'status_bar.now_playing']
];

export function StatusBarContextMenuContent({
    clockCount,
    onSetClockCountValue,
    onToggleVisibility,
    visibility
}: any) {
    const { t } = useTranslation();

    return (
        <ContextMenuContent className="w-52">
            <ContextMenuGroup>
                {VISIBILITY_MENU_ITEMS.map(([key, label]: any) => (
                    <ContextMenuCheckboxItem
                        key={key}
                        checked={Boolean(visibility[key])}
                        onSelect={(event: any) => event.preventDefault()}
                        onCheckedChange={(checked: any) =>
                            onToggleVisibility(key, checked)
                        }
                    >
                        {t(label)}
                    </ContextMenuCheckboxItem>
                ))}
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuSub>
                <ContextMenuSubTrigger>
                    {t('status_bar.clocks')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-36">
                    <ContextMenuRadioGroup
                        value={String(clockCount)}
                        onValueChange={(value: any) =>
                            onSetClockCountValue(Number(value))
                        }
                    >
                        {[0, 1, 2, 3].map((count: any) => (
                            <ContextMenuRadioItem
                                key={count}
                                value={String(count)}
                            >
                                {count === 0
                                    ? t('status_bar.clocks_none')
                                    : `${count} ${t(count === 1 ? 'status_bar.clock' : 'status_bar.clocks_label')}`}
                            </ContextMenuRadioItem>
                        ))}
                    </ContextMenuRadioGroup>
                </ContextMenuSubContent>
            </ContextMenuSub>
        </ContextMenuContent>
    );
}
