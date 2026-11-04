import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTabs } from "../stores/tabs";
import { useWorkspace } from "../stores/workspace";
import { formatDuration, methodColor, statusColor, timeAgo } from "../lib/utils";
import { Modal } from "./common/Modal";

export function HistoryList() {
  const history = useWorkspace((state) => state.history);
  const removeHistory = useWorkspace((state) => state.removeHistory);
  const clearHistory = useWorkspace((state) => state.clearHistory);
  const openHistory = useTabs((state) => state.openHistory);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="sidebar-section" style={{ justifyContent: "space-between" }}>
        <span>最近发送</span>
        <button
          className="icon-btn"
          title="清空历史"
          disabled={history.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="tree-scroll" style={{ paddingTop: 0 }}>
        {history.length === 0 ? (
          <div className="empty-state" style={{ height: 140 }}>
            暂无历史记录
          </div>
        ) : (
          history.map((entry) => (
            <div
              className="history-row"
              key={entry.id}
              onClick={() => openHistory(entry)}
              title={entry.url}
            >
              <span className="method-tag" style={{ color: methodColor(entry.method) }}>
                {entry.method}
              </span>
              <span className="url">{entry.url || entry.name}</span>
              {entry.status ? (
                <span
                  style={{
                    color: statusColor(entry.status),
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  {entry.status}
                </span>
              ) : null}
              <span className="faint" style={{ fontSize: 10 }}>
                {formatDuration(entry.durationMs)}
              </span>
              <button
                className="icon-btn"
                style={{ width: 18, height: 18 }}
                title="删除这条记录"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeHistory(entry.id);
                }}
              >
                <Trash2 size={11} />
              </button>
              <span className="faint" style={{ fontSize: 10, width: 44, textAlign: "right" }}>
                {timeAgo(entry.at)}
              </span>
            </div>
          ))
        )}
      </div>

      <Modal
        open={confirmClear}
        title="清空历史"
        onClose={() => setConfirmClear(false)}
        width={400}
        footer={
          <>
            <button className="btn" onClick={() => setConfirmClear(false)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                void clearHistory();
                setConfirmClear(false);
              }}
            >
              清空
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>确定要清空全部发送历史吗？此操作不可撤销。</p>
      </Modal>
    </div>
  );
}
