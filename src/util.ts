const logdiv = document.getElementById("log");

export function log(...args: any[]) {
  console.log(...args);
  logdiv!.innerText += args.join(" ") + "\n";
}
