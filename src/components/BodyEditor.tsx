import { CodeEditor } from "./CodeEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import type { RequestBody } from "../types";

interface BodyEditorProps {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

const BODY_TYPES = [
  { value: "none", label: "无" },
  { value: "json", label: "JSON" },
  { value: "text", label: "文本" },
  { value: "formUrlEncoded", label: "Form URL Encoded" },
  { value: "multipart", label: "Multipart Form" },
] as const;

export function BodyEditor({ body, onChange }: BodyEditorProps) {
  const formatJson = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(body.raw), null, 2);
      onChange({ ...body, raw: pretty });
    } catch {
      // Invalid JSON is left untouched; the user sees it when sending.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          className="select"
          style={{ width: 180 }}
          value={body.type}
          onChange={(event) =>
            onChange({ ...body, type: event.target.value as RequestBody["type"] })
          }
        >
          {BODY_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {body.type === "json" ? (
          <button className="btn btn-sm" onClick={formatJson}>
            格式化
          </button>
        ) : null}
      </div>

      {body.type === "json" || body.type === "text" ? (
        <CodeEditor
          value={body.raw}
          onChange={(raw) => onChange({ ...body, raw })}
          language={body.type === "json" ? "json" : "text"}
          className="h-[240px]"
        />
      ) : null}

      {body.type === "formUrlEncoded" || body.type === "multipart" ? (
        <KeyValueEditor
          rows={body.fields}
          onChange={(fields) => onChange({ ...body, fields })}
          keyPlaceholder="字段名"
          valuePlaceholder={
            body.type === "multipart" ? "字段值（暂不支持文件）" : "字段值"
          }
        />
      ) : null}

      {body.type === "none" ? (
        <div className="empty-state" style={{ height: 160 }}>
          该请求不携带请求体
        </div>
      ) : null}
    </div>
  );
}
