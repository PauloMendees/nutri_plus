// SDK 54's expo-file-system v19 moved cacheDirectory/downloadAsync to a legacy
// subpath (the new top-level downloadAsync is a throwing deprecation shim).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase';

// Downloads the authenticated data export (JSON) to a cache file, then opens the
// OS share sheet.
export async function downloadMyData(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/data-export`;
  const target = `${FileSystem.cacheDirectory}meus-dados-inutri.json`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' });
  }
}
