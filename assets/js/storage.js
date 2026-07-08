/* =============================================================================
   SAM EMPIRE — storage.js
   Firebase Storage operations + client-side media processing.
   Everything runs in the browser — no Cloud Functions required:
     • Image compression / resize (canvas)
     • Automatic thumbnail generation
     • Automatic gold "SAM EMPIRE" watermark
     • Resumable uploads with progress callbacks
     • Safe deletes (by path or download URL)
     • LocalStorage media-metadata mirror for instant, offline-capable galleries
   ============================================================================= */

import { storage, IS_CONFIGURED } from "./firebase.js";
import {
  ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject, listAll, getMetadata
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { uid, slugify, store, formatBytes, SAM_BRAND } from "./utils.js";

/* -----------------------------------------------------------------------------
   1. CONFIG  — tweakable processing defaults (also overridable per call).
   -------------------------------------------------------------------------- */
export const MEDIA = Object.freeze({
  MAX_DIMENSION:  1920,   // longest edge of a full-size image
  THUMB_DIMENSION: 520,   // longest edge of a thumbnail
  QUALITY:        0.82,   // 0–1 for JPEG/WEBP export
  THUMB_QUALITY:  0.74,
  PREFER_WEBP:    true,   // export WEBP when the browser supports encoding it
  MAX_FILE_MB:    25,     // reject anything larger before processing
  WATERMARK_TEXT: SAM_BRAND.name,
  WATERMARK_TAG:  SAM_BRAND.tagline
});

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/* -----------------------------------------------------------------------------
   2. GUARDS / PATHS
   -------------------------------------------------------------------------- */
function assertConfigured() {
  if (!IS_CONFIGURED) {
    throw new Error("Firebase is not configured. Add your credentials in assets/js/firebase.js to enable uploads.");
  }
}

/** Build a collision-proof storage path inside a folder. */
export function buildPath(folder, fileName) {
  const clean = slugify(fileName.replace(/\.[^.]+$/, "")) || "file";
  const ext = (fileName.match(/\.([^.]+)$/)?.[1] || "bin").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  return `${folder.replace(/^\/|\/$/g, "")}/${stamp}/${clean}-${uid()}.${ext}`;
}

/** Extract the storage path from a Firebase download URL (for deletion). */
export function pathFromUrl(url) {
  try {
    const m = String(url).match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

export const isImage = (file) => !!file && IMAGE_TYPES.includes(file.type);

/* -----------------------------------------------------------------------------
   3. IMAGE LOADING (EXIF-aware where supported)
   -------------------------------------------------------------------------- */
async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** Pick the best output mime the browser can actually encode. */
function outputType(srcType) {
  if (srcType === "image/png" && _supportsEncode("image/png")) return "image/png"; // keep transparency
  if (MEDIA.PREFER_WEBP && _supportsEncode("image/webp")) return "image/webp";
  return "image/jpeg";
}
let _encodeCache = {};
function _supportsEncode(type) {
  if (type in _encodeCache) return _encodeCache[type];
  const c = document.createElement("canvas"); c.width = c.height = 2;
  const ok = c.toDataURL(type).startsWith(`data:${type}`);
  return (_encodeCache[type] = ok);
}

/* -----------------------------------------------------------------------------
   4. PROCESSING — resize, watermark, thumbnail
   -------------------------------------------------------------------------- */
/**
 * Resize (and optionally watermark) an image File → Blob.
 * @returns {Promise<{blob:Blob,width:number,height:number,type:string}>}
 */
export async function processImage(file, {
  maxDimension = MEDIA.MAX_DIMENSION,
  quality = MEDIA.QUALITY,
  watermark = false
} = {}) {
  const bmp = await loadBitmap(file);
  const sw = bmp.width, sh = bmp.height;
  const scale = Math.min(1, maxDimension / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();

  if (watermark) drawWatermark(ctx, w, h);

  const type = outputType(file.type);
  const blob = await canvasToBlob(canvas, type, quality);
  return { blob: blob || file, width: w, height: h, type };
}

/** Draw the diagonal gold wordmark + corner tag onto a canvas context. */
function drawWatermark(ctx, w, h) {
  const diag = Math.sqrt(w * w + h * h);
  ctx.save();
  // Subtle gradient veil to keep the mark legible over busy photos
  const grad = ctx.createLinearGradient(0, h, w, 0);
  grad.addColorStop(0, "rgba(5,15,38,0.0)");
  grad.addColorStop(1, "rgba(5,15,38,0.10)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  // Diagonal wordmark
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.atan2(h, w));
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#D4AF37";
  ctx.font = `800 ${Math.round(diag * 0.052)}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(MEDIA.WATERMARK_TEXT, 0, 0);
  ctx.restore();

  // Corner badge
  ctx.save();
  const pad = Math.round(w * 0.025);
  const fs = Math.max(11, Math.round(w * 0.018));
  ctx.font = `700 ${fs}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(5,15,38,0.55)";
  const label = MEDIA.WATERMARK_TEXT;
  const tw = ctx.measureText(label).width;
  ctx.fillRect(w - tw - pad * 2.2, h - fs - pad * 1.8, tw + pad * 1.4, fs + pad * 0.9);
  ctx.fillStyle = "#E8C75A"; ctx.globalAlpha = 1;
  ctx.fillText(label, w - pad, h - pad);
  ctx.restore();
}

/** Generate a small thumbnail Blob from a File. */
export async function makeThumbnail(file, dimension = MEDIA.THUMB_DIMENSION) {
  return processImage(file, { maxDimension: dimension, quality: MEDIA.THUMB_QUALITY, watermark: false });
}

/* -----------------------------------------------------------------------------
   5. UPLOAD (resumable, with progress)
   -------------------------------------------------------------------------- */
/**
 * Upload a Blob/File to a storage path.
 * @param {Blob|File} data
 * @param {string} path
 * @param {(pct:number,snapshot:object)=>void} onProgress
 * @returns {Promise<{url:string,path:string,size:number,contentType:string}>}
 */
export function uploadBlob(data, path, onProgress, metadata = {}) {
  assertConfigured();
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(sRef(storage, path), data, {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: data.type || "application/octet-stream",
      ...metadata
    });
    task.on("state_changed",
      (snap) => {
        const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        if (typeof onProgress === "function") onProgress(pct, snap);
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path, size: task.snapshot.totalBytes, contentType: data.type || "" });
      }
    );
  });
}

