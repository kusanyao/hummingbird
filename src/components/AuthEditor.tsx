import type { Auth } from "../types";

interface AuthEditorProps {
  auth: Auth;
  onChange: (auth: Auth) => void;
}

const AUTH_TYPES = [
  { value: "none", label: "无认证" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apiKey", label: "API Key" },
] as const;

export function AuthEditor({ auth, onChange }: AuthEditorProps) {
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div>
        <label className="field-label">认证方式</label>
        <select
          className="select"
          value={auth.type}
          onChange={(event) =>
            onChange({ ...auth, type: event.target.value as Auth["type"] })
          }
        >
          {AUTH_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {auth.type === "bearer" ? (
        <div>
          <label className="field-label">Token</label>
          <input
            className="input"
            value={auth.token}
            placeholder="{{token}} 或直接填写"
            spellCheck={false}
            onChange={(event) => onChange({ ...auth, token: event.target.value })}
          />
        </div>
      ) : null}

      {auth.type === "basic" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">用户名</label>
            <input
              className="input"
              value={auth.username}
              onChange={(event) =>
                onChange({ ...auth, username: event.target.value })
              }
            />
          </div>
          <div>
            <label className="field-label">密码</label>
            <input
              className="input"
              type="password"
              value={auth.password}
              onChange={(event) =>
                onChange({ ...auth, password: event.target.value })
              }
            />
          </div>
        </div>
      ) : null}

      {auth.type === "apiKey" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Key</label>
            <input
              className="input"
              value={auth.key}
              onChange={(event) => onChange({ ...auth, key: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Value</label>
            <input
              className="input"
              value={auth.value}
              onChange={(event) => onChange({ ...auth, value: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label">添加到</label>
            <select
              className="select"
              value={auth.location}
              onChange={(event) =>
                onChange({
                  ...auth,
                  location: event.target.value as Auth["location"],
                })
              }
            >
              <option value="header">请求头</option>
              <option value="query">查询参数</option>
            </select>
          </div>
        </div>
      ) : null}

      {auth.type !== "none" ? (
        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          支持在任意字段中使用 <code>{"{{变量}}"}</code>，发送时由当前环境替换。
        </p>
      ) : null}
    </div>
  );
}
