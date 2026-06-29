const SCALE = 6n;
const MULTIPLIER = 1_000_000n;

export function parseMoney(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let text = String(value).trim().replace(/,/g, "");
  if (!text) {
    return null;
  }
  text = text.replace(/\$/g, "").replace(/\b(?:USD|EUR|GBP)\b/g, "").trim();
  if (text.startsWith("(") && text.endsWith(")")) {
    text = `-${text.slice(1, -1)}`;
  }

  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]) * MULTIPLIER;
  const fractionText = (match[3] ?? "").padEnd(Number(SCALE), "0").slice(0, Number(SCALE));
  return sign * (whole + BigInt(fractionText || "0"));
}

export function moneyToString(value: bigint | null | undefined): string {
  if (value === null || value === undefined) {
    return "0";
  }
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MULTIPLIER;
  const fraction = String(absolute % MULTIPLIER).padStart(Number(SCALE), "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function absMoney(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export const ONE_CENT = 10_000n;

