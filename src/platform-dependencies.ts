import type { CreatorOptions } from "./types.js";
import type { BoundaryRecord } from "./boundary.js";
export interface PlatformDependencies {
  browser: BoundaryRecord;
  clock: () => number;
  followStage: (action: any, stage: any, run: any) => Promise<any>;
  missing: (operation: any) => any[];
  observed: (query: any) => Promise<any>;
  open: (target: any, query: any) => Promise<any>;
  ready: (query: any) => Promise<any>;
  choose: (
    value: any,
    pattern: any,
    { activateSelected }?: any,
  ) => Promise<any>;
  source: (
    post: any,
    page: any,
  ) => {
    id: any;
    author: any;
    datetime: any;
    url: string | null;
    body: any;
    images: any;
    media: any;
    links: any;
    needsExpansion: any;
    missing: any[];
  };
  collectSources: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
  compose: (action: any) => Promise<any>;
  preflight: ({ operation, input }: any) => any;
  readCreator: (args: CreatorOptions) => Promise<any>;
  readAccount: () => Promise<any>;
  readBookmarks: ({ folder, ...window }?: any) => Promise<any>;
  searchSources: ({
    query,
    limit,
    maxPages,
    processedIds,
  }?: any) => Promise<any>;
  readFeedback: ({ targets, replyLimit }?: any) => Promise<any>;
  readPerson: (target: any) => Promise<any>;
  readPost: (target: any) => Promise<any>;
  findSubmission: (action: any) => Promise<any>;
  submitFollow: (action: any) => Promise<any>;
  submitPost: (action: any) => Promise<any>;
  submitReply: (action: any) => Promise<any>;
  captureProof: ({ observation }: any) => {
    followDiagnostics?: any[] | undefined;
    capturedAt: string;
    observation: any;
  };
}
