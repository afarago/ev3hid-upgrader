import {
  HIDDeviceFilter,
  closeHIDDevice,
  connectHIDDevice,
  requestHIDDevice,
} from "./web-hid";
import { hex16, log, updateMsgCount } from "./util";

import axios from "axios";
import { mycrc32 } from "./crc32";

// import crc32 from "buffer-crc32"; // Import the default export

enum MessageType {
  SYSTEM_COMMAND_REPLY = 0x01,
  SYSTEM_COMMAND_NO_REPLY = 0x81,
  SYSTEM_REPLY = 0x03,
  SYSTEM_REPLY_ERROR = 0x05,
}

enum ReplyStatusCode {
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

enum SystemCommand {
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

// Putting the EV3 in update manually is very simple. This manual approach is preferred, so it doesn't matter what is currently on the brick:
// - Make sure the EV3 is off.
// - hold right button while you turn the EV3 on normally.
// - you will see "updating..." on the screen.That's it.

class ReplyError extends Error {
  constructor(public status: number) {
    super(`Reply Error: Status ${status}`);
  }
}

// // https://developer.mozilla.org/en-US/docs/Web/API/HIDDevice
// interface HIDDeviceLike {
//   // Sends an output report to this HID Device, and returns a Promise which resolves once the report has been sent.
//   sendReport(reportId: number, data: ArrayBuffer): Promise<void>;

//   sendFeatureReport(reportId: number, data: ArrayBuffer): Promise<void>;

//   // Receives a feature report from this HID device in the form of a Promise which resolves with a DataView. This allows typed access to the contents of this message.
//   receiveFeatureReport(reportId: number): Promise<DataView>;
//   addEventListener(
//     type: "inputreport",
//     listener: (this: this, ev: HIDInputReportEvent) => any
//   ): void;
// }

class DeviceCommunicator {
  private device: HIDDevice;
  private msgCount: number = 0;
  _MAX_DATA_SIZE: number = 1018;
  private reportId: number = 0x00; // Adjust as needed

  constructor(device: HIDDevice) {
    this.device = device;
  }

  private nextMsgCount(): number {
    return this.msgCount++;
  }

  async sendCommand(
    command: SystemCommand,
    payload?: Uint8Array,
    waitForReply: boolean = true
  ): Promise<Uint8Array | undefined> {
    let length = 4;
    // let length = 3;

    if (payload) {
      if (payload.length > this._MAX_DATA_SIZE) {
        throw new Error("payload is too large");
      }
      length += payload.length;
    }

    const messageNumber = this.nextMsgCount();

    // const messageBuffer = new ArrayBuffer(length + 3 + (payload?.length ?? 0));
    const messageBuffer = new ArrayBuffer(length + 2);
    const messageView = new DataView(messageBuffer);

    // messageView.setUint16(0, 0, true); // length
    messageView.setUint16(0, length, true); // length
    messageView.setUint16(2, messageNumber, true);
    messageView.setUint8(4, MessageType.SYSTEM_COMMAND_REPLY);
    messageView.setUint8(5, command);

    //    0  1  2  3  4  5
    // 00 00 00 00 00 01 F6
    // 00 00 00 00 00 01 F6
    // Uint8Array(6) [0, 0, 0, 0, 1, 246,

    if (payload) {
      for (let i = 0; i < payload.length; i++) {
        messageView.setUint8(6 + i, payload[i]);
      }
    }
    log(
      `Sending message command<${SystemCommand[command]}> length<${length}> messageNumber<${messageNumber}> payloadlength<${payload?.length}>`
    );
    log(
      Array.from(new Uint8Array(messageBuffer))
        .slice(0, 30)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
      messageBuffer.byteLength > 30 ? "..." : ""
    );

    const replypromise = waitForReply ? waitForInputReport(this.device) : null;
    updateMsgCount(this.msgCount, false);
    await this.device.sendReport(this.reportId, messageBuffer);
    updateMsgCount(this.msgCount, true);

    if (waitForReply && replypromise) {
      const reply = await replypromise.then((event) => {
        return new Uint8Array(event.data.buffer);
      });
      const replysize = new DataView(reply.buffer).getUint16(0, true);
      const replyNumber = new DataView(reply.buffer).getUint16(2, true);
      const messageType = new DataView(reply.buffer).getUint8(4);
      const replyCommand = new DataView(reply.buffer).getUint8(5);
      const statusCode = new DataView(reply.buffer).getUint8(6);

      // log the reply to hex string
      const replyhex = Array.from(reply)
        .slice(0, replysize + 2)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      log(
        `Received status<${ReplyStatusCode[statusCode]}> for command<${SystemCommand[replyCommand]}> length<${replysize}> messageNumber<${replyNumber}>`
      );
      log(replyhex);

      const replyCmd = reply[5];
      if (replyCmd !== command) {
        throw new Error(`command mismatch: ${replyCmd} != ${command}`);
      }

      return reply;
    }
  }

