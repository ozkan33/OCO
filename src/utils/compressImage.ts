// Downscale + re-encode images client-side before upload so they fit inside
// the ~4.5MB serverless payload limit on Vercel. Mac Chrome screenshots and
// iPhone Live Photos routinely exceed that and caused silent "Upload failed"
// errors (413 HTML response → JSON parse fails → bare default string).
//
// GPS / date must be extracted from the ORIGINAL file before calling this —
// canvas re-encoding strips EXIF.

export interface CompressOptions {
  maxEdgePx?: number;   // longest edge after resize
  quality?: number;     // 0..1 JPEG quality
  skipUnderBytes?: number; // don't touch small files
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdgePx: 2048,
  quality: 0.85,
  skipUnderBytes: 2 * 1024 * 1024, // 2MB
};

export async function compressImageForUpload(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const { maxEdgePx, quality, skipUnderBytes } = { ...DEFAULTS, ...opts };

  // Small enough already — don't re-encode and lose fidelity.
  if (file.size <= skipUnderBytes) return file;

  // HEIC/HEIF can't be decoded by HTMLImageElement on Chrome/Firefox.
  // Safari can, but Safari's HEIC files are usually small anyway. Let
  // these pass through — if decode fails we also fall back.
  const mime = file.type.toLowerCase();
  if (mime.includes('heic') || mime.includes('heif')) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { width: w, height: h } = scale(img.naturalWidth, img.naturalHeight, maxEdgePx);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) return file;
    // Only swap if we actually got smaller — re-encoding a heavily-compressed
    // JPEG can sometimes grow. In that case keep the original.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

function scale(srcW: number, srcH: number, maxEdge: number) {
  if (srcW <= maxEdge && srcH <= maxEdge) return { width: srcW, height: srcH };
  const ratio = srcW >= srcH ? maxEdge / srcW : maxEdge / srcH;
  return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) };
}
