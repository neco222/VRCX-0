import {
    DASHBOARD_NAV_KEY_PREFIX,
    DEFAULT_DASHBOARD_ICON
} from '@/shared/constants/dashboard';
import {
    DEFAULT_FOLDER_ICON,
    normalizeNavIconKey
} from '@/shared/constants/navIcons';

export type CustomNavFolderItem =
    | string
    | {
          key?: unknown;
          icon?: unknown;
      };

export type CustomNavItemEntry = {
    type: 'item';
    key?: unknown;
    icon?: unknown;
};

export type CustomNavFolderEntry = {
    type: 'folder';
    id?: unknown;
    name?: unknown;
    nameKey?: unknown;
    icon?: unknown;
    items: CustomNavFolderItem[];
};

export type CustomNavLayoutEntry = CustomNavItemEntry | CustomNavFolderEntry;

export type CustomNavLayout = CustomNavLayoutEntry[];

export type CustomNavHiddenPlacement = {
    parentId: string | null;
    index: number;
    icon?: unknown;
};

export type CustomNavDefinition = {
    key?: string;
    icon?: string;
    isDashboard?: boolean;
    labelKey?: string;
    titleIsCustom?: boolean;
    tooltip?: string;
};

export type VisibleNode = {
    type: 'folder' | 'item';
    id: string;
    key?: unknown;
    icon?: unknown;
    sortableId: string;
    parentId: string | null;
};

export type CustomNavDragNode =
    | VisibleNode
    | {
          type: 'folder-drop';
          id: string;
          parentId: null;
          sortableId: string;
      };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function getFolderItemKey(item: unknown) {
    return typeof item === 'string'
        ? item
        : isRecord(item)
          ? item.key
          : undefined;
}

export function getFolderItemIcon(item: unknown) {
    return isRecord(item) ? item.icon : undefined;
}

function getLayoutItemKey(entry: unknown): unknown {
    return isRecord(entry) ? entry.key : undefined;
}

export function createFolderItem(
    key: unknown,
    icon: unknown = ''
): CustomNavFolderItem {
    const normalizedIcon = normalizeNavIconKey(icon, '');
    return normalizedIcon ? { key, icon: normalizedIcon } : String(key);
}

export function getItemSortableId(key: unknown) {
    return `item:${key}`;
}

export function getFolderSortableId(id: unknown) {
    return `folder:${id}`;
}

export function getFolderDropId(id: unknown) {
    return `folder-drop:${id}`;
}

export function getFolderIdFromDropId(id: unknown) {
    const value = String(id || '');
    return value.startsWith('folder-drop:')
        ? value.slice('folder-drop:'.length)
        : '';
}

export function cloneLayout(source: unknown): CustomNavLayout {
    if (!Array.isArray(source)) {
        return [];
    }
    return source
        .map((entry): CustomNavLayoutEntry | null => {
            if (!isRecord(entry)) {
                return null;
            }
            if (entry.type === 'folder') {
                return {
                    type: 'folder',
                    id: entry.id,
                    name: entry.name,
                    nameKey: entry.nameKey || null,
                    icon: normalizeNavIconKey(entry.icon, DEFAULT_FOLDER_ICON),
                    items: Array.isArray(entry.items)
                        ? entry.items
                              .map((item) => {
                                  const key = getFolderItemKey(item);
                                  return key
                                      ? createFolderItem(
                                            key,
                                            getFolderItemIcon(item)
                                        )
                                      : null;
                              })
                              .filter((item): item is CustomNavFolderItem =>
                                  Boolean(item)
                              )
                        : []
                };
            }
            if (entry.type === 'item') {
                const icon = normalizeNavIconKey(entry.icon, '');
                return {
                    type: 'item',
                    key: entry.key,
                    ...(icon ? { icon } : {})
                };
            }
            return null;
        })
        .filter((entry): entry is CustomNavLayoutEntry => entry !== null);
}

