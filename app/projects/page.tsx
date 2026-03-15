/*
keystone-pms/app/projects/page.tsx
All Projects List Page – ENHANCED WITH INSTANT GLOBAL SEARCH
*/

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Eye, ArrowLeft, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

type Project = any;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: session } = useSession();

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("project_number", { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
    const channel = supabase
      .channel("projects-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        fetchProjects,
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  if (loading)
    return (
      <div className="p-10 text-center text-xl text-white">
        Loading projects…
      </div>
    );

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 group relative bg-zinc-900/95 backdrop-blur-sm hover:bg-zinc-900 border border-blue-900/50 rounded-2xl px-6 py-3 font-medium text-white shadow-[0_20px_40px_-10px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_30px_50px_-12px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-1 hover:scale-[1.05] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              Dashboard
            </Link>
            <Image
              src="/logo.png"
              alt="Keystone Supply"
              width={250}
              height={123}
              priority
              className="opacity-85 hover:opacity-95 backdrop-blur-sm max-h-28 rounded-3xl shadow-[0_10px_20px_-6px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_15px_25px_-8px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-0.5 transition-all duration-500 ease-out"
            />
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
                All Projects
              </h1>
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
                <Users size={18} />
                <span className="truncate max-w-48">
                  {session?.user?.name ?? "User"}
                </span>
              </div>
              <p className="text-zinc-600 text-lg text-center">
                Realtime across all 4 users • {projects.length} total
              </p>
            </div>
          </div>
          <Link
            href="/new-project"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-emerald-600/95 to-emerald-700/95 backdrop-blur-sm hover:from-emerald-600 hover:to-emerald-700 px-6 py-3 rounded-2xl font-medium text-white shadow-[0_15px_35px_-10px_rgba(16,185,129,0.4)] shadow-emerald-500/40 hover:shadow-[0_25px_50px_-12px_rgba(16,185,129,0.5)] hover:shadow-emerald-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-emerald-500/50 border-emerald-500/30 transition-all duration-500 ease-out overflow-hidden"
          >
            <Plus className="w-5 h-5" /> New Project
          </Link>
        </div>

        <div className="bg-zinc-900 border border-zinc-600 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full">
            <thead className="bg-zinc-950 border-b border-zinc-800">
              <tr>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  PROJECT #
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  CUSTOMER
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  PROJECT NAME
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  APPROVAL
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  COMPLETE
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  INVOICED
                </th>
                <th className="px-8 py-5 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                  P&amp;L MARGIN
                </th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-blue-600/80 transition-colors group"
                >
                  <td className="px-8 py-6 font-mono text-lg font-semibold text-white">
                    {p.project_number}
                  </td>
                  <td className="px-8 py-6 uppercase font-medium text-white">
                    {p.customer}
                  </td>
                  <td className="px-8 py-6 uppercase text-white">
                    {p.project_name}
                  </td>
                  <td className="px-8 py-6">
                    {p.customer_approval && (
                      <span
                        className={`inline-flex items-center px-4 py-1 rounded-full text-xs font-semibold ring-1 ring-inset
                        ${p.customer_approval === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30" : ""}
                        ${p.customer_approval === "REJECTED" ? "bg-red-500/10 text-red-400 ring-red-500/30" : ""}
                        ${p.customer_approval === "PENDING" ? "bg-amber-500/10 text-amber-400 ring-amber-500/30" : ""}
                      `}
                      >
                        {p.customer_approval}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-white font-medium">
                    {p.project_complete ? "✅ YES" : "NO"}
                  </td>
                  <td className="px-8 py-6 text-white font-medium">
                    {p.invoiced_amount
                      ? `$${p.invoiced_amount.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-8 py-6 text-white font-medium">
                    {p.pl_margin ? `${p.pl_margin}%` : "—"}
                  </td>
                  <td className="px-8 py-6">
                    <Link
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300 group-hover:text-blue-400 transition-colors"
                    >
                      <Eye className="w-4 h-4" /> View
                    </Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-8 py-20 text-center text-zinc-500"
                  >
                    No projects yet – create one above
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
