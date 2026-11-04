import { useEffect, useState } from "react";
import { useTabs } from "../stores/tabs";
import { useUI } from "../stores/ui";
import { useWorkspace } from "../stores/workspace";
import type { CollectionItem } from "../types";
import { uid } from "../lib/utils";
import { Modal } from "./common/Modal";

export function SaveDialog() {
  const tabId = useUI((state) => state.saveDialogTabId);
  const setTabId = useUI((state) => state.setSaveDialogTabId);
  const notify = useUI((state) => state.notify);
  const tab = useTabs((state) =>
    tabId ? state.tabs.find((item) => item.id === tabId) : undefined,
  );
  const attach = useTabs((state) => state.attach);
  const collections = useWorkspace((state) => state.collections);
  const saveCollection = useWorkspace((state) => state.saveCollection);
  const createCollection = useWorkspace((state) => state.createCollection);

  const [collectionId, setCollectionId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [name, setName] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");

  useEffect(() => {
    if (!tabId) return;
    setCollectionId(collections[0]?.id ?? "");
    setFolderId("");
    setName(tab?.title ?? "未命名请求");
    setNewCollectionName("");
    // Reset the form only when the dialog opens for a tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  const collection = collections.find((item) => item.id === collectionId);
  const folders = collection?.items.filter((item) => item.kind === "folder") ?? [];

  const handleSave = async () => {
    if (!tab) return;
    let target = collection;
    if (!target) {
      const created = await createCollection(newCollectionName.trim() || "未命名集合");
      if (!created) return;
      target = created;
    }
    const maxOrder = target.items.reduce((max, item) => Math.max(max, item.order), 0);
    const item: CollectionItem = {
      id: uid(),
      kind: "request",
      name: name.trim() || "未命名请求",
      parentId: folderId || null,
      order: maxOrder + 1,
      spec: tab.spec,
    };
    const saved = await saveCollection({ ...target, items: [...target.items, item] });
    if (saved) {
      attach(tab.id, { collectionId: target.id, itemId: item.id }, item.name);
      notify("已保存到集合", "success");
      setTabId(null);
    } else {
      notify("保存失败", "error");
    }
  };

  return (
    <Modal
      open={!!tabId}
      title="保存请求"
      onClose={() => setTabId(null)}
      footer={
        <>
          <button className="btn" onClick={() => setTabId(null)}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()}>
            保存
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div>
          <label className="field-label">请求名称</label>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {collections.length > 0 ? (
          <>
            <div>
              <label className="field-label">集合</label>
              <select
                className="select"
                value={collectionId}
                onChange={(event) => {
                  setCollectionId(event.target.value);
                  setFolderId("");
                }}
              >
                {collections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">文件夹（可选）</label>
              <select
                className="select"
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
              >
                <option value="">集合根目录</option>
                {folders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="field-label">新建集合</label>
            <input
              className="input"
              placeholder="例如：用户服务"
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
