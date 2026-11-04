import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./common/Modal";
import { emptyRow, type KeyValue } from "../types";

interface KeyValueEditorProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "键",
  valuePlaceholder = "值",
}: KeyValueEditorProps) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const update = (index: number, patch: Partial<KeyValue>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyRow()]);
  };

  const openBulk = () => {
    setBulkText(
      rows
        .filter((row) => row.key.trim())
        .map((row) => `${row.key}: ${row.value}`)
        .join("\n"),
    );
    setBulkOpen(true);
  };

  const applyBulk = () => {
    const parsed = bulkText
      .split("\n")
      .map((line) => {
        const index = line.indexOf(":");
        if (index === -1) {
          return { key: line.trim(), value: "", enabled: true };
        }
        return {
          key: line.slice(0, index).trim(),
          value: line.slice(index + 1).trim(),
          enabled: true,
        };
      })
      .filter((row) => row.key.length > 0);
    onChange(parsed.length > 0 ? parsed : [emptyRow()]);
    setBulkOpen(false);
  };

  return (
    <div className="kv-editor">
      <div className="kv-head">
        <span />
        <span>KEY</span>
        <span>VALUE</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div className="kv-row" key={index}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(event) => update(index, { enabled: event.target.checked })}
            title={row.enabled ? "已启用" : "已禁用"}
          />
          <input
            className="input"
            value={row.key}
            placeholder={keyPlaceholder}
            spellCheck={false}
            onChange={(event) => update(index, { key: event.target.value })}
          />
          <input
            className="input"
            value={row.value}
            placeholder={valuePlaceholder}
            spellCheck={false}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <button
            className="icon-btn"
            onClick={() => remove(index)}
            title="删除这一行"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="kv-actions">
        <button className="btn btn-sm" onClick={() => onChange([...rows, emptyRow()])}>
          <Plus size={12} /> 添加
        </button>
        <button className="btn btn-sm btn-ghost" onClick={openBulk}>
          批量编辑
        </button>
      </div>

      <Modal
        open={bulkOpen}
        title="批量编辑"
        onClose={() => setBulkOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setBulkOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={applyBulk}>
              应用
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginTop: 0, fontSize: 11.5 }}>
          每行一个键值对，格式为 <code>key: value</code>。
        </p>
        <textarea
          className="textarea"
          style={{ minHeight: 220 }}
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          spellCheck={false}
        />
      </Modal>
    </div>
  );
}
