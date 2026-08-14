import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const IOS_URL = 'https://apps.apple.com/br/app/inutri-pacientes/id6789184541';
const ANDROID_PACKAGE = 'com.inutri.app';
const ANDROID_MARKET = `market://details?id=${ANDROID_PACKAGE}`;
const ANDROID_WEB = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export async function requestStoreReview(): Promise<void> {
  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
    return;
  }
  if (Platform.OS === 'ios') {
    await Linking.openURL(IOS_URL);
    return;
  }
  const marketOk = await Linking.canOpenURL(ANDROID_MARKET);
  await Linking.openURL(marketOk ? ANDROID_MARKET : ANDROID_WEB);
}
