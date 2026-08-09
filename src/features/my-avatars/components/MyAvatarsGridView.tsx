import type { Ref } from 'react';

import type {
    MyAvatarActionHandler,
    MyAvatarsGridDensityConfig,
    MyAvatarsGridRow
} from '../myAvatarsTypes';
import { MyAvatarGridCard } from './MyAvatarsViewParts';

type MyAvatarsGridViewProps = {
    densityConfig: MyAvatarsGridDensityConfig;
    gridScrollRef: Ref<HTMLDivElement>;
    gridTotalHeight: number;
    visibleGridRows: MyAvatarsGridRow[];
    gridGap: number;
    gridColumnCount: number;
    gridMinWidth: number;
    savingTagsAvatarId: string;
    updatingAvatarId: string;
    uploadingImageAvatarId: string;
    onAvatarAction: MyAvatarActionHandler;
};

export function MyAvatarsGridView({
    densityConfig,
    gridScrollRef,
    gridTotalHeight,
    visibleGridRows,
    gridGap,
    gridColumnCount,
    gridMinWidth,
    savingTagsAvatarId,
    updatingAvatarId,
    uploadingImageAvatarId,
    onAvatarAction
}: MyAvatarsGridViewProps) {
    return (
        <div ref={gridScrollRef} className="min-h-0 flex-1 overflow-auto py-2">
            <div
                className="relative p-1"
                style={{
                    height: `${gridTotalHeight}px`
                }}
            >
                {visibleGridRows.map((row) => (
                    <div
                        key={row.key}
                        className="absolute right-1 left-1 grid items-start overflow-visible p-0.5"
                        style={{
                            height: `${row.height}px`,
                            gap: `${gridGap}px`,
                            gridTemplateColumns: `repeat(${gridColumnCount}, minmax(${gridMinWidth}px, 1fr))`,
                            transform: `translateY(${row.top}px)`
                        }}
                    >
                        {row.avatars.map((avatar) => (
                            <MyAvatarGridCard
                                key={avatar.id}
                                avatar={avatar}
                                densityConfig={densityConfig}
                                isUpdating={
                                    savingTagsAvatarId === avatar.id ||
                                    updatingAvatarId === avatar.id ||
                                    uploadingImageAvatarId === avatar.id
                                }
                                onAction={(action, nextAvatar) => {
                                    onAvatarAction(action, nextAvatar);
                                }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
