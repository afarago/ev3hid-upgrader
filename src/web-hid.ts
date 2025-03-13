// web-hid.ts

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HIDInputReportEvent extends Event {
  device: HIDDevice;
  reportId: number;
  data: DataView;
}

export async function requestHIDDevice(
  options: HIDDeviceRequestOptions
): Promise<HIDDevice | null> {
  try {
    if (!("hid" in navigator)) throw new Error("WebHID not supported");

    const devices = await navigator.hid.requestDevice(options);
    if (devices && devices.length > 0) {
      return devices[0];
    }
    return null;
  } catch (error) {
    console.error("Error requesting HID device:", error);
    return null;
  }
}

export async function connectHIDDevice(device: HIDDevice): Promise<boolean> {
  try {
    await device.open();
    return true;
  } catch (error) {
    console.error("Error opening HID device:", error);
    return false;
  }
}

export async function sendHIDOutputReport(
  device: HIDDevice,
  reportId: number,
  data: Uint8Array
): Promise<void> {
  try {
    await device.sendReport(reportId, data);
  } catch (error) {
    console.error("Error sending HID output report:", error);
  }
}

export function addHIDInputReportListener(
  device: HIDDevice,
  callback: (event: HIDInputReportEvent) => void
): void {
  device.addEventListener("inputreport", callback);
}

export function removeHIDInputReportListener(
  device: HIDDevice,
  callback: (event: HIDInputReportEvent) => void
): void {
  device.removeEventListener("inputreport", callback);
}

export async function closeHIDDevice(device: HIDDevice): Promise<void> {
  try {
    await device.close();
  } catch (error) {
    console.error("Error closing HID device:", error);
  }
}

export type { HIDDeviceFilter, HIDDeviceRequestOptions, HIDInputReportEvent };
