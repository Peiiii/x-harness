import type { BoundaryRecord } from "./boundary.js";
export const kinds = ["follow", "original", "reply"];
export const followWindows = [
  [600000, 20],
  [3600000, 100],
];
export const operations: BoundaryRecord = {
  follow: "submitFollow",
  original: "submitPost",
  reply: "submitReply",
};
export const same = (a: any, b: any) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
