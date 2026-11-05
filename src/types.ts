export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyType = "none" | "json" | "text" | "formUrlEncoded" | "multipart";

export interface RequestBody {
  type: BodyType;
  raw: string;
  fields: KeyValue[];
}

export type AuthType = "none" | "bearer" | "basic" | "apiKey";

export interface Auth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  key: string;
  value: string;
  location: "header" | "query";
}

export interface RequestSpec {
  method: string;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
}

export interface CollectionItem {
  id: string;
  kind: "folder" | "request";
  name: string;
  parentId: string | null;
  order: number;
  spec: RequestSpec | null;
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface EnvironmentsFile {
  schemaVersion: number;
  activeId: string | null;
  environments: Environment[];
  globals: KeyValue[];
}

export interface Settings {
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
  verifyTls: boolean;
  maxResponseBytes: number;
  historyLimit: number;
  theme: "dark" | "light";
  splitRatio: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  name: string;
  method: string;
  url: string;
  status: number | null;
  durationMs: number;
  sizeBytes: number;
  error: string | null;
  spec: RequestSpec;
}

export interface HeaderPair {
  name: string;
  value: string;
}

export interface ResponseData {
  requestId: string;
  status: number;
  statusText: string;
  headers: HeaderPair[];
  bodyText: string;
  isBinary: boolean;
  sizeBytes: number;
  truncated: boolean;
  durationMs: number;
  finalUrl: string;
  receivedAt: number;
}

export interface InitData {
  settings: Settings;
  collections: Collection[];
  env: EnvironmentsFile;
  history: HistoryEntry[];
  dataDir: string;
  version: string;
}

export interface AppError {
  kind: string;
  message: string;
  detail?: string;
}

export interface SendRequestInput {
  requestId: string;
  name: string;
  spec: RequestSpec;
}

export interface CurlImport {
  spec: RequestSpec;
  warnings: string[];
}

export interface DiagnoseStep {
  name: string;
  ok: boolean;
  skipped: boolean;
  detail: string;
  durationMs: number;
}

export interface DiagnoseReport {
  target: string;
  host: string;
  port: number;
  direct: DiagnoseStep[];
  proxy: DiagnoseStep[];
  proxyUrl: string | null;
  conclusion: string;
  advice: string | null;
}

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export const DEFAULT_SETTINGS: Settings = {
  timeoutMs: 30000,
  followRedirects: true,
  maxRedirects: 5,
  verifyTls: true,
  maxResponseBytes: 10 * 1024 * 1024,
  historyLimit: 500,
  theme: "dark",
  splitRatio: 0.56,
};

export function emptyRow(): KeyValue {
  return { key: "", value: "", enabled: true };
}

export function createSpec(): RequestSpec {
  return {
    method: "GET",
    url: "",
    params: [emptyRow()],
    headers: [emptyRow()],
    body: { type: "none", raw: "", fields: [emptyRow()] },
    auth: {
      type: "none",
      token: "",
      username: "",
      password: "",
      key: "",
      value: "",
      location: "header",
    },
  };
}

export function cloneSpec(spec: RequestSpec): RequestSpec {
  return JSON.parse(JSON.stringify(spec)) as RequestSpec;
}

export function cloneEnvironments(file: EnvironmentsFile): EnvironmentsFile {
  return JSON.parse(JSON.stringify(file)) as EnvironmentsFile;
}
