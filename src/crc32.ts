export function mycrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);

  // Generate CRC32 table
  for (let i = 0; i < 256; i++) {
    let temp = i;
    for (let j = 0; j < 8; j++) {
      if (temp & 1) {
        temp = (temp >>> 1) ^ 0xedb88320;
      } else {
        temp >>>= 1;
      }
    }
    table[i] = temp;
  }

  // Calculate CRC32
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }

  //if (x < 0) x = x + 0x100000000;
  return crc ^ 0xffffffff;
}

// // Example usage:
// function stringToUint8Array(str: string): Uint8Array {
//   const encoder = new TextEncoder();
//   return encoder.encode(str);
// }

// function calculateBrowserCRC32(
//   data: string | ArrayBuffer | Uint8Array
// ): number {
//   let uint8Array: Uint8Array;

//   if (typeof data === "string") {
//     uint8Array = new TextEncoder().encode(data);
//   } else if (data instanceof ArrayBuffer) {
//     uint8Array = new Uint8Array(data);
//   } else if (data instanceof Uint8Array) {
//     uint8Array = data;
//   } else {
//     throw new Error(
//       "Invalid data type provided. Must be string, ArrayBuffer, or Uint8Array."
//     );
//   }

//   const buf = Buffer.from(uint8Array);
//   // Convert Uint8Array to a standard array of numbers for buffer-crc32
//   // console.log("crc32", buf);
//   return crc32.signed(buf);
//   // create a signed int from the buffer-crc32 result
// }
