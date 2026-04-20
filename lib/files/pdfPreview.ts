export function buildPdfPageNumbers(pageCount: number | null): number[] {
  if (!pageCount || pageCount < 1) {
    return [1];
  }
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}
