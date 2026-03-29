import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      if (pathname === "/" && isLoggedIn) {
        return Response.redirect(new URL("/home", nextUrl));
      }

      if (
        (pathname.startsWith("/home") || pathname.startsWith("/add-meal")) &&
        !isLoggedIn
      ) {
        return false;
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
