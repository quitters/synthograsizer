export function cx(
  ...parts: Array<string | false | null | undefined>
): string | undefined {
  const s = parts.filter(Boolean).join(' ');
  return s || undefined;
}
