import { notFound } from "next/navigation";
import AdminConsole from "@/components/AdminConsole";

// 비밀 URL slug (미설정 시 개발용 기본값 "dev")
const ADMIN_SLUG = process.env.ADMIN_SLUG || "dev";

/**
 * 관리자 진입점: /admin/<slug>
 * URL 의 slug 가 ADMIN_SLUG 와 일치하지 않으면 404 처리하여
 * 관리자 화면의 존재 자체를 노출하지 않는다.
 */
export default async function AdminSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug !== ADMIN_SLUG) notFound();

  return <AdminConsole slug={slug} />;
}
