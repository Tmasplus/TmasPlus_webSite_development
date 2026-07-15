export function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return isNaN(+d) ? iso : d.toLocaleString();
  } catch {
    return iso;
  }
}
