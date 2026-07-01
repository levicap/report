const monthNames = new Map<string, number>(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ].flatMap((name, index) => [
    [name, index + 1],
    [name.slice(0, 3), index + 1]
  ])
);

for (const [name, month] of [
  ["januari", 1],
  ["februari", 2],
  ["maart", 3],
  ["mrt", 3],
  ["mei", 5],
  ["juni", 6],
  ["juli", 7],
  ["oktober", 10],
  ["okt", 10]
] as Array<[string, number]>) {
  monthNames.set(name, month);
}

export function parsePeriodHint(label: string | null | undefined): { start: string | null; end: string | null; label: string | null } {
  if (!label) {
    return { start: null, end: null, label: null };
  }

  const rangeMatch = label.match(/\b([A-Za-z]+)\s+TO\s+([A-Za-z]+)\s+(20\d{2})\b/i);
  if (rangeMatch) {
    const startMonth = monthNames.get(rangeMatch[1].toLowerCase());
    const endMonth = monthNames.get(rangeMatch[2].toLowerCase());
    const year = Number(rangeMatch[3]);
    if (startMonth && endMonth) {
      return {
        start: `${year}-${pad(startMonth)}-01`,
        end: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}`,
        label: `${monthLabel(startMonth)} to ${monthLabel(endMonth)} ${year}`
      };
    }
  }

  const monthMatch = label.match(/\b([A-Za-z]+)\s+(20\d{2})\b/);
  if (monthMatch) {
    const month = monthNames.get(monthMatch[1].toLowerCase());
    const year = Number(monthMatch[2]);
    if (month) {
      return monthPeriod(year, month);
    }
  }

  const isoMonth = label.match(/\b(20\d{2})[-_/](0?[1-9]|1[0-2])\b/);
  if (isoMonth) {
    return monthPeriod(Number(isoMonth[1]), Number(isoMonth[2]));
  }

  const quarter = label.match(/\b(20\d{2})\s*Q([1-4])\b|\bQ([1-4])\s*(20\d{2})\b/i);
  if (quarter) {
    const year = Number(quarter[1] || quarter[4]);
    const q = Number(quarter[2] || quarter[3]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      start: `${year}-${pad(startMonth)}-01`,
      end: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}`,
      label: `${year} Q${q}`
    };
  }

  return { start: null, end: null, label };
}

function monthPeriod(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
    label: date.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })
  };
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthLabel(month: number): string {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" });
}
