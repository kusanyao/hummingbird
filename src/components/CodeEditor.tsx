import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { tags } from "@lezer/highlight";
import { useWorkspace } from "../stores/workspace";
import { cn } from "../lib/utils";

const external = Annotation.define<boolean>();

const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--syn-key)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-string)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--syn-number)" },
  { tag: [tags.bool, tags.null], color: "var(--syn-bool)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: tags.punctuation, color: "var(--syn-punct)" },
  { tag: [tags.bracket, tags.brace], color: "var(--syn-punct)" },
]);

function makeTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--editor-bg)",
        color: "var(--fg)",
        height: "100%",
      },
      ".cm-scroller": {
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        lineHeight: "1.6",
        overflow: "auto",
      },
      ".cm-content": { padding: "8px 0" },
      ".cm-gutters": {
        backgroundColor: "var(--editor-bg)",
        color: "var(--faint)",
        border: "none",
      },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-activeLineGutter": { backgroundColor: "transparent" },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: "var(--accent-soft) !important",
      },
      "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
      ".cm-foldPlaceholder": {
        backgroundColor: "var(--panel-3)",
        border: "none",
        color: "var(--muted)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--panel-2)",
        border: "1px solid var(--border)",
        color: "var(--fg)",
      },
    },
    { dark },
  );
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "text";
  readOnly?: boolean;
  className?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = "text",
  readOnly = false,
  className,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const theme = useWorkspace((state) => state.settings.theme);

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          ...(language === "json" ? [json()] : []),
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
          makeTheme(theme === "dark"),
          syntaxHighlighting(highlightStyle),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const isExternal = update.transactions.some(
              (transaction) => transaction.annotation(external) === true,
            );
            if (!isExternal) {
              changeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is intentionally recreated only when the editor mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: external.of(true),
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "min-h-0 overflow-hidden rounded-md border border-[var(--border)]",
        className,
      )}
    />
  );
}
