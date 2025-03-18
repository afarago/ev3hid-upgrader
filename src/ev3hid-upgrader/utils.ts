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