import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { ChatWithNutritionistButton } from './chat-button';

jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);

describe('ChatWithNutritionistButton', () => {
  beforeEach(() => {
    (Linking.openURL as jest.Mock).mockClear().mockResolvedValue(true);
    (Linking.canOpenURL as jest.Mock).mockClear().mockResolvedValue(true);
  });

  it('renders nothing without a number', async () => {
    await render(<ChatWithNutritionistButton whatsappNumber={null} />);
    expect(screen.queryByText(/conversar com nutricionista/i)).toBeNull();
  });

  it('renders nothing with an empty number', async () => {
    await render(<ChatWithNutritionistButton whatsappNumber="" />);
    expect(screen.queryByText(/conversar com nutricionista/i)).toBeNull();
  });

  it('opens wa.me with canonical digits', async () => {
    await render(<ChatWithNutritionistButton whatsappNumber="5511999998888" />);
    await fireEvent.press(screen.getByRole('button', { name: /conversar com nutricionista/i }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/5511999998888');
  });

  it('alerts when WhatsApp cannot be opened', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<ChatWithNutritionistButton whatsappNumber="5511999998888" />);
    await fireEvent.press(screen.getByRole('button', { name: /conversar com nutricionista/i }));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('WhatsApp', 'Não foi possível abrir o WhatsApp.'),
    );
    alertSpy.mockRestore();
  });
});
