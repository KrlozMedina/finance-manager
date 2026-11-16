
const CURRENCY_EXPONENTS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  COP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function getCurrencyExponent(currency: string): number {
  const normalized = currency.toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Código de moneda no válido.");
  }

  return CURRENCY_EXPONENTS[normalized] ?? 2;
}

export function getCurrencyFactor(currency: string): bigint {
  return 10n ** BigInt(getCurrencyExponent(currency));
}

export function toMinorUnits(
  amount: string,
  currency: string
): number {
  const normalized = amount.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("El importe debe ser un número decimal válido.");
  }

  const exponent = getCurrencyExponent(currency);
  const [integerPart, decimalPart = ""] = normalized.split(".");

  if (decimalPart.length > exponent) {
    throw new Error(
      `La moneda ${currency} admite máximo ${exponent} decimales.`
    );
  }

  const factor = getCurrencyFactor(currency);
  const decimals = decimalPart.padEnd(exponent, "0");

  const minorUnits =
    BigInt(integerPart) * factor +
    BigInt(decimals || "0");

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("El importe supera el límite permitido.");
  }

  return Number(minorUnits);
}

export function fromMinorUnits(
  amountMinor: number,
  currency: string
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error("El importe debe ser un entero seguro.");
  }

  const exponent = getCurrencyExponent(currency);
  const factor = getCurrencyFactor(currency);
  const amount = BigInt(amountMinor);

  const integerPart = amount / factor;

  if (exponent === 0) {
    return integerPart.toString();
  }

  const decimalPart = (amount % factor)
    .toString()
    .padStart(exponent, "0");

  return `${integerPart}.${decimalPart}`;
}

export function convertMinorUnits(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: string
): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("El importe de origen no es válido.");
  }

  if (!/^\d+(\.\d+)?$/.test(rate)) {
    throw new Error("La tasa de cambio no es válida.");
  }

  const exchangeRate = Number(rate);

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("La tasa de cambio debe ser mayor que cero.");
  }

  const fromExponent = getCurrencyExponent(fromCurrency);
  const toExponent = getCurrencyExponent(toCurrency);

  const precision = 12;
  const rateScaled = BigInt(
    Math.round(exchangeRate * 10 ** precision)
  );

  const numerator =
    BigInt(amountMinor) *
    rateScaled *
    getCurrencyFactor(toCurrency);

  const denominator =
    getCurrencyFactor(fromCurrency) *
    10n ** BigInt(precision);

  // Redondeo al entero más cercano.
  const converted =
    (numerator + denominator / 2n) / denominator;

  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("El importe convertido supera el límite permitido.");
  }

  return Number(converted);
}