/**
 * Full image pipeline: validate → compress → (watermark) → upload full + thumb.
 * Records the result in the LocalStorage media mirror.
 * @returns {Promise<MediaRecord>}
 */
export async function uploadImage(file, folder = "gallery", {
  watermark = true,
  makeThumb = true,
  maxDimension = MEDIA.MAX_DIMENSION,
  quality = MEDIA.QUALITY,
  onProgress = null,
  meta = {}
} = {}) {
  assertConfigured();
  if (!isImage(file)) throw new Error("Please choose a JPG, PNG, WEBP or GIF image.");
  if (file.size > MEDIA.MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`Image is larger than ${MEDIA.MAX_FILE_MB} MB. Please choose a smaller file.`);
  }

  const report = (frac) => onProgress && onProgress(Math.round(frac));

  // GIFs are uploaded as-is (canvas would flatten animation).
  if (file.type === "image/gif") {
    const path = buildPath(folder, file.name);
    const up = await uploadBlob(file, path, (p) => report(p * 0.95), { contentType: "image/gif" });
    const rec = makeRecord({ ...up, thumbUrl: up.url, name: file.name, folder, type: "image/gif", meta });
    mediaCache.add(rec); report(100);
    return rec;
  }

  const full = await processImage(file, { maxDimension, quality, watermark });
  report(20);
  const path = buildPath(folder, file.name.replace(/\.[^.]+$/, "") + extFor(full.type));
  const up = await uploadBlob(full.blob, path, (p) => report(20 + p * 0.55));

  let thumbUrl = up.url, thumbPath = null;
  if (makeThumb) {
    const thumb = await makeThumbnail(file);
    thumbPath = path.replace(/(\.[^.]+)$/, "_thumb$1");
    const tUp = await uploadBlob(thumb.blob, thumbPath, (p) => report(75 + p * 0.22));
    thumbUrl = tUp.url;
  }
  report(100);

  const rec = makeRecord({
    url: up.url, path, thumbUrl, thumbPath,
    name: file.name, folder, type: full.type, size: up.size,
    width: full.width, height: full.height, meta
  });
  mediaCache.add(rec);
  return rec;
}

