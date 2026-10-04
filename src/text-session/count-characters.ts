/** Length in Unicode characters (code points), so the client and server count emoji and accented text the same way. */
export function countCharacters(text: string): number {
  return Array.from(text).length;
}
