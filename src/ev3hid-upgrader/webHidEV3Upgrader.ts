import { createNanoEvents } from 'nanoevents';
import {
    MessageType,
    SystemCommand,
    WebHidEV3UpgradeError,
    WebHidEV3UpgradeEvent,
    WebHidEV3UpgradeLog,
} from './core';
import { mycrc32 } from './crc32';
import { WebHidEV3UpgradeProcessWrite } from './process';

const MAX_DATA_SIZE: number = 1018;
const UPGRADE_REPORT_ID: number = 0x00;

export class WebHidEV3Upgrader {
    events = createNanoEvents<WebHidEV3UpgradeEvent>();
    private msgCount: number = 0;

    constructor(
        public readonly device: HIDDevice,
        private readonly log: WebHidEV3UpgradeLog,
    ) {
        this.device = device;
    }

    public async init(): Promise<void> {
        this.events.emit('init');
    }

    public async connect(): Promise<void> {
        try {
            await this.device.open();
        } catch (error) {
            this.events.emit('disconnect', error as Error);
            throw error;
        }

        this.events.emit('connect');
    }

    async close() {
        await this.device.close();
        this.events.emit('disconnect');
    }

    private nextMsgCount(): number {
        return this.msgCount++;
    }

    private async sendCommand(
        command: SystemCommand,
        payload?: Uint8Array,
        waitForReply: boolean = true,
    ): Promise<Uint8Array | undefined> {
        let length = 4;

        if (payload) {
            if (payload.length > MAX_DATA_SIZE) {
                throw new WebHidEV3UpgradeError('Payload is too large');
            }
            length += payload.length;
        }

        const messageNumber = this.nextMsgCount() % 0xffff;
        const messageBuffer = new ArrayBuffer(length + 2);
        const messageView = new DataView(messageBuffer);

        messageView.setUint16(0, length, true);
        messageView.setUint16(2, messageNumber, true);
        messageView.setUint8(4, MessageType.SYSTEM_COMMAND_REPLY);
        messageView.setUint8(5, command);

        if (payload) {
            for (let i = 0; i < payload.length; i++) {
                messageView.setUint8(6 + i, payload[i]);
            }
        }

        const replypromise = waitForReply ? this.waitForInputReport(this.device) : null;
        this.events.emit('message', this.msgCount, false);
        await this.device.sendReport(UPGRADE_REPORT_ID, messageBuffer);
        this.events.emit('message', this.msgCount, true);

        if (waitForReply && replypromise) {
            const reply = await replypromise.then((event) => {
                return new Uint8Array(event.data.buffer);
            });
            const replysize = new DataView(reply.buffer).getUint16(0, true);
            // const replyNumber = new DataView(reply.buffer).getUint16(2, true);
            // const messageType = new DataView(reply.buffer).getUint8(4);
            // const replyCommand = new DataView(reply.buffer).getUint8(5);
            // const statusCode = new DataView(reply.buffer).getUint8(6);
            // const replyhex = Array.from(reply)
            //     .slice(0, replysize + 2)
            //     .map((b) => b.toString(16).padStart(2, "0"))
            //     .join(" ");

            const replyCmd = reply[5];
            if (replyCmd !== command) {
                throw new WebHidEV3UpgradeError(
                    `command mismatch: ${replyCmd} != ${command}`,
                );
            }

            return reply;
        }
    }

    private waitForInputReport(device: HIDDevice): Promise<HIDInputReportEvent> {
        return new Promise((resolve) => {
            const handler = (event: HIDInputReportEvent) => {
                device.removeEventListener('inputreport', handler);
                resolve(event);
            };
            device.addEventListener('inputreport', handler);
        });
    }

    public async getVersion(): Promise<number> {
        this.log.info('Getting version...');
        const reply = await this.sendCommand(SystemCommand.RECOVERY_GET_VERSION);
        if (!reply) throw new WebHidEV3UpgradeError('No reply received');

        // byte 6-7 contains hw id in big endian
        // byte 8-9 contains fw id in big endian
        const hw = new DataView(reply.buffer).getUint16(6, false);
        const fw = new DataView(reply.buffer).getUint16(8, false);
        // log("Version:", hw, fw);
        this.log.info(`Version: HW ${hw}, FW ${fw}`);

        return hw;
    }

