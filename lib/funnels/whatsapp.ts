export function normaliseWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) {
    return `60${digits.slice(1)}`;
  }
  return digits;
}

export function buildWaLink(phoneNumber: string, preFillMessage?: string): string {
  const base = `https://wa.me/${normaliseWhatsAppNumber(phoneNumber)}`;
  return preFillMessage ? `${base}?text=${encodeURIComponent(preFillMessage)}` : base;
}

export function isValidMalaysianNumber(normalised: string): boolean {
  return /^60[0-9]{8,10}$/.test(normalised);
}
