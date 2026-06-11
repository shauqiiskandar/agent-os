export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "..." : str;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
