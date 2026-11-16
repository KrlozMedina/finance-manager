
import { auth } from "@/auth";

export default auth((request) => {
  const isAuthenticated = Boolean(request.auth);
  const { pathname } = request.nextUrl;

  const publicRoutes = ["/login", "/register"];

  const isPublicRoute = publicRoutes.some(
    (route) =>
      pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!isAuthenticated && !isPublicRoute) {
    return Response.redirect(
      new URL("/login", request.nextUrl)
    );
  }

  if (isAuthenticated && isPublicRoute) {
    return Response.redirect(
      new URL("/dashboard", request.nextUrl)
    );
  }
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
