export interface DOMSession {
  current?: any;
  replyBinding?: any;
  quoteBinding?: any;
  refreshNotice?: any;
  editBinding?: any;
}
export interface DOMDependencies {
  tab: any;
  nativeSubmit: boolean;
  readDOM: any;
  session: DOMSession;
  submitAX: any;
  observe: (query: any) => Promise<any>;
  locator: (role: any, name?: any) => any;
  unique: (loc: any) => Promise<any>;
}
