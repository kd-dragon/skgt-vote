import { getCrewmateColor } from "@/lib/crewmates";

/**
 * 어몽어스풍 크루원 캐릭터 (오리지널 SVG, 공식 에셋 아님).
 * 색상만 바꿔 재사용. 인라인 SVG라 외부 이미지 요청이 없다.
 */
export default function Crewmate({
  color,
  size = 48,
  className,
}: {
  color?: string; // 색상 id
  size?: number;
  className?: string;
}) {
  const c = getCrewmateColor(color);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label={`${c.name} 크루원`}
    >
      {/* 배낭 */}
      <path
        d="M40 96c0-13 10-24 24-24h10v112h-10c-14 0-24-11-24-24z"
        fill={c.shade}
      />
      {/* 몸통 + 두 다리 */}
      <path
        d="M72 88c0-31 25-56 56-56s56 25 56 56v104c0 9-7 16-16 16h-28v-34c0-6-24-6-24 0v34H88c-9 0-16-7-16-16z"
        fill={c.hex}
      />
      {/* 바이저 */}
      <rect x="110" y="58" width="70" height="46" rx="23" fill="#9BD2E8" />
      {/* 바이저 하이라이트 */}
      <rect x="122" y="66" width="20" height="13" rx="6.5" fill="#fff" opacity="0.5" />
    </svg>
  );
}
