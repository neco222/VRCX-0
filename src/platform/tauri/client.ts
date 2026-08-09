import { tauriEvents } from './events';
import { webview } from './webview';

export type TauriEvents = typeof tauriEvents;
export type TauriWebview = typeof webview;

export interface TauriClient {
    events: TauriEvents;
    webview: TauriWebview;
}

export const tauriClient: TauriClient = Object.freeze({
    events: tauriEvents,
    webview
});

export default tauriClient;
