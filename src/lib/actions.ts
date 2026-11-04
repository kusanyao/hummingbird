import { ipc, toAppError } from "./ipc";
import { useTabs } from "../stores/tabs";
import { useUI } from "../stores/ui";
import { useWorkspace } from "../stores/workspace";

/** Persists a tab that is backed by a collection item. */
export async function saveTabToCollection(tabId: string): Promise<boolean> {
  const tabs = useTabs.getState();
  const tab = tabs.tabs.find((item) => item.id === tabId);
  if (!tab?.ref) return false;

  const workspace = useWorkspace.getState();
  const collection = workspace.collections.find(
    (item) => item.id === tab.ref?.collectionId,
  );
  if (!collection) return false;

  const items = collection.items.map((item) =>
    item.id === tab.ref?.itemId
      ? { ...item, name: tab.title, spec: tab.spec }
      : item,
  );
  const saved = await workspace.saveCollection({ ...collection, items });
  if (saved) tabs.markSaved(tab.id);
  return saved;
}

export async function sendTab(tabId: string): Promise<void> {
  const store = useTabs.getState();
  const tab = store.tabs.find((item) => item.id === tabId);
  if (!tab || tab.sending) return;
  if (!tab.spec.url.trim()) {
    useUI.getState().notify("请先填写请求 URL", "error");
    return;
  }

  store.setSending(tab.id, true);
  store.setError(tab.id, undefined);
  try {
    const response = await ipc.requestSend({
      requestId: tab.id,
      name: tab.title,
      spec: tab.spec,
    });
    useTabs.getState().setResponse(tab.id, response);
    await useWorkspace.getState().refreshHistory();
  } catch (error) {
    useTabs.getState().setError(tab.id, toAppError(error));
  } finally {
    useTabs.getState().setSending(tab.id, false);
  }
}

/** Saves pending edits (if any) before closing a tab. */
export async function closeTabSafely(tabId: string): Promise<void> {
  const tab = useTabs.getState().tabs.find((item) => item.id === tabId);
  if (tab?.ref && tab.dirty) {
    await saveTabToCollection(tabId);
  }
  useTabs.getState().closeTab(tabId);
}

export async function cancelTab(tabId: string): Promise<void> {
  try {
    await ipc.requestCancel(tabId);
  } catch (error) {
    useUI.getState().notify(toAppError(error).message, "error");
  }
}