  //   async receiveReply(
  //     command: Command,
  //     messageNumber: number,
  //     forceLength: number = 0
  //   ): Promise<Uint8Array> {
  //     const replyBuffer = await this.device.receiveFeatureReport(this.reportId);
  //     const reply = new Uint8Array(
  //       replyBuffer.buffer,
  //       replyBuffer.byteOffset,
  //       replyBuffer.byteLength
  //     );

  //     const length = replyBuffer.getUint16(0, true);
  //     const replyNumber = replyBuffer.getUint16(2, true);
  //     const messageType = replyBuffer.getUint8(4);
  //     const replyCommand = replyBuffer.getUint8(5);
  //     const status = replyBuffer.getUint8(6);

  //     if (replyNumber !== messageNumber) {
  //       throw new Error(
  //         `message sequence number mismatch: ${replyNumber} != ${messageNumber}`
  //       );
  //     }

  //     if (messageType === MessageType.SYSTEM_REPLY_ERROR) {
  //       throw new ReplyError(status);
  //     }

  //     if (messageType !== MessageType.SYSTEM_REPLY) {
  //       if (forceLength) {
  //         return reply.slice(7, forceLength + 2);
  //       }
  //       throw new Error(`unexpected message type: ${messageType}`);
  //     }

  //     if (replyCommand !== command) {
  //       throw new Error(`command mismatch: ${replyCommand} != ${command}`);
  //     }