    write(data: ArrayBuffer): WebHidEV3UpgradeProcessWrite {
        if (!this) {
            throw new WebHidEV3UpgradeError('Required initialized driver');
        }

        let process = new WebHidEV3UpgradeProcessWrite();

        setTimeout(() => {
            try {
                let result: Promise<void>;

                process.events.emit('start');

                result = this.do_write(process, MAX_DATA_SIZE, data);

                result
                    .then(() => process.events.emit('end'))
                    .catch((error) => process.events.emit('error', error));
            } catch (error) {
                process.events.on('error', error as any);
            }
        }, 0);

        return process;
    }

    public async do_write(
        process: WebHidEV3UpgradeProcessWrite,
        xfer_size: number,
        data: ArrayBuffer,
    ): Promise<void> {
        let bytes_sent = 0;
        const expected_size = data.byteLength;
        const firmwareData = new Uint8Array(data);
        const expected_checksum = mycrc32(firmwareData);

        // enter download mode
        process.events.emit('progress', 'download_with_erase/start');
        {
            // Erasing doesn't have any progress feedback, there is a slight delay here
            const param_data = new Uint8Array(8);
            const view = new DataView(param_data.buffer);
            view.setUint32(0, 0, true); // address
            view.setUint32(4, expected_size, true);
            try {
                const reply = await this.sendCommand(
                    SystemCommand.RECOVERY_BEGIN_DOWNLOAD_WITH_ERASE,
                    param_data,
                );

                if (!reply) throw new WebHidEV3UpgradeError('No reply received');
            } catch (error) {
                throw new WebHidEV3UpgradeError(
                    'Error communicating with device: Command.BEGIN_DOWNLOAD_WITH_ERASE, ' +
                        error,
                );
            }
        }
        process.events.emit('progress', 'download_with_erase/end');

        // download firmware
        process.events.emit('progress', 'write/start');
        process.events.emit('progress', 'write/process', bytes_sent, expected_size);
        {
            for (let offset = 0; offset < expected_size; offset += xfer_size) {
                const bytes_left = expected_size - offset;
                const chunk_size = Math.min(bytes_left, xfer_size);
                const chunk = firmwareData.slice(
                    offset,
                    //Math.min(offset + chuksize, expected_size)
                    offset + chunk_size,
                );

                try {
                    const reply = await this.sendCommand(
                        SystemCommand.RECOVERY_DOWNLOAD_DATA,
                        chunk,
                    );
                    if (!reply) throw new WebHidEV3UpgradeError('No reply received');

                    const bytes_written = chunk_size;
                    bytes_sent += bytes_written;

                    process.events.emit(
                        'progress',
                        'write/process',
                        bytes_sent,
                        expected_size,
                    );
                } catch (error) {
                    throw new WebHidEV3UpgradeError(
                        'Error communicating with device: Command.DOWNLOAD_DATA, ' +
                            error,
                    );
                    break;
                }
            }
        }
        process.events.emit('progress', 'write/end', bytes_sent);

        // verify checksum
        process.events.emit('progress', 'verify/start');
        {
            const param_data = new Uint8Array(8);
            const view = new DataView(param_data.buffer);

            // Gets the checksum of a memory range.
            view.setUint32(0, 0, true); // address
            view.setUint32(4, expected_size, true);
            let checksum = 0;
            try {
                const reply = await this.sendCommand(
                    SystemCommand.RECOVERY_GET_CHECKSUM,
                    param_data,
                );
                if (!reply) throw new WebHidEV3UpgradeError('No reply received');

                checksum = new DataView(reply.buffer).getUint32(6, true);
            } catch (error) {
                throw new WebHidEV3UpgradeError(
                    'Error communicating with device: Command.GET_CHECKSUM, ' + error,
                );
            }

            // if (expected_checksum !== checksum) {
            //     throw new WebHidEV3UpgradeError(`Checksum mismatch: ${expected_checksum}, ${checksum}`);
            // }
        }
        process.events.emit('progress', 'verify/end');

        // restarting device
        process.events.emit('progress', 'restart/start');
        {
            try {
                const reply = await this.sendCommand(SystemCommand.RECOVERY_START_APP);
                if (!reply) throw new WebHidEV3UpgradeError('No reply received');
            } catch (error) {
                throw new WebHidEV3UpgradeError(
                    'Error communicating with device: Command.RECOVERY_START_APP, ' +
                        error,
                );
            }
        }
        process.events.emit('progress', 'restart/end');
    }

    public async enterFirmwareUpdateMode() {
        try {
            const reply = await this.sendCommand(SystemCommand.ENTER_FW_UPDATE);
            if (!reply) throw new WebHidEV3UpgradeError('No reply received');
        } catch (error) {
            throw new WebHidEV3UpgradeError(
                'Error communicating with device: Command.ENTER_FW_UPDATE, ' + error,
            );
        }
    }
}
