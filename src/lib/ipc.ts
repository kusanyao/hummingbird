import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Collection,
  EnvironmentsFile,
  HistoryEntry,
  InitData,
  ResponseData,
  SendRequestInput,
  Settings,
} from "../types";

export function toAppError(error: unknown): AppError {
  if (typeof error === "string") {
    return { kind: "internal", message: error };
  }
  if (error && typeof error === "object") {
    const candidate = error as Partial<AppError>;
    if (typeof candidate.message === "string") {
      return {
        kind: typeof candidate.kind === "string" ? candidate.kind : "internal",
        message: candidate.message,
        detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
      };
    }
  }
  return { kind: "internal", message: "发生未知错误" };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppError(error);
  }
}

export const ipc = {
  init: () => call<InitData>("app_init"),
  settingsSave: (settings: Settings) => call<Settings>("settings_save", { settings }),
  collectionCreate: (name: string) => call<Collection>("collection_create", { name }),
  collectionSave: (collection: Collection) =>
    call<Collection>("collection_save", { collection }),
  collectionDelete: (id: string) => call<void>("collection_delete", { id }),
  environmentsSave: (env: EnvironmentsFile) =>
    call<EnvironmentsFile>("environments_save", { env }),
  historyList: (limit: number) => call<HistoryEntry[]>("history_list", { limit }),
  historyDelete: (id: string) => call<void>("history_delete", { id }),
  historyClear: () => call<void>("history_clear"),
  requestSend: (input: SendRequestInput) => call<ResponseData>("request_send", { input }),
  requestCancel: (requestId: string) => call<void>("request_cancel", { requestId }),
  openDataDir: () => call<void>("open_data_dir"),
};
