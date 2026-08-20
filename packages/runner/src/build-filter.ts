export function buildFilterFor(packageName: string): string[] {
  return ['build', '--filter', packageName];
}
