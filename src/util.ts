const logdiv = document.getElementById("log");

export function log(...args: any[]) {
  //   console.log(...args);
  const pre = document.createElement("pre");
  pre.textContent = args.join(" ");
  logdiv!.appendChild(pre);
  logdiv!.scrollTop = logdiv!.scrollHeight;
}

const msgcount = document.getElementById("message-count");
export function updateMsgCount(count: number, status: boolean) {
  msgcount!.innerText = `${count}${status ? "-" : "+"}`;
}
