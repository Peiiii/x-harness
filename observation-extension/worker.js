import { NativeObservationStore } from "./store.js";
import { captureURLs } from "./event-adapter.js";
const store = new NativeObservationStore({ indexedDB });
let sessionPromise;
function session() {
  return (sessionPromise ??= (async () => {
    const saved = await chrome.storage.session.get("networkSessionId");
    if (saved.networkSessionId) return saved.networkSessionId;
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ networkSessionId: id });
    return id;
  })());
}
async function captureFailure(error) {
  await chrome.storage.local.set({
    captureError: {
      code: /^[A-Za-z]+Error$/.test(error?.name)
        ? error.name
        : "capture-failed",
      at: new Date().toISOString(),
      lostEvents: null,
    },
  });
}
for (const [event, phase] of [
  ["onBeforeRequest", "request"],
  ["onHeadersReceived", "response"],
  ["onResponseStarted", "cache"],
  ["onCompleted", "completed"],
  ["onErrorOccurred", "failed"],
]) {
  chrome.webRequest[event].addListener(
    (details) => {
      void session()
        .then((id) => store.record(phase, details, id))
        .catch(captureFailure);
    },
    { urls: captureURLs },
    ...(phase === "response" ? [["responseHeaders"]] : []),
  );
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "x-network-health")
    void session()
      .then((id) => store.heartbeat(id))
      .catch(captureFailure);
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("x-network-health", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create("x-network-health", { periodInMinutes: 1 });
  void session()
    .then((id) => store.heartbeat(id))
    .catch(captureFailure);
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const run = async () => {
    if (message.type === "start") {
      await chrome.alarms.create("x-network-health", { periodInMinutes: 1 });
      return store.start(await session());
    }
    if (message.type === "stop") return store.stop();
    if (message.type === "snapshot")
      return {
        ...(await store.snapshot()),
        ...(await chrome.storage.local.get("captureError")),
      };
    if (message.type === "exportPage")
      return store.exportPage(message.offset, message.through);
    if (message.type === "export")
      return {
        ...(await store.exportMetadata()),
        ...(await chrome.storage.local.get("captureError")),
      };
    throw Error("unsupported-message");
  };
  void run().then(
    (value) => reply({ ok: true, value }),
    () => reply({ ok: false, error: "local-observation-error" }),
  );
  return true;
});
