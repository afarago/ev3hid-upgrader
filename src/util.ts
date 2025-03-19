const logdiv = document.getElementById('log');
// Use Shadow DOM for better performance
if (!logdiv!.shadowRoot) {
    const shadowRoot = logdiv!.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadowRoot.appendChild(container);

    const styleElement = document.createElement('style');
    styleElement.textContent = 'pre { margin-block: 0; }';
    shadowRoot.appendChild(styleElement);
}
const container = logdiv!.shadowRoot!.querySelector('div')!;

function keepLastXChildrenArray(container: HTMLDivElement, count: number) {
    if (container.children.length > count) {
        const children = Array.from(container.children);
        const childCount = children.length;
        const elementsToRemove = children.slice(0, childCount - count); // Get the elements to remove

        elementsToRemove.forEach((child) => {
            container.removeChild(child);
        });
    }
}

export function log(...args: any[]) {
    setTimeout(() => {
        console.log(args);
        const pre = document.createElement('pre');
        pre.textContent = args.join('\t');

        // logdiv!.scrollTo(0, logdiv!.scrollHeight);
        // console.log(2);
        container.appendChild(pre);
        keepLastXChildrenArray(container, 500);
        logdiv!.shadowRoot!.host.scrollTop = logdiv!.shadowRoot!.host.scrollHeight;
    }, 0);
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
