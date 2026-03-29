// app/page.tsx (Homepage = pagina di login)
import Link from "next/link";

export default function Page() {
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
