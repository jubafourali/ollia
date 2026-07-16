import type { ApiCoverage } from "@/utils/api";

/** Short banner/quiet line — lists every active source for the pack. */
export function formatCoverageQuietLine(place: string, coverage?: ApiCoverage | null): string {
  if (!coverage) {
    return `No major verified alerts for ${place}.`;
  }
  const sources = coverage.sourcesActive.join(", ");
  return `No major verified alerts for ${place}. Checked: ${sources}.`;
}

export function coveragePackTitle(coverage?: ApiCoverage | null): string {
  return coverage?.packLabel || "What Ollia checks here";
}

/** Prefer server gapChips; fall back to a short not-covered slice. */
export function coverageGapChips(coverage?: ApiCoverage | null): string[] {
  if (coverage?.gapChips?.length) return coverage.gapChips.slice(0, 4);
  return (coverage?.notCoveredLabels || []).slice(0, 4);
}
