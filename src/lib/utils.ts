import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function uid(): string {
  return crypto.randomUUID();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function timeAgo(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "var(--method-get)";
    case "POST":
      return "var(--method-post)";
    case "PUT":
      return "var(--method-put)";
    case "PATCH":
      return "var(--method-patch)";
    case "DELETE":
      return "var(--method-delete)";
    default:
      return "var(--muted)";
  }
}

export function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "var(--status-ok)";
  if (status >= 300 && status < 400) return "var(--status-redirect)";
  if (status >= 400 && status < 500) return "var(--status-warn)";
  return "var(--status-error)";
}

export function prettyJson(text: string): string | null {
  if (text.length > 2 * 1024 * 1024) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}
