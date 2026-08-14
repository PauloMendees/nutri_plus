import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDismissFeedback, useFeedbackPrompt, useSubmitFeedback } from '../../lib/queries/feedback';
import { requestStoreReview } from '../../lib/store-review';
import { Button } from '../ui/button';
import { TextField } from '../ui/text-field';

const RATINGS = [1, 2, 3, 4, 5] as const;
const STAR_ON = '#14bfa6';
const STAR_OFF = '#8a9a92';

function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 409;
}

export function FeedbackPrompt() {
  const prompt = useFeedbackPrompt();
  const submit = useSubmitFeedback();
  const dismiss = useDismissFeedback();
  const [closed, setClosed] = useState(false);
  const [rating, setRating] = useState<(typeof RATINGS)[number] | null>(null);
  const [comment, setComment] = useState('');
  const dismissed = useRef(false);

  const open = !closed && prompt.data?.shouldShow === true;

  async function onDismiss() {
    if (dismissed.current) return;
    dismissed.current = true;
    setClosed(true);
    try {
      await dismiss.mutateAsync();
    } catch {
      // hide even if the API fails; the next GET corrects state
    }
  }

  async function onSubmit() {
    if (rating === null) return;
    try {
      await submit.mutateAsync({ rating, comment: comment.trim() || undefined });
      dismissed.current = true;
      setClosed(true);
      if (rating >= 4) {
        try {
          await requestStoreReview();
        } catch {
          // review prompt is best-effort
        }
      } else {
        Alert.alert('Obrigado!', 'Sua opinião nos ajuda a melhorar o app.');
      }
    } catch (err) {
      if (isConflict(err)) {
        dismissed.current = true;
        setClosed(true);
      }
    }
  }

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-black/50 p-6">
        <View className="w-full gap-4 rounded-2xl bg-card p-6">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="font-heading flex-1 text-xl text-foreground">
              O que você está achando do iNutri?
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onDismiss}
              hitSlop={8}
              disabled={submit.isPending}
            >
              <Ionicons name="close" size={22} color={STAR_OFF} />
            </Pressable>
          </View>
          <Text className="font-sans text-base text-muted-foreground">
            Sua opinião nos ajuda a melhorar o app.
          </Text>
          <View className="flex-row justify-center gap-2">
            {RATINGS.map((n) => (
              <Pressable
                key={n}
                accessibilityLabel={`Nota ${n}`}
                accessibilityRole="button"
                accessibilityState={{ selected: rating === n }}
                onPress={() => setRating(n)}
                hitSlop={4}
              >
                <Ionicons
                  name={rating !== null && n <= rating ? 'star' : 'star-outline'}
                  size={32}
                  color={rating !== null && n <= rating ? STAR_ON : STAR_OFF}
                />
              </Pressable>
            ))}
          </View>
          <TextField
            label="Sugestão ou correção (opcional)"
            multiline
            value={comment}
            onChangeText={setComment}
          />
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              disabled={submit.isPending}
              className="h-12 flex-1 items-center justify-center rounded-full border border-input"
            >
              <Text className="font-sans-medium text-base text-foreground">Agora não</Text>
            </Pressable>
            <View className="flex-1">
              <Button
                label="Enviar"
                onPress={onSubmit}
                disabled={rating === null}
                loading={submit.isPending}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
