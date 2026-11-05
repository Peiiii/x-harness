export function selectReplyControl(buttons: any[], postId: string) {
  const replyControls = buttons.filter((button) =>
    /回复|Reply/i.test(button.label),
  );
  const targets = replyControls.filter(
    (button) => button.ownerPostId === postId && !button.disabled,
  );
  if (
    !targets.length ||
    targets.some((button) => button.label !== targets[0].label)
  )
    throw new Error("回复按钮未唯一观察");
  // Duplicate controls are safe only when each enabled match belongs to the
  // exact target post and has the same observed action label.
  return {
    replyControls,
    target: targets[0],
    index: replyControls.indexOf(targets[0]),
  };
}
