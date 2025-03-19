const logdiv = document.getElementById('log');

export function log(...args: any[]) {
    //   console.log(...args);
    const pre = document.createElement('pre');
    pre.textContent = args.join(' ');
    logdiv!.appendChild(pre);
    logdiv!.scrollTop = logdiv!.scrollHeight;
}

const msgcount = document.getElementById('message-count');
export function updateMsgCount(count: number, status: boolean) {
    msgcount!.innerText = `${count}${status ? '+' : '-'}`;
}

// Formats an 8-bit integer |value| in hexadecimal with leading zeros.
export const hex8 = (value: number) => {
    return `00${value.toString(16)}`.substr(-2).toUpperCase();
};

// Formats a 16-bit integer |value| in hexadecimal with leading zeros.
export const hex16 = (value: number) => {
    return `0000${value.toString(16)}`.substr(-4).toUpperCase();
};
