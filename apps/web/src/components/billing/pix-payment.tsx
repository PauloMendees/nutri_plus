'use client';
import { useState } from 'react';
import type { PixQrCode } from '@nutri-plus/shared-types';
import { Button } from '@/components/ui/button';

export function PixPayment({ pixQrCode }: { pixQrCode: PixQrCode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-sm space-y-4 text-center">
      <img
        src={`data:image/png;base64,${pixQrCode.encodedImage}`}
        alt="QR Code Pix"
        className="mx-auto h-56 w-56 rounded-lg border"
      />
      <Button
        variant="outline"
        className="w-full break-all"
        onClick={() => {
          navigator.clipboard.writeText(pixQrCode.payload);
          setCopied(true);
        }}
      >
        {copied ? 'Copiado!' : 'Copiar código Pix'}
      </Button>
      <p className="text-sm text-muted-foreground">Aguardando pagamento… assim que confirmar, você entra automaticamente.</p>
    </div>
  );
}
