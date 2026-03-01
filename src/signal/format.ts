// Stub: channel removed during ANIMA v2 rebranding
export type SignalTextStyleRange = { start: number; length: number; style: string };
export function markdownToSignalTextChunks(
  text: string,
  _limit?: number,
  _opts?: any,
): Array<{ text: string; styles: SignalTextStyleRange[] }> {
  return [{ text, styles: [] }];
}
