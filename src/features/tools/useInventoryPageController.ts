import {
    IMAGE_UPLOAD_ACCEPT,
    useInventoryPageState
} from './useInventoryPageState';

export { IMAGE_UPLOAD_ACCEPT };

export function useInventoryPageController() {
    return useInventoryPageState();
}
