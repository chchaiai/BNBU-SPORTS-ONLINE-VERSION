// current API proof-file rules. These functions stay DOM-free so the student
// smoke suite can run them directly in Node.

// V8.1 submission limits; backend verification remains authoritative.
export const PROOF_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PROOF_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const PROOF_VIDEO_MAX_SECONDS = 10;

export const PROOF_IMAGE_MIME_TYPES = Object.freeze(["image/jpeg", "image/png"]);
export const PROOF_VIDEO_MIME_TYPES = Object.freeze([
  "video/mp4", "video/quicktime", "video/3gpp", "video/webm",
]);

const EXTENSION_BY_MIME = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/3gpp": "3gp",
  "video/webm": "webm",
});

const NORMALIZABLE_IMAGE_SOURCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const NORMALIZABLE_IMAGE_SOURCE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

/** Return the MIME essence without codec parameters. */
export function mimeEssence(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

/**
 * Source images may be browser-decoded and re-encoded to JPEG. An extension
 * fallback is safe here because the original bytes are never uploaded; the
 * newly encoded JPEG is validated again before upload.
 */
export function canNormalizeCapturedImage(file) {
  const type = mimeEssence(file?.type);
  if (type) return NORMALIZABLE_IMAGE_SOURCE_TYPES.has(type);
  const name = String(file?.name || "");
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return NORMALIZABLE_IMAGE_SOURCE_EXTENSIONS.has(extension);
}

/**
 * Validate the final bytes that will be uploaded. MIME is mandatory and must
 * match the exact current API transport allowlist; extensions never authorize
 * a file and unknown/empty video types are never relabelled as MP4.
 *
 * @param {{type?: string, size: number}} file
 * @param {"image"|"video"} kind
 * @param {{durationSeconds?: number|null}} [facts]
 * @returns {{ok: true, extension: string, mimeType: string, durationSeconds: number|null} | {ok: false, error: "format"|"empty"|"size"|"duration"}}
 */
export function validateProofFile(file, kind, facts = {}) {
  const mimeType = mimeEssence(file?.type);
  const allowed = kind === "video" ? PROOF_VIDEO_MIME_TYPES : PROOF_IMAGE_MIME_TYPES;
  if (!mimeType || !allowed.includes(mimeType)) return { ok: false, error: "format" };
  if (!Number.isSafeInteger(file?.size) || file.size < 1) return { ok: false, error: "empty" };

  if (kind === "image" && file.size > PROOF_IMAGE_MAX_BYTES) return { ok: false, error: "size" };
  if (kind === "video" && file.size > PROOF_VIDEO_MAX_BYTES) return { ok: false, error: "size" };

  let durationSeconds = null;
  if (kind === "video") {
    const measured = facts.durationSeconds;
    if (measured != null && (typeof measured !== "number" || !Number.isFinite(measured) || measured <= 0 || measured > PROOF_VIDEO_MAX_SECONDS)) {
      return { ok: false, error: "duration" };
    }
    // Backend compares the declared integer with the ceiling of trusted media
    // duration, so the browser must use the same representation.
    durationSeconds = measured == null ? null : Math.ceil(measured);
  }

  return {
    ok: true,
    extension: EXTENSION_BY_MIME[mimeType],
    mimeType,
    durationSeconds,
  };
}

// Exemption/certification documents have their own business limits.
export function validateApplicationProofFile(file) {
  const mimeType = mimeEssence(file?.type);
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  if (!Object.hasOwn(extensions, mimeType)) return { ok: false, error: 'format' };
  if (!Number.isSafeInteger(file?.size) || file.size < 1) return { ok: false, error: 'empty' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'size' };
  return { ok: true, extension: extensions[mimeType], mimeType, durationSeconds: null };
}

export function applicationProofCount(existingMediaIds, proofs) {
  const ids = new Set(existingMediaIds || []);
  let pending = 0;
  for (const proof of proofs || []) {
    if (proof.mediaId) ids.add(proof.mediaId); else pending += 1;
  }
  return ids.size + pending;
}
