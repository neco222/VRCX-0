export function shouldOpenBoopReplyDialog(
    notification: any,
    response: any
): boolean {
    const responseType = String(response?.type || '').toLowerCase();
    return (
        notification?.type === 'boop' &&
        (responseType === 'reply' ||
            responseType === 'boop' ||
            response?.icon === 'reply')
    );
}
