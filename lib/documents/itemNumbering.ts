export function buildHierarchicalItemNumbers(depths: number[]): string[] {
  const counters: number[] = [];
  return depths.map((rawDepth) => {
    const depth = Number.isFinite(rawDepth) ? Math.max(0, Math.floor(rawDepth)) : 0;
    while (counters.length <= depth) counters.push(0);
    counters.length = depth + 1;
    counters[depth] += 1;
    return counters.join(".");
  });
}
