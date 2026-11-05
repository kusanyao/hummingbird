import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/// Writes through the Tauri backend so copying does not depend on WebView
/// clipboard permissions or window focus.
export async function copyText(text: string): Promise<void> {
  await writeText(text);
}
