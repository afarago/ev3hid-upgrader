// main.ts

import {
  HIDDeviceFilter,
  closeHIDDevice,
  connectHIDDevice,
  requestHIDDevice,
} from "./web-hid";

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
  BEGIN_DOWNLOAD_WITH_ERASE = 0xf0,
  BEGIN_DOWNLOAD = 0xf1,
  DOWNLOAD_DATA = 0xf2,
  CHIP_ERASE = 0xf3,
  START_APP = 0xf4,
  GET_CHECKSUM = 0xf5,
  GET_VERSION = 0xf6,
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

interface HIDDeviceLike {
  sendReport(reportId: number, data: ArrayBuffer): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
}

class DeviceCommunicator {
  private device: HIDDeviceLike;
  private msgCount: number = 0;
  private MAX_DATA_SIZE: number = 251; // Adjust as needed
  private reportId: number = 0x01; // Adjust as needed

  constructor(device: HIDDeviceLike) {
    this.device = device;
  }

  private nextMsgCount(): number {
    return this.msgCount++;
  }

  async sendCommand(command: Command, payload?: Uint8Array): Promise<number> {
    //let length = 4;
    let length = 3;

    if (payload) {
      if (payload.length > this.MAX_DATA_SIZE) {
        throw new Error("payload is too large");
      }
      length += payload.length;
    }

    const messageNumber = this.nextMsgCount();

    const messageBuffer = new ArrayBuffer(length + 3 + (payload?.length ?? 0));
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
    log("Sending message:", new Uint8Array(messageBuffer));

    await this.device.sendReport(this.reportId, messageBuffer);

    return messageNumber;
  }

  async receiveReply(
    command: Command,
    messageNumber: number,
    forceLength: number = 0
  ): Promise<Uint8Array> {
    const replyBuffer = await this.device.receiveFeatureReport(this.reportId);
    const reply = new Uint8Array(
      replyBuffer.buffer,
      replyBuffer.byteOffset,
      replyBuffer.byteLength
    );

    const length = replyBuffer.getUint16(0, true);
    const replyNumber = replyBuffer.getUint16(2, true);
    const messageType = replyBuffer.getUint8(4);
    const replyCommand = replyBuffer.getUint8(5);
    const status = replyBuffer.getUint8(6);

    if (replyNumber !== messageNumber) {
      throw new Error(
        `message sequence number mismatch: ${replyNumber} != ${messageNumber}`
      );
    }

    if (messageType === MessageType.SYSTEM_REPLY_ERROR) {
      throw new ReplyError(status);
    }

    if (messageType !== MessageType.SYSTEM_REPLY) {
      if (forceLength) {
        return reply.slice(7, forceLength + 2);
      }
      throw new Error(`unexpected message type: ${messageType}`);
    }

    if (replyCommand !== command) {
      throw new Error(`command mismatch: ${replyCommand} != ${command}`);
    }

    return reply.slice(7, length + 2);
  }
}

// Example usage:
async function communicateWithDevice(device: HIDDeviceLike) {
  const communicator = new DeviceCommunicator(device);
  // const payload = new Uint8Array([0x01, 0x02, 0x03]); // Example payload
  const payload = undefined;
  const messageNumber = await communicator.sendCommand(
    Command.GET_VERSION,
    payload
  );

  try {
    const reply = await communicator.receiveReply(
      Command.GET_VERSION,
      messageNumber
    );
    log("Received reply:", reply);
  } catch (error) {
    log("Error receiving reply:", error);
  }
}

let device: HIDDevice | null = null;

async function disconnect() {
  if (device) {
    log("Disconnecting HID device...");
    await closeHIDDevice(device);
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

    if (await connectHIDDevice(device)) {
      log("HID device connected.");

      try {
        await communicateWithDevice(device);
      } catch (error) {
        log("Error communicating with device:", error);
      }

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
    } else {
      log("Failed to connect to HID device.");
    }
  } else {
    log("No matching HID device found.");
  }
}

document.getElementById("connect")?.addEventListener("click", connect);
document.getElementById("disconnect")?.addEventListener("click", disconnect);
