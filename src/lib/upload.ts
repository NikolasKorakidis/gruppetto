import { decode, encode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { isDemo, supabase } from './supabase';

/** Pick a square image and upload it to a public bucket. Returns the public URL (cache-busted). */
export async function pickAndUploadImage(bucket: 'avatars' | 'club-logos', folder: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const contentType = asset.mimeType && /image\/(png|webp|jpeg)/.test(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
  const body = asset.base64 ? decode(asset.base64) : await (await fetch(asset.uri)).arrayBuffer();
  // Demo mode has no storage server: keep the image inline.
  if (isDemo) return `data:${contentType};base64,${asset.base64 ?? encode(body)}`;
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
