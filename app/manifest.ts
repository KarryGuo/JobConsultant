import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "职顾问 · offer 之前，先查这家公司",
    short_name: "职顾问",
    description:
      "输入公司名，查它有没有欠薪、社保欠缴、招聘收费等公开记录。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#1d1d19",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
