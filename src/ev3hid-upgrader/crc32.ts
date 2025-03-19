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
