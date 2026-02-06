import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold text-white mb-2">Chat Demo</h1>
      <p className="text-[var(--text-muted)] mb-6">Real estate chatbot (Contract v1.0)</p>
      <Link
        href="/chat"
        className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90"
      >
        Open Chat
      </Link>
    </main>
  );
}
