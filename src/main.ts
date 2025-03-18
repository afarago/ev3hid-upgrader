import axios from "axios";
import type { HIDDeviceFilter, HIDDeviceRequestOptions } from "./ev3hid-upgrader/core";
import { WebHidEV3Upgrader } from "./ev3hid-upgrader/webHidEV3Upgrader";
import { hex16, log, updateMsgCount } from "./util";

let upgrader: WebHidEV3Upgrader | null;

async function disconnect() {
  log("Disconnecting HID device...");
  upgrader?.close();
  upgrader = null;
}

async function connect() {
  const LEGO_USB_VID = 0x0694;
  const EV3_USB_PID = 0x0005;
  const EV3_BOOTLOADER_USB_PID = 0x0006;
  const filters: HIDDeviceFilter[] = [
    //{ vendorId: LEGO_USB_VID, productId: EV3_BOOTLOADER_USB_PID }, // EV3 Firmware Update
    // { vendorId: LEGO_USB_VID, productId: EV3_USB_PID },
    { vendorId: LEGO_USB_VID },
  ];

  let device: HIDDevice | null = null;

  try {
    if (!("hid" in navigator)) throw new Error("WebHID not supported");

    const devices = await navigator.hid.requestDevice({ filters });
    if (devices && devices.length > 0) device = devices[0];
    else device = null;
  } catch (error) {
    console.error("Error requesting HID device:", error);
  }

  if (device) {
    log("HID device found:", device);
    open(device);
  } else {
    log("No matching HID device found.");
  }
}

async function open(device: HIDDevice) {
  upgrader = new WebHidEV3Upgrader(device, {
    info: (msg: string) => log("INFO", msg),
    warning: (msg: string) => log("WARN", msg),
    progress: (done: number, total?: number | undefined) => log("PRG", `${done}/${total}`),
  });
  // webdfu.events.on("disconnect", onDisconnect);

  upgrader.events.on("message", (count: number, state: boolean) => {
    updateMsgCount(count, state);
  });

  await upgrader.init();
  await upgrader.connect();

  let deviceInfo =
    `productName: ${device.productName}\n` +
    `vendorId:    0x${hex16(device.vendorId)} (${device.vendorId})\n` +
    `productId:   0x${hex16(device.productId)} (${device.productId})\n` +
    `opened:      ${device.opened ? "true" : "false"}\n`;
  log("Device connected:", deviceInfo);
}

async function handleUpdateFirmware() {
  if (!upgrader) return;

  const filename = "firmware/firmware-base.bin";
  // const filename = "firmware/LME-EV3_Firmware_1.10E.bin"
  const response = await axios.get(filename, {
    responseType: "arraybuffer",
  });
  const firmware = new Uint8Array(response.data);
  const process = upgrader?.write(firmware)

  process?.events.on("start", () => log("Firmware update started"));
  process?.events.on("error", (error) => log("ERROR", error));
  process?.events.on("end", () => log("Firmware update complete"));

  process?.events.on("progress", (state, bytesSent, expectedSize) => log(state, expectedSize ? `${bytesSent}/${expectedSize}` : ''));
}

async function handleGetVersion() {
  if (!upgrader) return;

  const version = await upgrader?.getVersion();
  log("Version:", version);
}

async function handleEnterFirmwareMode() {
  await upgrader?.enterFirmwareUpdateMode();
}

document.getElementById("connect")?.addEventListener("click", connect);
document.getElementById("getversion")?.addEventListener("click", handleGetVersion);
document.getElementById("updatefw")?.addEventListener("click", handleUpdateFirmware);
document.getElementById("disconnect")?.addEventListener("click", disconnect);
document.getElementById("enterfwupdate")?.addEventListener("click", handleEnterFirmwareMode);

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
    const device = devices[0];
    await open(device);
  }
  // for (let device of devices) await addDevice(device);
};
