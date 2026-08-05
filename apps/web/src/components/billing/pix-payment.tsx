'use client';
import { useState } from 'react';
import type { PixQrCode } from '@nutri-plus/shared-types';

export function PixPayment({ pixQrCode }: { pixQrCode: PixQrCode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <img
        src={`data:image/png;base64,${pixQrCode.encodedImage}`}
        alt="QR Code Pix"
        className="mx-auto h-56 w-56 rounded-lg border"
      />
      <button
        className="w-full break-all rounded-lg border px-3 py-2 text-sm"
        onClick={() => {
          navigator.clipboard.writeText(pixQrCode.payload);
          setCopied(true);
        }}
      >
        {copied ? 'Copiado!' : 'Copiar código Pix'}
      </button>
      <p className="text-sm text-muted-foreground">Aguardando pagamento… assim que confirmar, você entra automaticamente.</p>
    </div>
  );
}
