'use client';

import QRCode from 'qrcode';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export function RegistrationTokenQr({
  value,
  width = 220,
  onReady,
}: {
  value: string;
  width?: number;
  /**
   * Fired once the QR image has rendered — or failed to (the fallback text
   * is the settled state then). Lets a print trigger wait until the
   * printout's QR is actually on the page instead of "Preparing QR code…".
   */
  onReady?: () => void;
}) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  // Keep the callback in a ref: an inline onReady from the parent must not
  // re-trigger QR generation on every parent render.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let active = true;
    // A new reference starts from a blank QR: never show the previous
    // applicant's/company's code while the new one generates.
    setQrCode(null);
    setQrError(null);
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width })
      .then((data) => {
        if (active) setQrCode(data);
      })
      .catch(() => {
        if (active)
          setQrError('Could not generate the QR code. The printed token can still be used.');
      })
      .finally(() => {
        if (active) onReadyRef.current?.();
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
