export function formatAmount(value: string | number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || value === "") {
    return "Missing";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return `${numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Missing";
  }
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
}

export function compactHash(value: string | null | undefined): string {
  if (!value) {
    return "Missing";
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

