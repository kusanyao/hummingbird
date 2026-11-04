import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useUI } from "../stores/ui";

export function Toasts() {
  const toasts = useUI((state) => state.toasts);
  const dismiss = useUI((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind}`}
          onClick={() => dismiss(toast.id)}
          title="点击关闭"
        >
          {toast.kind === "error" ? (
            <AlertCircle size={14} style={{ color: "var(--danger)", flexShrink: 0 }} />
          ) : toast.kind === "success" ? (
            <CheckCircle2 size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
          ) : (
            <Info size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
          )}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