export function createFolderId() {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return `custom-folder-${crypto.randomUUID()}`;
    }
    return `custom-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function definitionLabel(
    definition: CustomNavDefinition | null | undefined,
    t: (key: string) => string
) {
    if (!definition) {
        return '';
    }
    if (definition.titleIsCustom || definition.isDashboard) {
        return String(
            definition.labelKey || definition.tooltip || definition.key || ''
        );
    }
    return t(
        String(
            definition.labelKey || definition.tooltip || definition.key || ''
        )
    );
}

export function removeKeyFromLayout(layout: unknown, key: unknown) {
    const normalizedKey = String(key || '');
    let removed = false;
    let placement: CustomNavHiddenPlacement | null = null;
    const next: CustomNavLayout = [];

    for (const [index, entry] of cloneLayout(layout).entries()) {
        if (entry.type === 'item') {
            if (entry.key === normalizedKey) {
                removed = true;
                placement = { parentId: null, index, icon: entry.icon };
                continue;
            }
            next.push(entry);
            continue;
        }

        const items: CustomNavFolderItem[] = [];
        for (
            let itemIndex = 0;
            itemIndex < (entry.items || []).length;
            itemIndex += 1
        ) {
            const item = entry.items[itemIndex];
            const itemKey = getFolderItemKey(item);
            if (itemKey === normalizedKey) {
                removed = true;
                placement = {
                    parentId: String(entry.id),
                    index: itemIndex,
                    icon: getFolderItemIcon(item)
                };
                continue;
            }
            items.push(item);
        }
        next.push({
            ...entry,
            items
        });
    }

    return {
        layout: next,
        removed,
        placement
    };
}

export function insertKeyIntoLayout(
    layout: unknown,
    key: unknown,
    placement: CustomNavHiddenPlacement | null | undefined
) {
    const icon = normalizeNavIconKey(placement?.icon, '');
    const entry: CustomNavItemEntry = {
        type: 'item',
        key,
        ...(icon ? { icon } : {})
    };
    const next = cloneLayout(layout);

    if (placement?.parentId) {
        const folder = next.find(
            (item): item is CustomNavFolderEntry =>
                item.type === 'folder' &&
                String(item.id) === String(placement.parentId)
        );
        if (folder) {
            const index = Math.max(
                0,
                Math.min(placement.index, folder.items.length)
            );
            folder.items.splice(index, 0, createFolderItem(key, icon));
            return next;
        }
    }

    if (placement && placement.parentId === null) {
        const index = Math.max(0, Math.min(placement.index, next.length));
        next.splice(index, 0, entry);
        return next;
    }

    return [...next, entry];
}

export function buildHiddenPlacementMap(layout: unknown, hiddenKeys: unknown) {
    const hiddenKeySet = new Set(
        Array.isArray(hiddenKeys)
            ? hiddenKeys.map((key) => String(key || '')).filter(Boolean)
            : []
    );
    const placements = new Map<string, CustomNavHiddenPlacement>();

    for (const [index, entry] of cloneLayout(layout).entries()) {
        if (entry.type === 'item') {
            const key = String(getLayoutItemKey(entry) || '');
            if (hiddenKeySet.has(key)) {
                placements.set(key, {
                    parentId: null,
                    index,
                    icon: entry.icon
                });
            }
            continue;
        }

        for (const [itemIndex, item] of (entry.items || []).entries()) {
            const key = String(getFolderItemKey(item) || '');
            if (!hiddenKeySet.has(key)) {
                continue;
            }
            placements.set(key, {
                parentId: String(entry.id),
                index: itemIndex,
                icon: getFolderItemIcon(item)
            });
        }
    }

    return placements;
}

export function cleanLayout(layout: unknown) {
    return cloneLayout(layout).filter(
        (entry) => entry.type !== 'folder' || entry.items.length
    );
}

export function isDashboardKey(key: unknown) {
    return String(key || '').startsWith(DASHBOARD_NAV_KEY_PREFIX);
}

export function buildVisibleNodes(layout: unknown) {
    const nodes: VisibleNode[] = [];
    for (const entry of cloneLayout(layout)) {
        if (entry.type === 'folder') {
            const folderId = String(entry.id);
            nodes.push({
                type: 'folder',
                id: folderId,
                sortableId: getFolderSortableId(folderId),
                parentId: null
            });
            for (const item of entry.items || []) {
                const key = getFolderItemKey(item);
                if (!key) {
                    continue;
                }
                nodes.push({
                    type: 'item',
                    id: String(key),
                    key,
                    icon: getFolderItemIcon(item),
                    sortableId: getItemSortableId(key),
                    parentId: folderId
                });
            }
            continue;
        }
        if (entry.key) {
            nodes.push({
                type: 'item',
                id: String(entry.key),
                key: entry.key,
                icon: entry.icon,
                sortableId: getItemSortableId(entry.key),
                parentId: null
            });
        }
    }
    return nodes;
}

export function resolveDragNode(
    id: unknown,
    nodes: readonly VisibleNode[]
): CustomNavDragNode | null {
    const value = String(id || '');
    if (!value) {
        return null;
    }

    const dropFolderId = getFolderIdFromDropId(value);
    if (dropFolderId) {
        return {
            type: 'folder-drop',
            id: dropFolderId,
            parentId: null,
            sortableId: value
        };
    }

    return nodes.find((node) => node.sortableId === value) || null;
}

export function sameDragNode(
    a: CustomNavDragNode | null | undefined,
    b: CustomNavDragNode | null | undefined
) {
    return Boolean(
        a &&
        b &&
        a.type === b.type &&
        a.id === b.id &&
        (a.parentId || null) === (b.parentId || null)
    );
}

export function removeLayoutItem(
    entries: CustomNavLayout,
    key: unknown
): { key: unknown; icon?: unknown } | null {
    const normalizedKey = String(key || '');
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry.type === 'item' && String(entry.key) === normalizedKey) {
            const removedKey = entry.key;
            const removedIcon = entry.icon;
            entries.splice(index, 1);
            return {
                key: removedKey,
                icon: removedIcon
            };
        }
        if (entry.type === 'folder') {
            const itemIndex = (entry.items || []).findIndex(
                (item) => String(getFolderItemKey(item)) === normalizedKey
            );
            if (itemIndex >= 0) {
                const [removed] = entry.items.splice(itemIndex, 1);
                return {
                    key: getFolderItemKey(removed),
                    icon: getFolderItemIcon(removed)
                };
            }
        }
    }
    return null;
}

export function findTopLevelIndex(
    entries: CustomNavLayout,
    node: CustomNavDragNode | null | undefined
) {
    if (!node) {
        return -1;
    }
    return entries.findIndex((entry) => {
        if (node.type === 'folder') {
            return entry.type === 'folder' && String(entry.id) === node.id;
        }
        return entry.type === 'item' && String(entry.key) === node.id;
    });
}

export function findFolder(entries: CustomNavLayout, folderId: unknown) {
    return entries.find(
        (entry): entry is CustomNavFolderEntry =>
            entry.type === 'folder' && String(entry.id) === folderId
    );
}

export function findFolderItemIndex(
    folder: CustomNavFolderEntry | null | undefined,
    node: CustomNavDragNode | null | undefined
) {
    if (!folder || !node) {
        return -1;
    }
    return (folder.items || []).findIndex(
        (item) => String(getFolderItemKey(item)) === node.id
    );
}

export { DEFAULT_DASHBOARD_ICON };
