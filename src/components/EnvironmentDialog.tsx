import { useEffect, useState } from "react";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { useUI } from "../stores/ui";
import { useWorkspace } from "../stores/workspace";
import { cloneEnvironments, emptyRow, type EnvironmentsFile } from "../types";
import { uid } from "../lib/utils";
import { DynamicVarsDialog } from "./DynamicVarsDialog";
import { KeyValueEditor } from "./KeyValueEditor";
import { Modal } from "./common/Modal";

export function EnvironmentDialog() {
  const open = useUI((state) => state.envDialogOpen);
  const setOpen = useUI((state) => state.setEnvDialogOpen);
  const notify = useUI((state) => state.notify);
  const env = useWorkspace((state) => state.env);
  const saveEnv = useWorkspace((state) => state.saveEnv);

  const [draft, setDraft] = useState<EnvironmentsFile>(env);
  const [selected, setSelected] = useState<string>("globals");
  const [varsHelpOpen, setVarsHelpOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneEnvironments(env));
    setSelected(env.activeId ?? env.environments[0]?.id ?? "globals");
    // Only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedEnv = draft.environments.find((item) => item.id === selected);

  const updateEnv = (patch: Partial<{ name: string }>) => {
    setDraft((current) => ({
      ...current,
      environments: current.environments.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    }));
  };

  const addEnvironment = () => {
    const created = {
      id: uid(),
      name: `新环境 ${draft.environments.length + 1}`,
      variables: [emptyRow()],
    };
    setDraft((current) => ({
      ...current,
      environments: [...current.environments, created],
    }));
    setSelected(created.id);
  };

  const removeEnvironment = () => {
    if (!selectedEnv) return;
    setDraft((current) => ({
      ...current,
      activeId: current.activeId === selected ? null : current.activeId,
      environments: current.environments.filter((item) => item.id !== selected),
    }));
    setSelected("globals");
  };

  const handleSave = async () => {
    await saveEnv(draft);
    notify("环境变量已保存", "success");
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      title="环境变量"
      onClose={() => setOpen(false)}
      width={780}
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={() => setVarsHelpOpen(true)}
          >
            <HelpCircle size={13} /> 动态变量
          </button>
          <span className="muted" style={{ marginRight: "auto", fontSize: 11.5 }}>
            发送请求时，{"{{变量名}}"} 会自动替换为当前环境中的值。
          </span>
          <button className="btn" onClick={() => setOpen(false)}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()}>
            保存
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 16 }}>
        <div style={{ borderRight: "1px solid var(--border)", paddingRight: 10 }}>
          <button
            className={`tree-row ${selected === "globals" ? "active" : ""}`}
            style={{ width: "100%" }}
            onClick={() => setSelected("globals")}
          >
            <span className="label">全局变量</span>
            <span className="count">{draft.globals.length}</span>
          </button>
          {draft.environments.map((item) => (
            <button
              key={item.id}
              className={`tree-row ${selected === item.id ? "active" : ""}`}
              style={{ width: "100%" }}
              onClick={() => setSelected(item.id)}
            >
              <span className="label">{item.name}</span>
              {draft.activeId === item.id ? (
                <span className="chip" style={{ color: "var(--accent)" }}>
                  当前
                </span>
              ) : null}
            </button>
          ))}
          <button
            className="btn btn-sm"
            style={{ marginTop: 8, width: "100%" }}
            onClick={addEnvironment}
          >
            <Plus size={12} /> 新建环境
          </button>
        </div>

        <div style={{ minHeight: 320 }}>
          {selected === "globals" ? (
            <>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>全局变量</h3>
              <p className="muted" style={{ marginTop: 0, fontSize: 11.5 }}>
                对所有环境生效；环境中的同名变量优先级更高。
              </p>
              <KeyValueEditor
                rows={draft.globals}
                onChange={(globals) => setDraft({ ...draft, globals })}
                keyPlaceholder="变量名"
                valuePlaceholder="变量值"
              />
            </>
          ) : selectedEnv ? (
            <>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <input
                  className="input"
                  style={{ maxWidth: 280 }}
                  value={selectedEnv.name}
                  onChange={(event) => updateEnv({ name: event.target.value })}
                />
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setDraft({ ...draft, activeId: selectedEnv.id })
                  }
                >
                  {draft.activeId === selectedEnv.id ? "当前环境" : "设为当前"}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={removeEnvironment}
                >
                  <Trash2 size={12} /> 删除环境
                </button>
              </div>
              <KeyValueEditor
                rows={selectedEnv.variables}
                onChange={(variables) =>
                  setDraft({
                    ...draft,
                    environments: draft.environments.map((item) =>
                      item.id === selectedEnv.id ? { ...item, variables } : item,
                    ),
                  })
                }
                keyPlaceholder="变量名"
                valuePlaceholder="变量值"
              />
            </>
          ) : null}
        </div>
      </div>

      <DynamicVarsDialog
        open={varsHelpOpen}
        onClose={() => setVarsHelpOpen(false)}
      />
    </Modal>
  );
}
