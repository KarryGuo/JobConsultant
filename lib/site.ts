export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://zhiguwen.traesite.cn"
    : "http://localhost:3000")
).replace(/\/$/, "");

export const SITE_NAME = "职顾问";

/** 公开联系邮箱：页脚、隐私说明与申诉页统一引用。 */
export const CONTACT_EMAIL = "handsomekarry@foxmail.com";
