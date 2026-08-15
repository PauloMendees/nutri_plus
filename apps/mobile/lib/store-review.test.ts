import { Platform, Linking } from 'react-native';

const mockIsAvailableAsync = jest.fn();
const mockRequestReview = jest.fn();
jest.mock('expo-store-review', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  requestReview: () => mockRequestReview(),
}));

import { requestStoreReview } from './store-review';

describe('requestStoreReview', () => {
  beforeEach(() => {
    mockIsAvailableAsync.mockReset();
    mockRequestReview.mockReset();
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  });

  it('usa review nativo quando disponível', async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    await requestStoreReview();
    expect(mockRequestReview).toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('iOS cai na App Store quando nativo indisponível', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    Platform.OS = 'ios';
    await requestStoreReview();
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://apps.apple.com/br/app/inutri-pacientes/id6789184541',
    );
  });

  it('Android tenta market: e cai no https se necessário', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    Platform.OS = 'android';
    (Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false);
    await requestStoreReview();
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.inutri.app',
    );
  });
});
