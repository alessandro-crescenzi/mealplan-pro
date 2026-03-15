// app/page.tsx (Homepage = pagina di login)
import { auth } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth();

  if (session) {
    redirect("/home");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white shadow-md p-8 rounded-md w-full max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Benvenuto su MealPlan Pro</h1>
        <p className="text-gray-500">Accedi per continuare</p>
        <Link
          href="/api/auth/signin"
          className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Login con Google
        </Link>
      </div>
    </div>
  );
}
