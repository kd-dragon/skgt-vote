// 어몽어스풍 크루원 색상 팔레트 (공식 에셋 아님, 오리지널 색상 세트)
// hex: 몸통 색, shade: 배낭/그림자용 어두운 색

export interface CrewmateColor {
  id: string;
  name: string; // 한국어 표시명
  hex: string;
  shade: string;
}

export const CREWMATE_COLORS: CrewmateColor[] = [
  { id: "red", name: "빨강", hex: "#C51111", shade: "#7A0838" },
  { id: "blue", name: "파랑", hex: "#132ED1", shade: "#09158E" },
  { id: "green", name: "초록", hex: "#117F2D", shade: "#0A4D2E" },
  { id: "pink", name: "분홍", hex: "#ED54BA", shade: "#AB2BAD" },
  { id: "orange", name: "주황", hex: "#EF7D0D", shade: "#B33E15" },
  { id: "yellow", name: "노랑", hex: "#F6F657", shade: "#C38823" },
  { id: "black", name: "검정", hex: "#3F474E", shade: "#1E1F26" },
  { id: "white", name: "하양", hex: "#D6E0F0", shade: "#8394BF" },
  { id: "purple", name: "보라", hex: "#6B2FBB", shade: "#3B177C" },
  { id: "cyan", name: "청록", hex: "#38FEDC", shade: "#24A8BE" },
  { id: "lime", name: "연두", hex: "#50EF39", shade: "#15A742" },
  { id: "brown", name: "갈색", hex: "#71491E", shade: "#5E2615" },
];

export const DEFAULT_COLOR_ID = "red";

/** 색상 id로 색상 정보 조회 (없으면 기본색) */
export function getCrewmateColor(id?: string): CrewmateColor {
  return CREWMATE_COLORS.find((c) => c.id === id) ?? CREWMATE_COLORS[0];
}

/** 유효한 색상 id인지 */
export function isValidColorId(id?: string): boolean {
  return CREWMATE_COLORS.some((c) => c.id === id);
}
