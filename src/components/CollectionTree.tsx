import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileJson,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTabs } from "../stores/tabs";
import { useWorkspace } from "../stores/workspace";
import type { Collection, CollectionItem } from "../types";
import { Modal } from "./common/Modal";

interface MenuState {
  x: number;
  y: number;
  collectionId: string;
  item?: CollectionItem;
}

interface ConfirmState {
  kind: "collection" | "item";
  collectionId: string;
  itemId?: string;
  name: string;
}

interface RenameState {
  collectionId: string;
  itemId?: string;
}

function sortItems(items: CollectionItem[]): CollectionItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function CollectionTree() {
  const collections = useWorkspace((state) => state.collections);
  const createCollection = useWorkspace((state) => state.createCollection);
  const createItem = useWorkspace((state) => state.createItem);
  const updateItem = useWorkspace((state) => state.updateItem);
  const saveCollection = useWorkspace((state) => state.saveCollection);
  const deleteCollection = useWorkspace((state) => state.deleteCollection);
  const deleteItem = useWorkspace((state) => state.deleteItem);
  const openRequest = useTabs((state) => state.openRequest);
  const activeRef = useTabs((state) => {
    const tab = state.tabs.find((item) => item.id === state.activeId);
    return tab?.ref;
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (collectionId: string, itemId: string | undefined, name: string) => {
    setRenaming({ collectionId, itemId });
    setRenameValue(name);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const target = renaming;
    setRenaming(null);
    const value = renameValue.trim();
    if (!value) return;
    if (target.itemId) {
      await updateItem(target.collectionId, target.itemId, { name: value });
      const tabsState = useTabs.getState();
      tabsState.tabs
        .filter(
          (tab) =>
            tab.ref?.collectionId === target.collectionId &&
            tab.ref.itemId === target.itemId,
        )
        .forEach((tab) => tabsState.updateTitle(tab.id, value));
    } else {
      const collection = collections.find((item) => item.id === target.collectionId);
      if (collection) await saveCollection({ ...collection, name: value });
    }
  };

  const handleNewCollection = async () => {
    const collection = await createCollection();
    if (collection) startRename(collection.id, undefined, collection.name);
  };

  const handleNewItem = async (
    collectionId: string,
    parentId: string | null,
    kind: "folder" | "request",
  ) => {
    const item = await createItem(collectionId, kind, parentId);
    if (!item) return;
    if (kind === "request" && item.spec) {
      openRequest(collectionId, item.id, item.name, item.spec);
    }
    startRename(collectionId, item.id, item.name);
  };

  const duplicateRequest = async (collection: Collection, item: CollectionItem) => {
    if (!item.spec) return;
    const created = await createItem(
      collection.id,
      "request",
      item.parentId,
      `${item.name} 副本`,
    );
    if (created) {
      await useWorkspace.getState().updateItem(collection.id, created.id, {
        spec: JSON.parse(JSON.stringify(item.spec)),
      });
    }
  };

  const confirmDelete = async () => {
    if (!confirm) return;
    if (confirm.kind === "collection") {
      await deleteCollection(confirm.collectionId);
      closeTabs((ref) => ref.collectionId === confirm.collectionId);
    } else if (confirm.itemId) {
      const itemId = confirm.itemId;
      await deleteItem(confirm.collectionId, itemId);
      closeTabs((ref) => ref.itemId === itemId);
    }
    setConfirm(null);
  };

  const closeTabs = (predicate: (ref: { collectionId: string; itemId: string }) => boolean) => {
    const tabsState = useTabs.getState();
    tabsState.tabs
      .filter((tab) => tab.ref && predicate(tab.ref))
      .forEach((tab) => tabsState.closeTab(tab.id));
  };

  const openMenu = (
    event: MouseEvent,
    collectionId: string,
    item?: CollectionItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 230),
      collectionId,
      item,
    });
  };

  const renameRow = (collectionId: string, itemId: string | undefined, name: string) => {
    if (renaming?.collectionId === collectionId && renaming.itemId === itemId) {
      return (
        <input
          className="rename-input"
          autoFocus
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void commitRename();
            if (event.key === "Escape") setRenaming(null);
          }}
          onBlur={() => void commitRename()}
        />
      );
    }
    return <span className="label">{name}</span>;
  };

  const renderItem = (
    collection: Collection,
    item: CollectionItem,
    depth: number,
  ): ReactNode => {
    const isFolder = item.kind === "folder";
    const isCollapsed = collapsed.has(item.id);
    const isActive =
      activeRef?.collectionId === collection.id && activeRef?.itemId === item.id;

    return (
      <div key={item.id}>
        <div
          className={`tree-row ${isActive ? "active" : ""}`}
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => {
            if (isFolder) toggle(item.id);
            else if (item.spec) {
              openRequest(collection.id, item.id, item.name, item.spec);
            }
          }}
          onContextMenu={(event) => openMenu(event, collection.id, item)}
        >
          {isFolder ? (
            <span className="chevron">
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
          ) : (
            <span className="chevron" />
          )}
          {isFolder ? (
            isCollapsed ? (
              <Folder size={13} style={{ color: "var(--muted)" }} />
            ) : (
              <FolderOpen size={13} style={{ color: "var(--accent)" }} />
            )
          ) : (
            <FileJson size={13} style={{ color: isActive ? "var(--accent)" : "var(--muted)" }} />
          )}
          {renameRow(collection.id, item.id, item.name)}
          <span className="row-actions">
            {isFolder ? (
              <button
                className="icon-btn"
                title="在此文件夹中新建请求"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleNewItem(collection.id, item.id, "request");
                }}
              >
                <Plus size={12} />
              </button>
            ) : null}
            <button
              className="icon-btn"
              title="更多"
              onClick={(event) => openMenu(event, collection.id, item)}
            >
              <MoreHorizontal size={13} />
            </button>
          </span>
        </div>
        {isFolder && !isCollapsed
          ? sortItems(collection.items.filter((child) => child.parentId === item.id)).map(
              (child) => renderItem(collection, child, depth + 1),
            )
          : null}
      </div>
    );
  };

  const renderCollection = (collection: Collection) => {
    const isCollapsed = collapsed.has(collection.id);
    return (
      <div key={collection.id} style={{ marginBottom: 2 }}>
        <div
          className="tree-row"
          style={{ fontWeight: 600 }}
          onClick={() => toggle(collection.id)}
          onContextMenu={(event) => openMenu(event, collection.id)}
        >
          <span className="chevron">
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <FolderOpen size={13} style={{ color: "var(--accent)" }} />
          {renaming?.collectionId === collection.id && !renaming.itemId ? (
            <input
              className="rename-input"
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitRename();
                if (event.key === "Escape") setRenaming(null);
              }}
              onBlur={() => void commitRename()}
            />
          ) : (
            <span className="label">{collection.name}</span>
          )}
          <span className="count">
            {collection.items.filter((item) => item.kind === "request").length}
          </span>
          <span className="row-actions">
            <button
              className="icon-btn"
              title="新建请求"
              onClick={(event) => {
                event.stopPropagation();
                void handleNewItem(collection.id, null, "request");
              }}
            >
              <Plus size={12} />
            </button>
            <button
              className="icon-btn"
              title="更多"
              onClick={(event) => openMenu(event, collection.id)}
            >
              <MoreHorizontal size={13} />
            </button>
          </span>
        </div>
        {!isCollapsed
          ? sortItems(collection.items.filter((item) => !item.parentId)).map((item) =>
              renderItem(collection, item, 1),
            )
          : null}
      </div>
    );
  };

  const searchResults = query.trim()
    ? collections.flatMap((collection) =>
        collection.items
          .filter(
            (item) =>
              item.kind === "request" &&
              item.spec &&
              item.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .map((item) => ({ collection, item })),
      )
    : [];

  const menuCollection = menu
    ? collections.find((collection) => collection.id === menu.collectionId)
    : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <input
        className="search-input"
        placeholder="搜索请求…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="tree-scroll">
        {query.trim() ? (
          searchResults.length === 0 ? (
            <div className="empty-state" style={{ height: 120 }}>
              没有匹配的请求
            </div>
          ) : (
            searchResults.map(({ collection, item }) => (
              <div
                className="tree-row"
                key={`${collection.id}-${item.id}`}
                onClick={() => item.spec && openRequest(collection.id, item.id, item.name, item.spec)}
              >
                <span className="chevron" />
                <FileJson size={13} style={{ color: "var(--muted)" }} />
                <span className="label">{item.name}</span>
                <span className="count">{collection.name}</span>
              </div>
            ))
          )
        ) : collections.length === 0 ? (
          <div className="empty-state" style={{ height: 160 }}>
            <div>还没有集合</div>
            <button className="btn btn-primary btn-sm" onClick={() => void handleNewCollection()}>
              新建集合
            </button>
          </div>
        ) : (
          collections.map(renderCollection)
        )}
      </div>

      <div className="sidebar-footer" style={{ borderTop: "none", paddingTop: 0 }}>
        <button className="btn btn-sm" onClick={() => void handleNewCollection()}>
          <Plus size={12} /> 新建集合
        </button>
      </div>

      {menu && menuCollection ? (
        <div
          className="menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {menu.item ? (
            <>
              {menu.item.kind === "request" ? (
                <button
                  className="menu-item"
                  onClick={() => {
                    if (menu.item?.spec) {
                      openRequest(
                        menuCollection.id,
                        menu.item.id,
                        menu.item.name,
                        menu.item.spec,
                      );
                    }
                    setMenu(null);
                  }}
                >
                  <FileJson size={13} /> 打开
                </button>
              ) : null}
              <button
                className="menu-item"
                onClick={() => {
                  void handleNewItem(
                    menuCollection.id,
                    menu.item!.kind === "folder" ? menu.item!.id : menu.item!.parentId,
                    "request",
                  );
                  setMenu(null);
                }}
              >
                <Plus size={13} /> 新建请求
              </button>
              {menu.item.kind === "folder" ? (
                <button
                  className="menu-item"
                  onClick={() => {
                    void handleNewItem(menuCollection.id, menu.item!.id, "folder");
                    setMenu(null);
                  }}
                >
                  <Folder size={13} /> 新建子文件夹
                </button>
              ) : (
                <button
                  className="menu-item"
                  onClick={() => {
                    void duplicateRequest(menuCollection, menu.item!);
                    setMenu(null);
                  }}
                >
                  <Copy size={13} /> 复制
                </button>
              )}
              <button
                className="menu-item"
                onClick={() => {
                  startRename(menuCollection.id, menu.item!.id, menu.item!.name);
                  setMenu(null);
                }}
              >
                <Pencil size={13} /> 重命名
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item danger"
                onClick={() => {
                  setConfirm({
                    kind: "item",
                    collectionId: menuCollection.id,
                    itemId: menu.item!.id,
                    name: menu.item!.name,
                  });
                  setMenu(null);
                }}
              >
                <Trash2 size={13} /> 删除
              </button>
            </>
          ) : (
            <>
              <button
                className="menu-item"
                onClick={() => {
                  void handleNewItem(menuCollection.id, null, "request");
                  setMenu(null);
                }}
              >
                <Plus size={13} /> 新建请求
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  void handleNewItem(menuCollection.id, null, "folder");
                  setMenu(null);
                }}
              >
                <Folder size={13} /> 新建文件夹
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  startRename(menuCollection.id, undefined, menuCollection.name);
                  setMenu(null);
                }}
              >
                <Pencil size={13} /> 重命名集合
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item danger"
                onClick={() => {
                  setConfirm({
                    kind: "collection",
                    collectionId: menuCollection.id,
                    name: menuCollection.name,
                  });
                  setMenu(null);
                }}
              >
                <Trash2 size={13} /> 删除集合
              </button>
            </>
          )}
        </div>
      ) : null}

      <Modal
        open={!!confirm}
        title="确认删除"
        onClose={() => setConfirm(null)}
        width={420}
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button className="btn btn-danger" onClick={() => void confirmDelete()}>
              删除
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          确定要删除 <strong>{confirm?.name}</strong> 吗？此操作不可撤销。
        </p>
        {confirm?.kind === "item" ? (
          <p className="muted" style={{ marginBottom: 0, fontSize: 11.5 }}>
            文件夹内的请求会一并删除。
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
