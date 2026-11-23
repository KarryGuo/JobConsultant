import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/companies`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/coverage`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const companies = await prisma.company.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50_000,
    });

    return [
      ...staticRoutes,
      ...companies.map((company) => ({
        url: `${SITE_URL}/company/${company.id}`,
        lastModified: company.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    // 数据库不可用时仍返回静态页，避免 sitemap 整体 500。
    console.error("sitemap company query failed", error);
    return staticRoutes;
  }
}
