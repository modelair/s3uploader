/** Minimal extension → MIME type map for inferring `Content-Type` from a key. */
const MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

const DEFAULT_MIME = "application/octet-stream";

/** Infer a MIME type from a key/filename extension. Falls back to octet-stream. */
export function inferContentType(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1 || dot === key.length - 1) return DEFAULT_MIME;
  const ext = key.slice(dot + 1).toLowerCase();
  return MIME_TYPES[ext] ?? DEFAULT_MIME;
}
