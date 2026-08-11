import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] p-4">
      <h1 className="text-4xl font-semibold text-white">haibu</h1>
      <p className="mt-3 text-[#8A8A8A]">
        Book 1-on-1 live video sessions with creators
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-[#A81120] px-6 py-3 font-medium text-white transition hover:opacity-90"
        >
          Log in
        </Link>
        <Link
          href="/login"
          className="rounded-xl bg-[#232323] px-6 py-3 text-white transition hover:bg-[#2A2A2A]"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
