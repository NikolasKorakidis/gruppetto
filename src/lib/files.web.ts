// Web file helpers.
import * as DocumentPicker from 'expo-document-picker';

export type PickedText = { name: string; text: string };

export async function pickGpxFile(): Promise<PickedText | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['.gpx', 'application/gpx+xml', 'application/xml', 'text/xml'] });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  return { name: asset.name, text };
}

/** The signed URL is created with `download: <name>` so the browser saves it as a file. */
export async function shareGpx(signedUrl: string, fileName: string) {
  const a = document.createElement('a');
  a.href = signedUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
