'use client';

import QRCode from 'qrcode';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export function RegistrationTokenQr({ value, width = 220 }: { value: string; width?: number }) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width })
      .then((data) => {
        if (active) setQrCode(data);
      })
      .catch(() => {
        if (active)
          setQrError('Could not generate the QR code. The printed token can still be used.');
      });
    return () => {
      active = false;
    };
  }, [value, width]);

  if (!qrCode) {
    return (
      <p role={qrError ? 'alert' : undefined} className="text-sm">
        {qrError ?? 'Preparing QR code…'}
      </p>
    );
  }

  return (
    <Image
      className="registration-form-qr"
      src={qrCode}
      alt={`QR code for registration reference ${value}`}
      width={width}
      height={width}
      unoptimized
    />
  );
}
