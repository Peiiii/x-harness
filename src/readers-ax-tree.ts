import type { BoundaryRecord } from "./boundary.js";
export function parseAXNodes(state: string) {
  const nodes: any[] = [],
    stack: any[] = [];
  for (const line of state.split("\n")) {
    const match = line.match(/^(\s*)(\d+) (.*)$/);
    // Multiline post text such as "37 位中文主样本" is not an AX node.
    if (
      !match ||
      (!match[1] &&
        !/^(?:标准窗口|表单|对话框|sheet|dialog|window|menu bar)(?: |$)/i.test(
          match[3],
        ))
    ) {
      if (
        nodes.length &&
        line.trim() &&
        !/^The focused UI|Window:|Wall time:|Output:/.test(line)
      )
        nodes.at(-1).label += "\n" + line;
      continue;
    }
    const depth = match[1].replace(/\t/g, "    ").length;
    while (stack.length && nodes[stack.at(-1)].depth >= depth) stack.pop();
    // Chrome tab AX uses English role names; native app AX uses the canonical labels below.
    const label = match[3]
      .replace(/^link Description: /, "link ")
      .replace(/^combo box(?: \([^)]*\))? (?:Description: )?/, "组合框 ")
      .replace(/^button(?: \((?![^)]*disabled)[^)]*\))? /, "按钮 ")
      .replace(
        /^text entry area(?: \(settable\))? Description: /,
        "文本输入区域 ",
      );
    const node: BoundaryRecord = {
      index: Number(match[2]),
      label,
      depth,
      parent: stack.at(-1) ?? null,
    };
    nodes.push(node);
    stack.push(nodes.length - 1);
  }
  return nodes;
}
export function createAXTree(nodes: any[]) {
  const descendants = (i: any) => {
    let end = i + 1;
    while (end < nodes.length && nodes[end].depth > nodes[i].depth) end++;
    return nodes.slice(i + 1, end);
  };
  const leaf = (n: any) =>
    /^(?:文本(?: |$)|text |link |按钮 |弹出式按钮 |切换按钮 |标签 |tab |图像 |文本输入区(?:域)? |文本区域 |文本栏 |组合框 |单选按钮 |复选框 )/.test(
      n.label,
    ) || /^container [\d,.万亿KMB]+ 次(?:观看|查看)$/.test(n.label);
  const evidence = (ns: any) =>
    ns.filter(leaf).map(({ index, label }: any) => ({ index, label }));
  const navigation = nodes
    .filter(
      (n: any) =>
        /^(?:标准窗口|window|HTML 内容) .*URL:/.test(n.label) ||
        /^文本栏 .*地址和搜索栏/.test(n.label) ||
        /^按钮 (?:重新加载|新标签页)$/.test(n.label) ||
        n.label === "窗口" ||
        /, ID: makeKeyAndOrderFront:$/.test(n.label) ||
        /^标签 \((?:selected|settable)/.test(n.label) ||
        /^(?:tab|标签)(?: \([^)]*\))? (?:帖子|回复|转帖|媒体|文章|Posts|Replies|Reposts|Media|Articles)(?:,|$)/.test(
          n.label,
        ) ||
        /^组合框 (?:查询词条|Search)(?:,|$)/.test(n.label) ||
        /^link (?:主页|搜索和发现|通知|个人资料), Value: x\.com\//.test(
          n.label,
        ),
    )
    .map(({ index, label }: any) => ({ index, label }));
  const roots: any[] = [];
  const within = (node: any, root: any) => {
    let p = node.parent;
    while (p !== null) {
      if (p === root) return true;
      p = nodes[p].parent;
    }
    return false;
  };
  nodes.forEach((n: any, i: any) => {
    // Chrome's window container also contains @handle and every post link.
    if (
      !/^(?:container |article ).*@\w+/.test(n.label) ||
      /\bURL:/.test(n.label)
    )
      return;
    if (roots.some((root: any) => within(n, root))) return;
    if (
      descendants(i).some(
        (d: any) =>
          /^link /.test(d.label) && /x\.com\/\w+\/status\/\d+/.test(d.label),
      )
    )
      roots.push(i);
  });
  const peopleTimeline = nodes.findIndex((n: any) =>
    /^container 时间线：(认证关注者|关注者|正在关注)$/.test(n.label),
  );
  const peopleRoots =
    peopleTimeline < 0
      ? []
      : nodes
          .map((n: any, i: any) => ({ n, i }))
          .filter(
            ({ n, i }: any) =>
              within(n, peopleTimeline) &&
              /^按钮 .*@\w+(?: |$)/.test(n.label) &&
              descendants(i).some((d: any) =>
                /^link @\w+, Value: x\.com\/\w+(?:,|$)/.test(d.label),
              ),
          )
          .map(({ i }: any) => i);
  const warning =
    /抱歉.*限制|速度限制|请求异常|访问受限|验证码|验证挑战|登录以继续|captcha|rate limit/i;
  const explicitAlert = (n: any) => {
    let current = n;
    while (current) {
      if (
        /^(?:alert|警告|对话框|dialog|status|状态)(?: |$)/i.test(current.label)
      )
        return true;
      current = current.parent === null ? null : nodes[current.parent];
    }
    return /^(?:文本输入区(?:域)?|文本区域|文本栏|按钮) /i.test(n.label);
  };
  const alerts = nodes
    .filter(
      (n: any, i: any) =>
        warning.test(n.label) &&
        (![...roots, ...peopleRoots].some(
          (root: any) => i === root || within(n, root),
        ) ||
          explicitAlert(n)) &&
        !descendants(i).some((d: any) => warning.test(d.label)),
    )
    .map((n: any) => ({ index: n.index, label: n.label }));
  return {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  };
}
export type AXTree = ReturnType<typeof createAXTree>;
