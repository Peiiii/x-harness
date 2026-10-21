const $ = (id) => document.getElementById(id);
async function send(type, payload = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...payload });
  if (!result.ok) throw Error(result.error);
  return result.value;
}
async function refresh() {
  const { health: h, endpoints, captureError } = await send("snapshot");
  $("status").textContent = h
    ? `${h.running ? "正在采集" : "已停止"} · 开始 ${new Date(h.startedAt).toLocaleString()} · 截止 ${new Date(h.stopAt).toLocaleString()} · 最后写盘 ${new Date(h.lastFlushAt).toLocaleString()}`
    : "尚未开始采集。";
  $("totals").textContent = h
    ? `请求 ${h.requests}　响应 ${h.responses}　429 ${h.rejected429}　加载失败 ${h.failures}`
    : "暂无记录";
  $("endpoints").replaceChildren();
  for (const e of endpoints.sort((a, b) => b.requests - a.requests)) {
    const tr = document.createElement("tr");
    for (const value of [
      e.endpoint,
      e.requests,
      e.responses,
      e.rejected429,
      `${e.lastRate?.limit ?? "未知"}／${e.lastRate?.remaining ?? "未知"}${e.lastRate?.fromCache ? "（缓存）" : e.lastRate?.fromCache === false ? "" : "（缓存状态未确认）"}`,
      e.lastRate?.resetAt ?? "未知",
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.append(td);
    }
    $("endpoints").append(tr);
  }
  $("coverage").textContent = JSON.stringify(
    {
      gaps: h?.gaps ?? [],
      captureError: captureError ?? null,
      ageMs: h ? Date.now() - Date.parse(h.lastFlushAt) : null,
    },
    null,
    2,
  );
}
async function act(button, fn) {
  button.disabled = true;
  try {
    await fn();
    await refresh();
  } catch (e) {
    $("status").textContent = `本地观测异常：${e.message}`;
  } finally {
    button.disabled = false;
  }
}
$("start").onclick = () => act($("start"), () => send("start"));
$("stop").onclick = () => act($("stop"), () => send("stop"));
$("refresh").onclick = () => act($("refresh"), refresh);
$("export").onclick = () =>
  act($("export"), async () => {
    const data = await send("export");
    const through = data.health?.sequence ?? 0;
    const parts = [JSON.stringify(data).slice(0, -1) + ',"records":['];
    let offset = 0;
    for (;;) {
      const rows = await send("exportPage", { offset, through });
      if (!rows.length) break;
      parts.push((offset ? "," : "") + JSON.stringify(rows).slice(1, -1));
      offset += rows.length;
      if (rows.length < 1000) break;
    }
    parts.push("]}");
    const blob = new Blob(parts, { type: "application/json" });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `x-network-observation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
void refresh();
