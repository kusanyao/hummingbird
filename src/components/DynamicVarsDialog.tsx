import { Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { useUI } from "../stores/ui";
import { Modal } from "./common/Modal";

interface DynamicVarsDialogProps {
  open: boolean;
  onClose: () => void;
}

const RANDOM_VARS: Array<[string, string]> = [
  ["{{$randomInt}}", "0–1000 随机整数"],
  ["{{$randomInt(1,100)}}", "指定范围的随机整数"],
  ["{{$randomFloat}}", "0–1000 随机小数（2 位）"],
  ["{{$randomFloat(1,10,3)}}", "指定范围和精度"],
  ["{{$randomBoolean}}", "true / false"],
  ["{{$randomAlphaNumeric}}", "8 位随机字母数字"],
  ["{{$randomAlphaNumeric(16)}}", "指定长度的字母数字"],
  ["{{$randomUUID}}", "随机 UUID"],
  ["{{$randomEmail}}", "随机邮箱"],
  ["{{$randomFirstName}}", "随机名字"],
  ["{{$randomLastName}}", "随机姓氏"],
  ["{{$randomFullName}}", "随机全名"],
  ["{{$randomPhoneNumber}}", "随机手机号"],
  ["{{$randomWord}}", "随机单词"],
  ["{{$randomDate}}", "最近一年内的随机日期"],
  ["{{$randomUUID.once}}", "同一次请求内复用同一值"],
];

const BUILTIN_VARS: Array<[string, string]> = [
  ["{{$uuid}}", "同一次请求内固定的 UUID"],
  ["{{$timestamp}}", "Unix 秒级时间戳"],
  ["{{$isoTimestamp}}", "ISO 8601 时间"],
];

function VarGroup({
  title,
  items,
  onCopy,
}: {
  title: string;
  items: Array<[string, string]>;
  onCopy: (value: string) => void;
}) {
  return (
    <div>
      <div className="var-group-title">{title}</div>
      {items.map(([expression, description]) => (
        <div className="var-row" key={expression}>
          <code className="var-expr">{expression}</code>
          <span className="var-desc">{description}</span>
          <button
            className="icon-btn"
            title="复制变量"
            onClick={() => onCopy(expression)}
          >
            <Copy size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function DynamicVarsDialog({ open, onClose }: DynamicVarsDialogProps) {
  const notify = useUI((state) => state.notify);

  const handleCopy = async (value: string) => {
    await copyText(value);
    notify("变量已复制", "success");
  };

  return (
    <Modal
      open={open}
      title="动态变量"
      onClose={onClose}
      width={640}
      footer={
        <button className="btn" onClick={onClose}>
          关闭
        </button>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 11.5 }}>
        在 URL、参数、请求头、请求体和认证中使用。发送请求或生成 cURL
        时由后端生成。
      </p>
      <VarGroup
        title="随机变量"
        items={RANDOM_VARS}
        onCopy={(value) => void handleCopy(value)}
      />
      <VarGroup
        title="内置值"
        items={BUILTIN_VARS}
        onCopy={(value) => void handleCopy(value)}
      />
      <p className="faint" style={{ margin: "14px 0 0", fontSize: 11 }}>
        不带 <code>.once</code> 的随机变量每次出现都会重新生成；带{" "}
        <code>.once</code> 时，同一次请求内复用第一次生成的值。
      </p>
    </Modal>
  );
}
