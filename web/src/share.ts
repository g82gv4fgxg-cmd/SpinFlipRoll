import { parseImportedEntries } from "./storage";
import type { ImportedEntry } from "./storage";
import type { WheelList } from "./types";

export type SharedWheel = {
  name: string;
  entries: ImportedEntry[];
};

const sharePrefix = "#/share/";

/** Packs a wheel into URL-safe text: [name, [[label, colour, weight], ...]]. */
export function encodeWheel(list: Pick<WheelList, "name" | "entries">): string {
  const payload = [1, list.name, list.entries.map((entry) => [entry.label, entry.colorHex, entry.weight])];
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeWheel(text: string): SharedWheel | null {
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(text)));
    if (!Array.isArray(json) || json[0] !== 1 || typeof json[1] !== "string" || !Array.isArray(json[2])) return null;
    const rows = json[2].map((row: unknown) =>
      Array.isArray(row) ? { label: row[0], colorHex: row[1], weight: row[2] } : row
    );
    const entries = parseImportedEntries(rows);
    if (!entries || entries.length === 0) return null;
    return { name: json[1].trim().slice(0, 80) || "Shared wheel", entries };
  } catch {
    return null;
  }
}

export function shareUrl(list: Pick<WheelList, "name" | "entries">): string {
  return `${location.origin}${location.pathname}${sharePrefix}${encodeWheel(list)}`;
}

/** Returns the encoded wheel if the URL hash is a share link. */
export function sharePayloadFromHash(hash: string): string | null {
  return hash.startsWith(sharePrefix) ? hash.slice(sharePrefix.length) : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
