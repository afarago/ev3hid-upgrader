import { createNanoEvents } from 'nanoevents';
import type { Emitter, EventsMap } from 'nanoevents';

export type WebHidEV3UpgradeProcessWriteEvents = {
    progress: (state: string, bytesSent?: number, expectedSize?: number) => void;

    start: () => void;
    error: (error: any) => void;
    end: () => void;
};

export interface WebHidEV3UpgradeProcess<T extends EventsMap> {
    events: Emitter<T>;
}

export class WebHidEV3UpgradeProcessWrite
    implements WebHidEV3UpgradeProcess<WebHidEV3UpgradeProcessWriteEvents>
{
    events = createNanoEvents<WebHidEV3UpgradeProcessWriteEvents>();
}
