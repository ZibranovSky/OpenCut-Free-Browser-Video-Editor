export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
