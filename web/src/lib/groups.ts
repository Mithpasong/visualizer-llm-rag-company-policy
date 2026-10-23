// 3D 지도에서 점 색깔을 정하는 규정 묶음. 화면에 보이는 이름은 lib/i18n.ts 의 groups 에 있다.
import type { MapPoint } from "./types";

export const GROUPS = [
  { key: "hr", color: "#5b8cff", sections: ["인사규정", "근무규정", "휴가규정"] },
  { key: "pay", color: "#2fbf8f", sections: ["보수규정", "복리후생규정"] },
  { key: "travel", color: "#f5a524", sections: ["출장 및 여비규정", "경비 및 법인카드 규정"] },
  { key: "security", color: "#f25f7a", sections: ["정보보안규정", "교육 및 자기계발 규정", "상벌 및 징계규정"] },
  { key: "approval", color: "#b07cff", sections: ["위임전결규정"] },
  { key: "appendix", color: "#29c5d6", sections: [] },
  { key: "etc", color: "#94a3b8", sections: [] },
] as const;

export function groupOf(point: Pick<MapPoint, "ref" | "section">) {
  if (point.ref.startsWith("별표")) return GROUPS[5];
  return GROUPS.find((g) => (g.sections as readonly string[]).includes(point.section)) ?? GROUPS[6];
}
