// Native file helpers (iOS/Android).
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type PickedText = { name: string; text: string };

export async function pickGpxFile(): Promise<PickedText | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}

/** Download a GPX from a signed URL and hand it to the OS share sheet (Garmin, Wahoo, Komoot…). */
export async function shareGpx(signedUrl: string, fileName: string) {
  let text: string;
  if (signedUrl.startsWith('data:')) {
    text = atob(signedUrl.slice(signedUrl.indexOf(',') + 1));
  } else {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error('Could not download the route.');
    text = await res.text();
  }
  const file = new File(Paths.cache, fileName.replace(/[^\w.-]+/g, '_'));
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/gpx+xml',
    UTI: 'com.topografix.gpx',
    dialogTitle: 'Open route in…',
  });
}
