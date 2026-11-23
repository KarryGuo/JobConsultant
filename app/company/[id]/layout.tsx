import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * 在页面 loading 边界之前先确认企业存在。
 * 这样未知 ID 仍返回真正的 404，而不是流式响应先发出 200。
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!company) notFound();

  return children;
}
