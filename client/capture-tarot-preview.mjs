const [, , width, height, output] = process.argv;
const targets = await fetch("http://127.0.0.1:9237/json").then((response) =>
  response.json(),
);
const target = targets.find((item) => item.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
let id = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  pending.get(message.id)(message);
  pending.delete(message.id);
});
function send(method, params = {}) {
  const commandId = ++id;
  socket.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve) => pending.set(commandId, resolve));
}
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: Number(width) <= 800,
});
await send("Page.navigate", {
  url: "http://127.0.0.1:4185/tarot-preview.html",
});
await new Promise((resolve) => setTimeout(resolve, 1800));
const result = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
await import("node:fs").then(({ writeFileSync }) =>
  writeFileSync(output, Buffer.from(result.result.data, "base64")),
);
socket.close();
