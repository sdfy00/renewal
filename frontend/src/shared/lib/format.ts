export function fmt(minor: number, currency: string) {
  return (
    (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' ' +
    currency
  );
}

export function fmtDate(iso: string) {
  return iso.substring(0, 10).split('-').reverse().join('.');
}