/** Upload an arbitrary (non-image) document/file. */
export async function uploadDocument(file, folder = "documents", onProgress = null, meta = {}) {
  assertConfigured();
  if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds the 50 MB limit.");
  const path = buildPath(folder, file.name);
  const up = await uploadBlob(file, path, (p) => onProgress && onProgress(p));
  const rec = makeRecord({ ...up, thumbUrl: null, name: file.name, folder, type: file.type, meta });
  mediaCache.add(rec);
  return rec;
}

function extFor(type) {
  return type === "image/webp" ? ".webp" : type === "image/png" ? ".png" : ".jpg";
}

/* -----------------------------------------------------------------------------
   6. DELETE / LIST
   -------------------------------------------------------------------------- */
/** Delete by storage path OR full download URL. Silent on already-deleted. */
export async function deleteFile(pathOrUrl) {
  assertConfigured();
  const path = pathOrUrl?.startsWith("http") ? pathFromUrl(pathOrUrl) : pathOrUrl;
  if (!path) return false;
  try { await deleteObject(sRef(storage, path)); }
  catch (err) { if (err?.code !== "storage/object-not-found") throw err; }
  mediaCache.removeByPath(path);
  return true;
}

/** Delete a record's full image and its thumbnail together. */
export async function deleteImageRecord(rec) {
  if (!rec) return;
  if (rec.path) await deleteFile(rec.path);
  if (rec.thumbPath) await deleteFile(rec.thumbPath);
  mediaCache.remove(rec.id);
}

/** List a storage folder with sizes and URLs (admin media library). */
export async function listFolder(folder) {
  assertConfigured();
  const res = await listAll(sRef(storage, folder));
  return Promise.all(res.items.map(async (item) => {
    const [url, md] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
    return { name: item.name, path: item.fullPath, url, size: md.size, type: md.contentType, sizeLabel: formatBytes(md.size) };
  }));
}

/* -----------------------------------------------------------------------------
   7. MEDIA RECORD + LOCALSTORAGE MIRROR
   -------------------------------------------------------------------------- */
/** @typedef {{id,url,path,thumbUrl,thumbPath,name,folder,type,size,width,height,createdAt,meta}} MediaRecord */
function makeRecord(o) {
  return {
    id: uid("med"),
    url: o.url, path: o.path || null,
    thumbUrl: o.thumbUrl ?? o.url, thumbPath: o.thumbPath || null,
    name: o.name || "image", folder: o.folder || "gallery",
    type: o.type || "", size: o.size || 0,
    width: o.width || null, height: o.height || null,
    createdAt: Date.now(), meta: o.meta || {}
  };
}

const MIRROR_KEY = "media:mirror";
export const mediaCache = {
  all() { return store.get(MIRROR_KEY, []); },
  byFolder(folder) { return this.all().filter((m) => m.folder === folder); },
  add(rec) { const arr = this.all(); arr.unshift(rec); if (arr.length > 800) arr.length = 800; store.set(MIRROR_KEY, arr); return rec; },
  remove(id) { store.set(MIRROR_KEY, this.all().filter((m) => m.id !== id)); },
  removeByPath(path) { store.set(MIRROR_KEY, this.all().filter((m) => m.path !== path && m.thumbPath !== path)); },
  clear() { store.remove(MIRROR_KEY); }
};

/* -----------------------------------------------------------------------------
   8. BULK HELPER — process a FileList sequentially with combined progress.
   -------------------------------------------------------------------------- */
export async function uploadMany(files, folder, opts = {}, onItem = null, onTotal = null) {
  const list = Array.from(files);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rec = await uploadImage(list[i], folder, {
      ...opts,
      onProgress: (p) => onItem && onItem(i, p, list[i])
    });
    out.push(rec);
    if (onTotal) onTotal(Math.round(((i + 1) / list.length) * 100), i + 1, list.length);
  }
  return out;
}
