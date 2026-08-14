import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockRequestStoreReview = jest.fn();
const mockSubmitFeedback = jest.fn();
const mockDismissFeedback = jest.fn();

jest.mock('../../lib/store-review', () => ({
  requestStoreReview: () => mockRequestStoreReview(),
}));
jest.mock('../../lib/queries/feedback', () => ({
  useFeedbackPrompt: () => ({ data: { shouldShow: true, source: 'MOBILE' }, isLoading: false, isError: false }),
  useSubmitFeedback: () => ({ mutateAsync: mockSubmitFeedback, isPending: false }),
  useDismissFeedback: () => ({ mutateAsync: mockDismissFeedback }),
}));

import { FeedbackPrompt } from './feedback-prompt';

beforeEach(() => {
  mockRequestStoreReview.mockReset();
  mockSubmitFeedback.mockReset().mockResolvedValue({ ok: true });
  mockDismissFeedback.mockReset().mockResolvedValue({ ok: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('FeedbackPrompt', () => {
  it('nota 5 envia e chama review da loja', async () => {
    await render(<FeedbackPrompt />);
    await fireEvent.press(screen.getByLabelText('Nota 5'));
    await fireEvent.press(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalledWith({ rating: 5, comment: undefined }));
    await waitFor(() => expect(mockRequestStoreReview).toHaveBeenCalled());
  });

  it('nota 2 envia e não abre a loja', async () => {
    await render(<FeedbackPrompt />);
    await fireEvent.press(screen.getByLabelText('Nota 2'));
    await fireEvent.press(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(mockSubmitFeedback).toHaveBeenCalled());
    expect(mockRequestStoreReview).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('Agora não chama dismiss e não envia', async () => {
    await render(<FeedbackPrompt />);
    await fireEvent.press(screen.getByRole('button', { name: /agora não/i }));
    await waitFor(() => expect(mockDismissFeedback).toHaveBeenCalled());
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });
});
