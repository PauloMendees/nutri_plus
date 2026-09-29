# Gravação de consulta persistente + floater global

**Data:** 2026-09-29 · **Status:** aguardando revisão

## Problema

A gravação de consulta vive dentro de `ConsultationAudioSection`, renderizada na aba
Anamnese de `patient-detail.tsx`. O `TabsContent` do Radix desmonta abas inativas, e o
cleanup do componente chama `recorder.stop()`. Resultado: trocar de aba ou de página
encerra a gravação (o parcial é enviado, mas a consulta fica cortada).

## Objetivo

- A gravação continua enquanto a nutricionista navega por qualquer página do app
  (grupo de rotas `(app)`).
- Fora da aba Anamnese do paciente que está sendo gravado, um floater no centro
  inferior da tela mostra a gravação e permite **parar e salvar** ou **descartar**.
- Nunca existe mais de uma gravação ao mesmo tempo.

**Fora do escopo (opção B descartada):** iniciar gravação pelo floater. Iniciar continua
sendo só pela aba Anamnese, onde fica o checkbox de consentimento do paciente.

**Limite do navegador:** recarregar a página, fechar a aba ou sair do app (ex.: logout,
páginas fora de `(app)`) encerra o `MediaRecorder`. Não dá para evitar; mitigamos com um
aviso `beforeunload` enquanto grava.

## Arquitetura

### `RecordingProvider` (novo) — `src/components/recording/recording-provider.tsx`

Contexto React montado no `(app)/layout.tsx`, dentro de `Providers` (precisa do
QueryClient). Passa a ser o **único dono** de `MediaRecorder`, `MediaStream`, chunks,
`AudioContext` do medidor e cronômetro — tudo que hoje está em refs de
`ConsultationAudioSection`, movido sem mudar o comportamento (32 kbps, cronômetro derivado
de `startedAt`, medidor respeitando `prefers-reduced-motion`).

Estado exposto por `useRecording()`:

```ts
type RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; patientId: string; patientName: string; startedAt: number }
  | { status: 'uploading'; patientId: string; patientName: string };

interface RecordingApi {
  state: RecordingState;
  elapsedSec: number;
  levels: number[];            // medidor, BAR_COUNT barras
  start(p: { patientId: string; patientName: string }): Promise<void>;
  stopAndSave(): void;
  discard(): void;
}
```

- **Uma gravação por vez:** `start()` é no-op (com `toast.error`) se `status !== 'idle'`.
  É a única porta de entrada, então a regra vale por construção.
- **Upload:** chama `uploadAudio(patientId, …)` direto da API (não o hook
  `useUploadAudio(patientId)`, que amarra o paciente na montagem) e depois
  `queryClient.invalidateQueries({ queryKey: ['audios', patientId] })`, com os mesmos
  toasts de hoje. Em falha, o estado volta a `idle` e o toast de erro aparece.
- **`beforeunload`:** registrado só enquanto `status === 'recording'`.
- O provider **não** desmonta durante a navegação client-side, então o cleanup de
  desmontagem só roda quando o layout inteiro sai (ex.: logout) — aí para e envia o
  parcial, como hoje.

### `ConsultationAudioSection` (alterado)

Vira consumidor de `useRecording()`. Mantém checkbox de consentimento, lista de áudios,
exclusão e transcrição. O bloco de gravação muda conforme o estado global:

| Estado global | Aba Anamnese do paciente X mostra |
|---|---|
| `idle` | Checkbox + botão **Gravar** (igual a hoje) |
| gravando **X** | Cronômetro, medidor, **Parar gravação**, **Cancelar** (igual a hoje) |
| gravando **outro paciente Y** | Aviso "Há uma gravação em andamento de *Y*" + link para a anamnese de Y; botão Gravar desabilitado |
| `uploading` | Botão "Enviando…" desabilitado |

O cleanup de desmontagem que chamava `recorder.stop()` é removido — é ele que causa o
bug.

O checkbox de consentimento é estado local da seção e é desmarcado quando uma gravação
iniciada nela começa — cada nova gravação exige marcar de novo (hoje ele é desmarcado
após o upload; como a seção pode nem estar montada quando o upload termina, o reset
passa para o início).

Recebe `patientName` como prop nova (vem de `patient.name` em `patient-detail.tsx`).

### `RecordingFloater` (novo) — `src/components/recording/recording-floater.tsx`

Montado no `(app)/layout.tsx` ao lado de `CornerWidgets`.

- **Visível** quando `status !== 'idle'` **e** a tela atual não é a aba Anamnese do
  paciente gravado. "Aba Anamnese do paciente gravado" = `pathname === /patients/{id}`
  **e** `searchParams.tab === 'anamnese'` (via `usePathname`/`useSearchParams`).
  Na anamnese de *outro* paciente o floater aparece.
- **Posição:** `fixed bottom-4 left-1/2 -translate-x-1/2 z-50`; não colide com
  `CornerWidgets` (canto inferior direito). No mobile ocupa a largura com margem de 16px.
- **Conteúdo:** ponto vermelho pulsante, "Gravando · *nome do paciente*", cronômetro,
  medidor compacto, botões **Parar e salvar** e **Descartar**, e link "Abrir anamnese"
  para `/patients/{id}?tab=anamnese`.
- **Descartar** abre o mesmo dialog de confirmação de hoje ("Descartar esta gravação?").
  Esse dialog vira um componente compartilhado (`discard-recording-dialog.tsx`) usado
  pela seção e pelo floater.
- Durante `uploading`: mostra "Enviando gravação…" sem botões.

## Fluxo

1. Anamnese do paciente X → marca consentimento → **Gravar** → `start({X})`.
2. Navega para Agenda → aba desmonta, provider continua gravando → floater aparece.
3. **Parar e salvar** no floater → `stopAndSave()` → upload → toast "Gravação salva." →
   lista de áudios de X é invalidada (atualiza ao voltar).
4. Enquanto grava X, abre a anamnese de Y → vê o aviso e não consegue iniciar outra.

## Testes

- `recording-provider.test.tsx` (MediaRecorder/getUserMedia falsos): start → estado
  `recording`; segundo `start` é recusado; `stopAndSave` envia com o `patientId` da
  gravação e invalida `['audios', id]`; `discard` não envia; falha no upload volta a
  `idle`; `beforeunload` registrado só gravando.
- `recording-floater.test.tsx`: oculto em `idle`; oculto na anamnese do paciente gravado;
  visível em outra rota e na anamnese de outro paciente; Parar e salvar / Descartar
  chamam a API do contexto.
- `consultation-audio-section.test.tsx`: testes atuais de gravação migram para usar o
  provider; novo caso "gravação de outro paciente em andamento bloqueia Gravar"; novo
  caso "desmontar a seção não para a gravação".

## Riscos

- **Consentimento:** o checkbox continua sendo pré-condição de `start()` na seção; o
  floater não inicia gravações, então não há caminho sem consentimento.
- **Tamanho:** o teto de ~1h45 a 32 kbps continua valendo; gravação longa esquecida em
  segundo plano é mais provável agora. Sem mudança nesta entrega — o floater visível em
  toda página já torna o esquecimento improvável.
