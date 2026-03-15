export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/home/:path*", "/add-meal/:path*"],
};
