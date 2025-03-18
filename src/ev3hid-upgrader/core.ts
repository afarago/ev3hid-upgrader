export enum MessageType {
    SYSTEM_COMMAND_REPLY = 0x01,
    SYSTEM_COMMAND_NO_REPLY = 0x81,
    SYSTEM_REPLY = 0x03,
    SYSTEM_REPLY_ERROR = 0x05,
}

export enum ReplyStatusCode {
    SUCCESS = 0x00,
    UNKNOWN_HANDLE = 0x01,
    HANDLE_NOT_READY = 0x02,
    CORRUPT_FILE = 0x03,
    NO_HANDLES_AVAILABLE = 0x04,
    NO_PERMISSION = 0x05,
    ILLEGAL_PATH = 0x06,
    FILE_EXISTS = 0x07,
    END_OF_FILE = 0x08,
    SIZE_ERROR = 0x09,
    UNKNOWN_ERROR = 0x0a,
    ILLEGAL_FILENAME = 0x0b,
    ILLEGAL_CONNECTION = 0x0c,
}

export enum SystemCommand {
    BEGIN_DOWNLOAD = 0x92,
    CONTINUE_DOWNLOAD = 0x93,
    BEGIN_UPLOAD = 0x94,
    CONTINUE_UPLOAD = 0x95,
    BEGIN_GETFILE = 0x96,
    CONTINUE_GETFILE = 0x97,
    CLOSE_FILEHANDLE = 0x98,
    LIST_FILES = 0x99,
    CONTINUE_LIST_FILES = 0x9a,
    CREATE_DIR = 0x9b,
    DELETE_FILE = 0x9c,
    LIST_OPEN_HANDLES = 0x9d,
    WRITE_MAILBOX = 0x9e,
    BLUETOOTH_PIN = 0x9f,
    ENTER_FW_UPDATE = 0xa0,
    SET_BUNDLE_ID = 0xa1,
    SET_BUNDLE_SEED_ID = 0xa2,

    RECOVERY_BEGIN_DOWNLOAD_WITH_ERASE = 0xf0,
    RECOVERY_BEGIN_DOWNLOAD = 0xf1,
    RECOVERY_DOWNLOAD_DATA = 0xf2,
    RECOVERY_CHIP_ERASE = 0xf3,
    RECOVERY_START_APP = 0xf4,
    RECOVERY_GET_CHECKSUM = 0xf5,
    RECOVERY_GET_VERSION = 0xf6,
}

export interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
}

export interface HIDDeviceRequestOptions {
    filters: HIDDeviceFilter[];
}

export interface HIDInputReportEvent extends Event {
    device: HIDDevice;
    reportId: number;
    data: DataView;
}

export type WebHidEV3UpgradeEvent = {
    init: () => void;
    connect: () => void;
    disconnect: (error?: Error) => void;
    error: (error: Error) => void;
    message: (count: number, state: boolean) => void;
};

export type WebHidEV3UpgradeLog = Record<"info" | "warning", (msg: string) => void> & {
    progress: (done: number, total?: number) => void;
};

export class WebHidEV3UpgradeError extends Error { }
