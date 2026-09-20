import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./teacher-preview-notifications.css";
import "./teacher-workspace.css";
import "./admin-workspace.css";
import "./typography.css";
import { ScrollbarManager } from "./scrollbar-manager";
import "./app-select.css";
import "./mobile-workspace.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "BNBU Sports 教师与管理端｜体育课程管理",
    description: "北师香港浸会大学体育课程管理入口。教师管理课程、学生名单与运动记录；管理员管理学生账户、学期和平台规则。",
    alternates: { canonical: "https://www.teacher.bnbusports.cn/" },
    openGraph: {
      type: "website",
      siteName: "BNBU Sports 教师与管理端",
      url: "https://www.teacher.bnbusports.cn/",
      title: "BNBU Sports 教师与管理端｜体育课程管理",
      description: "体育课程、学生名单、运动记录与学期管理。",
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "BNBU Sports 教师与管理端｜体育课程管理",
      description: "体育课程、学生名单、运动记录与学期管理。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><link rel="icon" type="image/svg+xml" href="/bnbu-sports-icon.svg" /></head>
      <body>
        <ScrollbarManager />
        {children}
      </body>
    </html>
  );
}
