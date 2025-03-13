// main.ts

import {
  HIDDeviceFilter,
  closeHIDDevice,
  connectHIDDevice,
  requestHIDDevice,
} from "./web-hid";

import axios from "axios";
import { log } from "./util";

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

enum Command {
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
    command: Command,
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
    const messageBuffer = new ArrayBuffer(length + 2 + (payload?.length ?? 0));
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
      `Sending message command<${Command[command]}> length<${length}> messageNumber<${messageNumber}>`
    );
    log(
      Array.from(new Uint8Array(messageBuffer))
        .slice(0, 30)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
      messageBuffer.byteLength > 30 ? "..." : ""
    );

    if (waitForReply) {
      const replypromise = waitForInputReport(this.device);
      await this.device.sendReport(this.reportId, messageBuffer);
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
        `Received status<${ReplyStatusCode[statusCode]}> for command<${Command[replyCommand]}> length<${replysize}> messageNumber<${replyNumber}>`
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

// Example usage:
async function communicateWithDevice(device: HIDDevice) {
  const communicator = new DeviceCommunicator(device);
  // const payload = new Uint8Array([0x01, 0x02, 0x03]); // Example payload
  const payload = undefined;
  const messageNumber = await communicator.sendCommand(
    Command.RECOVERY_GET_VERSION,
    payload
  );

  // wait for inputreport event to return some data

  // # On certain USB 3.0 systems, the brick reply contains the command
  // # we just sent written over it. This means we don't get the correct
  // # header and length info. Since the command here is smaller than the
  // # reply, the paypload does not get overwritten, so we can still get
  // # the version info since we know the expected reply size.
  // payload = self._receive_reply(Command.GET_VERSION, num, force_length=13)
  // return struct.unpack("<II", payload)
  // https://docs.python.org/3/library/struct.html
  // Note The number 1023 (0x3ff in hexadecimal) has the following byte representations:
  // 03 ff in big-endian (>)
  // ff 03 in little-endian (<)
  // I, unsigned int, integer, 4
  // H, unsigned short, integer, 2

  //  length,
  //    reply_number,
  //    message_type, // SYSTEM_COMMAND_REPLY = 0x01, SYSTEM_COMMAND_NO_REPLY = 0x81, SYSTEM_REPLY = 0x03, SYSTEM_REPLY_ERROR = 0x05
  //    reply_command, // reply_command = command
  //    status
  // = struct.unpack_from("<HHBBB", reply));

  // 00 00 00 01 F6 --> 00 05 00 01 F6 05 00 02 00 (05 00 02 00) --> 5.2
  // 00 00 00 00 00 01 F6 --> 00 0D 00 00 00 03 F6 00 06 00 00 00 06 00
  // 00 00 00 00 00 01 F6 --> 00 0D 00 00 00 03 F6 00 06 00 00 00 06 00

  // 00 0D 00 00 00 03 F6 00 06 00 00 00 06 00
  //    lengt repnu mt rc st fw___ hw___
  //    mt = message_type (01 or 03 / bad 05)
  //    rc = reply_command
  //    st = status
  //    fw, hw (version) = struct.unpack("<II", payload), print hw = 6

  // 01 F6 .. 00 06 .. ..
  // try {
  //   const reply = await communicator.receiveReply(
  //     Command.GET_VERSION,
  //     messageNumber
  //   );
  //   log("Received reply:", reply);
  // } catch (error) {
  //   log("Error receiving reply:", error);
  // }
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
  // const EV3_USB_PID = 0x0005;
  const EV3_BOOTLOADER_USB_PID = 0x0006;
  const filters: HIDDeviceFilter[] = [
    { vendorId: LEGO_USB_VID, productId: EV3_BOOTLOADER_USB_PID }, // EV3 Firmware Update
  ];

  device = await requestHIDDevice({ filters });

  if (device) {
    log("HID device found:", device);
    communicator = new DeviceCommunicator(device);

    if (await connectHIDDevice(device)) {
      log("HID device connected.");
    } else {
      log("Failed to connect to HID device.");
    }
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

    const reply = await communicator?.sendCommand(Command.RECOVERY_GET_VERSION);
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

  console.log("Getting version...");
  // const fname = "./firmware/LME-EV3_Firmware_1.10E.bin";
  const fname = "./firmware/firmware-base.bin";
  const response = await axios.get(fname, {
    responseType: "arraybuffer",
  });
  console.log(`Firmware size: ${response.data.byteLength} bytes`);

  const firmwareSize = response.data.byteLength;
  const firmwareData = new Uint8Array(response.data);
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
        Command.RECOVERY_BEGIN_DOWNLOAD_WITH_ERASE,
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
          Command.RECOVERY_DOWNLOAD_DATA,
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

  // const inputReportCallback = (event: HIDInputReportEvent) => {
  //   console.log("Received input report:", event.reportId, event.data);
  // };

  // addHIDInputReportListener(device, inputReportCallback);

  // const outputData = new Uint8Array([0x01, 0x02, 0x03]);
  // await sendHIDOutputReport(device, 0x01, outputData);
  // const command = Command.GET_VERSION;

  // // num = self._send_command(Command.GET_VERSION);
  // let length = 4;
  // // length += len(payload);

  // // message_number = next(self._msg_count);
  // const message_number = 1;

  // try {
  //   const message = new DataView(new ArrayBuffer(8));
  //   message.setUint16(0, length, true);
  //   message.setUint16(2, message_number, true);
  //   message.setUint8(4, MessageType.SYSTEM_COMMAND_REPLY);
  //   message.setUint8(5, command);
  //   await device.sendReport(0, message.buffer);

  //   // payload = self._receive_reply(
  //   //   Command.GET_VERSION,
  //   //   num,
  //   //   (force_length = 13)
  //   // );
  //   // return struct.unpack("<II", payload);
  //   const buf = await device.receiveFeatureReport(0);
  //   console.log(buf);
  //   // reply = bytes(self._device.read(255));

  //   // setTimeout(async () => {
  //   //   //removeHIDInputReportListener(device, inputReportCallback);
  //   //   await closeHIDDevice(device);
  //   //   console.log("HID device closed.");
  //   // }, 5000);
  // } catch (error) {
  //   console.error("Error sending HID output report:", error);
  // }
}

document.getElementById("connect")?.addEventListener("click", connect);
document.getElementById("getversion")?.addEventListener("click", getversion);
document.getElementById("updatefw")?.addEventListener("click", updatefw);
document.getElementById("disconnect")?.addEventListener("click", disconnect);

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
    await connectHIDDevice(device);
    communicator = new DeviceCommunicator(device);
  }
  // for (let device of devices) await addDevice(device);
};
