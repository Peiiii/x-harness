export interface DOMSession {
  current?: any;
  originalReceiptReload?: { text: string; accountHandle: string };
  replyBinding?: any;
  quoteBinding?: any;
  quoteClientReturn?: { parent: string; source: string };
  refreshNotice?: any;
  editBinding?: any;
}
export interface DOMDependencies {
  captureSubmissionNetwork?: boolean;
  trace?: <T>(stage: string, run: () => Promise<T>) => Promise<T>;
  tab: any;
  nativeSubmit: boolean;
  readDOM: any;
  session: DOMSession;
  submitAX: any;
  observe: (query: any) => Promise<any>;
  locator: (role: any, name?: any) => any;
  unique: (loc: any) => Promise<any>;
}
