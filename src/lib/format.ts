// Date helpers with one fixed numeric layout, so dates look the same in every browser and language
// (the "uz-UZ" locale renders as "2026 M10 13" in some browsers).
const pad = (n: number) => String(n).padStart(2, "0");

export const formatDate = (value: string | number | Date) => {
  const d = new Date(value);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export const formatTime = (value: string | number | Date) => {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDateTime = (value: string | number | Date) =>
  `${formatDate(value)} ${formatTime(value)}`;
