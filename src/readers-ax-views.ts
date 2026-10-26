import type { AXTree } from "./readers-ax-tree.js";
type AXProjection = {
  mode: string;
  page: string | undefined;
  offset: number;
  limit: number;
  targetId: string;
  targetHandle: string;
  unknown: (reason: string) => any;
  alertLines: string[];
};
export function projectAXFilepicker(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  const dialog = nodes.findIndex((n: any) =>
    /^(?:对话框|sheet|表单|dialog)(?: |$)/.test(n.label),
  );
  if (dialog < 0) return unknown("filepicker-dialog-not-found");
  const items = evidence(descendants(dialog)).filter(
    (n: any) =>
      /^(?:按钮 (?:\(disabled\) )?(?:打开|Open|前往|Go|取消|Cancel)(?:,|$)|文本栏 |组合框 )/.test(
        n.label,
      ) && !/URL:/.test(n.label),
  );
  const ready =
    items.some((n: any) =>
      /^按钮 (?:打开|Open|前往|Go)(?:,|$)/.test(n.label),
    ) || items.some((n: any) => /^(?:文本栏|组合框) /.test(n.label));
  return {
    mode,
    evidence: items,
    alerts: alertLines,
    pageComplete: false,
    needsStateCheck: !ready,
    missing: ready ? [] : ["filepicker-controls-not-found"],
  };
}
export function projectAXMedia(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  if (!/x\.com\/compose\/post\/media(?:[?#]|$)/.test(page ?? ""))
    return unknown("media-route-not-found");
  const web = nodes.findIndex((n: any) =>
    /^(?:HTML 内容|AXWebArea) .*URL: (?:https?:\/\/)?x\.com\/compose\/post\/media(?:,|$)/.test(
      n.label,
    ),
  );
  if (web < 0) return unknown("media-content-not-found");
  const items = evidence(descendants(web));
  return {
    mode,
    page,
    evidence: items,
    alerts: alertLines,
    pageComplete: false,
    needsStateCheck: !items.some((n: any) => /^按钮 保存(?:,|$)/.test(n.label)),
    missing: [],
  };
}
export function projectAXNavigation(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  return {
    mode,
    page,
    posts: [],
    evidence: navigation,
    alerts,
    pageComplete: false,
    needsStateCheck: !navigation.length,
    missing: navigation.length ? [] : ["navigation-not-found"],
  };
}
export function projectAXPeople(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  const all = peopleRoots.map((i: any) => ({
    handle: nodes[i].label.match(/@(\w+)/)[1],
    evidence: evidence(descendants(i)),
  }));
  const matches = targetHandle
    ? all.filter(
        (p: any) => p.handle.toLowerCase() === targetHandle.toLowerCase(),
      )
    : all;
  const missing =
    peopleTimeline < 0
      ? ["people-timeline-not-found"]
      : !matches.length
        ? ["person-not-found"]
        : targetHandle && matches.length > 1
          ? ["person-ambiguous"]
          : [];
  return {
    mode,
    page,
    posts: [],
    people: missing.length ? [] : matches.slice(offset, offset + limit),
    renderedPeople: all.length,
    matched: matches.length,
    offset,
    moreInDOM: matches.length > offset + limit,
    alerts,
    navigation: missing.length ? navigation : undefined,
    missing,
    needsStateCheck: !!missing.length,
    pageComplete: false,
  };
}
export function projectAXPosts(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  const all = roots.map((i: any) => {
    const postNodes = descendants(i);
    const items = evidence(postNodes);
    const authorHandle = nodes[i].label.match(/@(\w+)/)?.[1];
    const primary = items.find(
      (n: any) =>
        /^link /.test(n.label) &&
        n.label
          .match(/x\.com\/(\w+)\/status\/\d+(?:[?#][^\s,]*)?(?:,|$)/)?.[1]
          ?.toLowerCase() === authorHandle?.toLowerCase(),
    );
    const edited = postNodes.filter(
      (n: any) =>
        /^link 这是该帖子的最新版本。/.test(n.label) &&
        n.label
          .match(/x\.com\/(\w+)\/status\/\d+\/history(?:,|$)/)?.[1]
          ?.toLowerCase() === authorHandle?.toLowerCase() &&
        !postNodes.some(
          (q: any) =>
            /^(?:container |article )引用(?: |$)/.test(q.label) &&
            within(n, nodes.indexOf(q)),
        ),
    );
    const source = primary ?? (edited.length === 1 ? edited[0] : null);
    const match = source?.label.match(/x\.com\/(\w+)\/status\/(\d+)/);
    const text = postNodes
      .filter((n: any) => {
        if (!/^(?:文本 |text )/.test(n.label)) return false;
        let parent = n.parent;
        while (parent !== null && parent !== i) {
          if (/^(?:按钮|button)(?: |$)/.test(nodes[parent].label)) return false;
          parent = nodes[parent].parent;
        }
        return true;
      })
      .map((n: any) => n.label.replace(/^(?:文本 |text )/, ""))
      .join("\n");
    const absolute = source?.label.match(
      /link (上午|下午)?(\d{1,2}):(\d{2}) · (\d{4})年(\d{1,2})月(\d{1,2})日/,
    );
    let datetime: string | null = null;
    if (absolute) {
      let hour = Number(absolute[2]);
      if (absolute[1]) hour = (hour % 12) + (absolute[1] === "下午" ? 12 : 0);
      if (hour < 24 && Number(absolute[3]) < 60)
        datetime = new Date(
          Date.UTC(
            Number(absolute[4]),
            Number(absolute[5]) - 1,
            Number(absolute[6]),
            hour - 8,
            Number(absolute[3]),
          ),
        ).toISOString();
    }
    return {
      id: match?.[2] ?? null,
      author: match?.[1] ?? null,
      primary: source?.label ?? null,
      datetime,
      ...(datetime ? { datetimePrecision: "minute" } : {}),
      timeEvidence: source?.label ?? null,
      text,
      evidence: items,
      needsExpansion:
        /显示更多|Show more/i.test(text) ||
        items.some((n: any) => /显示更多|Show more/i.test(n.label)),
      missing: [
        !match && "id",
        !text && "text",
        !datetime && "datetime",
      ].filter(Boolean),
    };
  });
  const candidates = targetId ? all.filter((p: any) => p.id === targetId) : all;
  return {
    mode,
    page,
    renderedArticles: all.length,
    matched: candidates.length,
    offset,
    moreInDOM: candidates.length > offset + limit,
    pageComplete: false,
    needsStateCheck: candidates.length === 0,
    missing: candidates.length ? [] : ["post-not-found"],
    posts: candidates.slice(offset, offset + limit),
    alerts,
    navigation: candidates.length ? undefined : navigation,
  };
}
export function projectAXProfile(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  const start = nodes.findIndex((n: any) => n.label === "container 主页时间线");
  if (start < 0)
    return { ...unknown("profile-not-found"), page, alerts, navigation };
  const main = descendants(start),
    end = main.findIndex((n: any) => /container 个人资料时间线/.test(n.label));
  if (end < 0)
    return {
      ...unknown("profile-boundary-not-found"),
      page,
      alerts,
      navigation,
    };
  return {
    mode,
    page,
    posts: [],
    evidence: evidence(main.slice(0, end)),
    alerts,
    pageComplete: false,
    needsStateCheck: false,
  };
}
export function projectAXComposer(tree: AXTree, context: AXProjection) {
  const {
    nodes,
    descendants,
    evidence,
    navigation,
    roots,
    peopleRoots,
    peopleTimeline,
    within,
    alerts,
  } = tree;
  const {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  } = context;
  if (/x\.com\/home(?:[?#]|$)/.test(page ?? "")) {
    const web = nodes.findIndex((n: any) =>
      /^(?:HTML 内容|AXWebArea) .*URL: (?:https?:\/\/)?x\.com\/home(?:,|$)/.test(
        n.label,
      ),
    );
    const items = web < 0 ? [] : evidence(descendants(web));
    const own = items.filter((n: any) =>
      /^link 个人资料, Value: x\.com\/\w+$/.test(n.label),
    );
    const editors = items.filter((n: any) =>
      /^(?:文本输入区(?:域)?|文本区域) .*帖子文本/.test(n.label),
    );
    const submits = items.filter((n: any) =>
      /^按钮 (?:\(disabled\) )?(?:发帖|Post)(?:,|$)/i.test(n.label),
    );
    if (own.length === 1 && editors.length === 1 && submits.length === 1)
      return {
        mode,
        page,
        posts: [],
        evidence: [...editors, ...submits],
        alerts,
        pageComplete: false,
        needsStateCheck: false,
      };
    return { ...unknown("home-composer-boundary-unconfirmed"), page, alerts };
  }
  const dialog = nodes.findIndex((n: any) =>
    /^(?:对话框|dialog)(?: |$)/.test(n.label),
  );
  if (dialog < 0) {
    const web = nodes.findIndex((n: any) =>
      /^(?:HTML 内容|AXWebArea) .*URL: (?:https?:\/\/)?x\.com\/compose\/post(?:,|$)/.test(
        n.label,
      ),
    );
    if (/x\.com\/compose\/post(?:[?#]|$)/.test(page ?? "") && web >= 0) {
      const items = evidence(descendants(web));
      const editors = items.filter((n: any) =>
        /^(?:文本输入区(?:域)?|文本区域) .*帖子文本/.test(n.label),
      );
      const submits = items.filter((n: any) =>
        /^按钮 (?:\(disabled\) )?(?:发帖|Post)(?:,|$)/i.test(n.label),
      );
      if (editors.length === 1 && submits.length === 1)
        return {
          mode,
          page,
          posts: [],
          evidence: items,
          alerts,
          pageComplete: false,
          needsStateCheck: false,
        };
    }
    const editors = nodes.filter((n: any) =>
      /^(?:文本输入区(?:域)?|文本区域|文本栏) /.test(n.label),
    );
    const submits = nodes.filter((n: any) =>
      /^按钮 (?:回复|Reply)(?:,|$)/i.test(n.label),
    );
    if (
      /x\.com\/\w+\/status\/\d+(?:[?#]|$)/.test(page ?? "") &&
      editors.length === 1 &&
      submits.length === 1
    ) {
      return {
        mode,
        page,
        inlineComposer: true,
        posts: [],
        evidence: evidence([...editors, ...submits]),
        alerts,
        pageComplete: false,
        needsStateCheck: false,
      };
    }
    return {
      ...unknown("composer-dialog-not-found"),
      page,
      alerts,
      navigation,
    };
  }
  const items = evidence(descendants(dialog));
  if (
    !items.some((n: any) =>
      /^(?:文本输入区(?:域)?|文本区域|文本栏) /.test(n.label),
    ) ||
    !items.some((n: any) =>
      /^按钮 (?:发帖|发布|回复|Post|Reply)(?:,|$)/i.test(n.label),
    )
  ) {
    return {
      ...unknown("composer-boundary-unconfirmed"),
      page,
      alerts,
      navigation,
    };
  }
  return {
    mode,
    page,
    posts: [],
    evidence: items,
    alerts,
    pageComplete: false,
    needsStateCheck: false,
  };
}
