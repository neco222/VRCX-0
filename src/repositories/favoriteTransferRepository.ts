import {
    commands,
    type FavoriteTransferInput,
    type FavoriteTransferResult
} from '@/platform/tauri/bindings';

export function transferFavorites(
    input: FavoriteTransferInput
): Promise<FavoriteTransferResult> {
    return commands.appFavoritesTransfer(input);
}

export default Object.freeze({
    transferFavorites
});
