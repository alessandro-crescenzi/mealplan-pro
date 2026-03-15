export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: ["/home/:path*", "/add-meal/:path*"],
};