  //     return reply.slice(7, length + 2);
  //   }
}

let device: HIDDevice | null = null;
let communicator: DeviceCommunicator | null;

function waitForInputReport(device: HIDDevice): Promise<HIDInputReportEvent> {
  return new Promise((resolve) => {
    const handler = (event: HIDInputReportEvent) => {
      device.removeEventListener("inputreport", handler);
      resolve(event);
    };
    device.addEventListener("inputreport", handler);
  });
}

async function disconnect() {
  if (device) {
    log("Disconnecting HID device...");
    await closeHIDDevice(device);
    device = null;
    communicator = null;
    log("HID device closed.");
  }
}

async function connect() {
  log("Requesting HID device...");

  const LEGO_USB_VID = 0x0694;
  const EV3_USB_PID = 0x0005;
  const EV3_BOOTLOADER_USB_PID = 0x0006;
  const filters: HIDDeviceFilter[] = [
    //{ vendorId: LEGO_USB_VID, productId: EV3_BOOTLOADER_USB_PID }, // EV3 Firmware Update
    // { vendorId: LEGO_USB_VID, productId: EV3_USB_PID },
    { vendorId: LEGO_USB_VID },
  ];

  device = await requestHIDDevice({ filters });

  if (device) {
    log("HID device found:", device);
    addDevice(device);
  } else {
    log("No matching HID device found.");
  }
}

async function getversion() {
  if (!device) {
    log("No HID device connected.");
    return;
  }
  if (!communicator) {
    log("No communicator connected.");
    return;
  }

  try {
    // await communicateWithDevice(device);

    const reply = await communicator?.sendCommand(
      SystemCommand.RECOVERY_GET_VERSION
    );
    if (!reply) throw new Error("No reply received");

    // byte 6-7 contains hw id in big endian
    // byte 8-9 contains fw id in big endian
    const hw = new DataView(reply.buffer).getUint16(6, false);
    const fw = new DataView(reply.buffer).getUint16(8, false);
    log("Version:", hw, fw);
  } catch (error) {
    log("Error communicating with device:", "Command.GET_VERSION", error);
  }
}

async function updatefw() {
  if (!device) {
    log("No HID device connected.");
    return;
  }
  if (!communicator) {
    log("No communicator connected.");
    return;
  }

  log("Getting version...");
  // const fname = "./firmware/LME-EV3_Firmware_1.10E.bin";
  const fname = "./firmware/firmware-base.bin";
  const response = await axios.get(fname, {
    responseType: "arraybuffer",
  });
  log(`Firmware size: ${response.data.byteLength} bytes`);

  const firmwareSize = response.data.byteLength;
  const firmwareData = new Uint8Array(response.data);
  const expected_checksum = mycrc32(firmwareData);
  log(`Checksum: ${expected_checksum}`);

  // let x = mycrc32(firmwareData);
  // // convert to unsigned int
  // if (x < 0) x = x + 0x100000000;
  // log(`Checksum: ${x}`);
  // // Checksum: 1276155392
  // Checksum mismatch: 3326873750 (96104CC6) 1276155392 (4C109600)
  // 00 96 10 c6 // 3322975744 (real)
  // return;

  // const view = new DataView(firmwareData.buffer);
  log(
    `download and erase firmware... ${firmwareSize} bytes (${firmwareSize.toString(
      16
    )} hex)`
  );

  // bootloader.erase_and_begin_download();
  // param_data = struct.pack("<II", 0, size); - llttle endian, uint 4 bytes
  // num = self._send_command(Command.BEGIN_DOWNLOAD_WITH_ERASE, param_data);
  {
    const param_data = new Uint8Array(8);
    const view = new DataView(param_data.buffer);
    view.setUint32(0, 0, true); // address
    view.setUint32(4, firmwareSize, true);
    try {
      // await communicateWithDevice(device);
      const reply = await communicator?.sendCommand(
        SystemCommand.RECOVERY_BEGIN_DOWNLOAD_WITH_ERASE,
        param_data
      );
      if (!reply) throw new Error("No reply received");
    } catch (error) {
      log(
        "Error communicating with device:",
        "Command.BEGIN_DOWNLOAD_WITH_ERASE",
        error
      );
    }
  }

  // await new Promise((resolve) => setTimeout(resolve, 1000));

  // bootloader.download(firmware, pbar.update)
  {
    const chuksize = communicator._MAX_DATA_SIZE;
    // const view = new DataView(data.buffer);

    for (let offset = 0; offset < firmwareSize; offset += chuksize) {
      const chunk = firmwareData.slice(
        offset,
        Math.min(offset + chuksize, firmwareSize)
      );
      // debugger;
      try {
        const reply = await communicator?.sendCommand(
          SystemCommand.RECOVERY_DOWNLOAD_DATA,
          chunk
        );
        // self._receive_reply(Command.DOWNLOAD_DATA, num)
        if (!reply) throw new Error("No reply received");
        // completed += len(c)
      } catch (error) {
        log("Error communicating with device:", "Command.DOWNLOAD_DATA", error);
        break;
      }
    }
    // for c in chunk(data, self._MAX_DATA_SIZE):
  }

  // bootloader.get_checksum(0, len(firmware))
  {
    // payload = struct.pack("<II", address, size);
    // num = self._send_command(Command.GET_CHECKSUM, payload);
    // payload = self._receive_reply(Command.GET_CHECKSUM, num);
    // return struct.unpack("<I", payload)[0];

    const param_data = new Uint8Array(8);
    const view = new DataView(param_data.buffer);
    // Gets the checksum of a memory range.
    view.setUint32(0, 0, true); // address
    view.setUint32(4, firmwareSize, true);
    let checksum = 0;
    try {
      const reply = await communicator?.sendCommand(
        SystemCommand.RECOVERY_GET_CHECKSUM,
        param_data
      );
      if (!reply) throw new Error("No reply received");
      checksum = new DataView(reply.buffer).getUint32(6, true);
      log("Checksum:", checksum);
    } catch (error) {
      log("Error communicating with device:", "Command.GET_CHECKSUM", error);
    }

    // expected_checksum = zlib.crc32(firmware);

    if (expected_checksum !== checksum) {
      log("Checksum mismatch:", expected_checksum, checksum);
    }

    log("Checksum OK");
    log("Restarting EV3...");
  }

  {
    // num = self._send_command(Command.START_APP);
    // self._receive_reply(Command.START_APP, num);
    try {
      const reply = await communicator?.sendCommand(
        SystemCommand.RECOVERY_START_APP
      );
      if (!reply) throw new Error("No reply received");
    } catch (error) {
      log(
        "Error communicating with device:",
        "Command.RECOVERY_START_APP",
        error
      );
    }
  }
}

async function enterfwupdate() {
  try {
    // await communicateWithDevice(device);
    const reply = await communicator?.sendCommand(
      SystemCommand.ENTER_FW_UPDATE
    );
    if (!reply) throw new Error("No reply received");
  } catch (error) {
    log("Error communicating with device:", "Command.ENTER_FW_UPDATE", error);
  }
}

async function addDevice(device: HIDDevice) {
  if (await connectHIDDevice(device)) {
    log("HID device connected.");
  } else {
    log("Failed to connect to HID device.");
  }

  communicator = new DeviceCommunicator(device);

  let deviceInfo =
    `productName: ${device.productName}\n` +
    `vendorId:    0x${hex16(device.vendorId)} (${device.vendorId})\n` +
    `productId:   0x${hex16(device.productId)} (${device.productId})\n` +
    `opened:      ${device.opened ? "true" : "false"}\n`;
  log("Device connected:", deviceInfo);
}

document.getElementById("connect")?.addEventListener("click", connect);
document.getElementById("getversion")?.addEventListener("click", getversion);
document.getElementById("updatefw")?.addEventListener("click", updatefw);
document.getElementById("disconnect")?.addEventListener("click", disconnect);
document
  .getElementById("enterfwupdate")
  ?.addEventListener("click", enterfwupdate);

window.onload = async () => {
  // Register for connection and disconnection events.
  // navigator.hid.onconnect = (e) => {
  //   addDevice(e.device);
  // };
  // navigator.hid.ondisconnect = (e) => {
  //   removeDevice(e.device);
  // };

  // Fetch the list of connected devices.
  const devices = await navigator.hid.getDevices();
  if (devices.length > 0) {
    log("Auto connect to first device found...");
    device = devices[0];
    await addDevice(device);
  }
  // for (let device of devices) await addDevice(device);
};
