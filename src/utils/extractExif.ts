import exifr from 'exifr';

export interface ExifData {
  latitude: number | null;
  longitude: number | null;
  dateTaken: Date | null;
}

export async function extractExifFromFile(file: File): Promise<ExifData> {
  try {
    // ModifyDate is deliberately excluded — it reflects edits (crop, rotate,
    // re-save), not capture, and would shift the auto-filled visit date.
    const exif = await exifr.parse(file, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate'],
    });

    if (!exif) return { latitude: null, longitude: null, dateTaken: null };

    return {
      latitude: exif.latitude ?? null,
      longitude: exif.longitude ?? null,
      dateTaken: exif.DateTimeOriginal ?? exif.CreateDate ?? null,
    };
  } catch {
    return { latitude: null, longitude: null, dateTaken: null };
  }
}
