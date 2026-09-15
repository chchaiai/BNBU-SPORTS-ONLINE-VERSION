import { regions } from "../../frontend/student/js/region-catalog.js";
import type { AdminLocale, StudentProfileProjection } from "./admin-types";

export function adminStudentRegion(
  student: Pick<StudentProfileProjection, "regionCode" | "otherRegionName">,
  locale: AdminLocale,
): string {
  const code = student.regionCode?.trim();
  if (!code) return "—";
  if (code === "OTHER" && student.otherRegionName?.trim()) return student.otherRegionName.trim();
  const region = regions.find(([value]) => value === code);
  return region ? region[locale === "zh" ? 1 : 2] : code;
}
