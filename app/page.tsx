/** Dashboard: metrics from Supabase projects, nav to projects/weight-calc/remnants, Azure AD sign-in. */
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  CheckCircle,
  FolderOpen,
  Package,
  Layers,
  LogOut,
  Scale,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

type Metric = {
  openQuotes: number;
  pendingApprovals: number;
  ytdQuoted: number;
  totalPl: number;
  activeProjects: number;
  completedProjects: number;
  topCustomers: Array<{ customer: string; revenue: number }>;
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metric>({
    openQuotes: 0,
    pendingApprovals: 0,
    ytdQuoted: 0,
    totalPl: 0,
    activeProjects: 0,
    completedProjects: 0,
    topCustomers: [],
  });
  const [loading, setLoading] = useState(true);

  const { data: session, status } = useSession();

  const fetchMetrics = async () => {
    const now = new Date();
    const ytdStart = `${now.getFullYear()}-01-01`;

    const { data: projects } = await supabase
      .from("projects")
      .select(
        "customer_approval, total_quoted, invoiced_amount, material_cost, labor_cost, engineering_cost, equipment_cost, logistics_cost, additional_costs, project_complete, customer, created_at",
      );

    if (!projects) return;

    const openQuotes = projects.filter(
      (p) => p.customer_approval === "PENDING",
    ).length;
    const pendingApprovals = openQuotes;
    const ytdQuoted = projects
      .filter((p) => p.created_at >= ytdStart)
      .reduce((sum, p) => sum + (p.total_quoted || 0), 0);
    const totalPl = projects.reduce((sum, p) => {
      const costs =
        (p.material_cost || 0) +
        (p.labor_cost || 0) +
        (p.engineering_cost || 0) +
        (p.equipment_cost || 0) +
        (p.logistics_cost || 0) +
        (p.additional_costs || 0);
      return sum + ((p.invoiced_amount || 0) - costs);
    }, 0);
    const activeProjects = projects.filter((p) => !p.project_complete).length;
    const completedProjects = projects.filter((p) => p.project_complete).length;

    // Top 5 customers by invoiced revenue
    const customerMap = new Map();
    projects.forEach((p) => {
      const rev = p.invoiced_amount || 0;
      if (rev > 0) {
        const current = customerMap.get(p.customer) || 0;
        customerMap.set(p.customer, current + rev);
      }
    });
    const topCustomers = Array.from(customerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([customer, revenue]) => ({
        customer: customer.toUpperCase(),
        revenue,
      }));

    setMetrics({
      openQuotes,
      pendingApprovals,
      ytdQuoted,
      totalPl,
      activeProjects,
      completedProjects,
      topCustomers,
    });
    setLoading(false);
  };

   
  useEffect(() => {
    fetchMetrics();

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        fetchMetrics,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMetrics]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading Keystone PMS...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-tighter mb-4">
            KEYSTONE SUPPLY
          </h1>
          <p className="text-2xl mb-12 text-zinc-400">
            Project Management System
          </p>
          <button
            onClick={() => signIn("azure-ad")}
            className="bg-blue-600 hover:bg-blue-700 px-12 py-4 rounded-2xl font-medium text-lg flex items-center gap-3 mx-auto"
          >
            Sign in with Microsoft
          </button>
          <p className="mt-8 text-sm text-zinc-500">
            Only your 4 M365 accounts allowed
          </p>
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-10 text-center text-xl">
        Loading dashboard metrics…
      </div>
    );

  return (
    <>
      {/* User & Sign Out - fixed top-right */}
      <div className="fixed top-8 right-8 z-50 flex items-center gap-4">
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
          <Users size={18} />
          <span className="truncate max-w-48">
            {session?.user?.name ?? "User"}
          </span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-2xl text-sm font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-900/30 hover:border-rose-600/50 hover:shadow-md hover:shadow-rose-500/20 transition-all duration-300 group"
          title="Sign Out"
        >
          <LogOut
            size={18}
            className="group-hover:rotate-180 transition-transform duration-300"
          />
        </button>
      </div>
      <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-10">
        <div className="text-center mb-16">
          <div className="flex flex-col items-center mx-auto max-w-4xl">
            <Image
              src="/logo.png"
              alt="Keystone Supply"
              width={500}
              height={246}
              priority
              className="opacity-85 hover:opacity-95 backdrop-blur-sm max-h-57 rounded-3xl shadow-[0_20px_40px_-12px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_40px_50px_-15px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 transition-all duration-800 ease-out"
            />
            <p className="text-zinc-600 text-lg text-center mt-6">
              Realtime across all 4 users • Last updated just now
            </p>
          </div>
        </div>

        {/* Quick Actions Orbs */}
        <section className="mb-10 px-6">
          <h2 className="text-2xl font-bold text-center mb-12 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent drop-shadow-lg">
            Quick Actions
          </h2>
          <div className="    grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 max-w-7xl mx-auto justify-items-center">
            {/* New Project Orb */}
            <Link
              href="/new-project"
              className="group relative flex flex-col items-center gap-3 p-3 w-28 h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 border-4 border-emerald-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:shadow-[0_0_60px_rgba(16,185,129,0.8)] hover:scale-110 hover:rotate-12 hover:-translate-y-4 transition-all duration-700 ease-out overflow-hidden animation-delay-100"
              title="+ New Project"
            >
              <div className="relative w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-emerald-500/30 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/60 group-hover:scale-110 transition-all duration-500">
                <div className="absolute inset-[-70%] rounded-full bg-gradient-to-r from-emerald-400/50 to-transparent animate-shimmer"></div>
                <Plus className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-emerald-100 drop-shadow-lg group-hover:rotate-90 transition-transform duration-500" />
              </div>
              <span className="text-xs md:text-sm font-bold text-white text-center drop-shadow-md uppercase tracking-wider">
                New Project
              </span>
              {/* Neon Ring */}
              <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/50 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </Link>
            {/* View All Projects Orb - with dynamic badge */}
            <Link
              href="/projects"
              className="group relative flex flex-col items-center gap-3 p-3 w-28 h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 rounded-xl bg-gradient-to-r from-blue-500/20 to-blue-600/20 border-4 border-blue-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:shadow-[0_0_60px_rgba(59,130,246,0.8)] hover:scale-110 hover:rotate-12 hover:-translate-y-4 transition-all duration-700 ease-out overflow-hidden animation-delay-200"
              title="View All Projects"
            >
              <div className="relative w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-blue-500/30 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:shadow-blue-500/60 group-hover:scale-110 transition-all duration-500">
                <div className="absolute inset-[-70%] rounded-full bg-gradient-to-r from-blue-400/50 to-transparent animate-shimmer"></div>
                <FolderOpen className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-blue-100 drop-shadow-lg group-hover:rotate-5 transition-transform duration-500" />
                {/* Dynamic Badge */}
                {metrics.openQuotes > 0 && (
                  <div className="absolute -bottom-2 -right-2 bg-rose-500 text-xs font-bold text-white px-2 py-1 rounded-full shadow-lg animate-pulse">
                    {metrics.openQuotes}
                  </div>
                )}
              </div>
              <span className="text-xs md:text-sm font-bold text-white text-center drop-shadow-md uppercase tracking-wider">
                Projects
              </span>
              <div className="absolute inset-0 rounded-xl border-2 border-blue-400/50 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </Link>
            {/* Combined Nest & Remnants Orb */}
            <Link
              href="/nest-remnants"
              className="group relative flex flex-col items-center gap-3 p-3 w-28 h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 rounded-xl bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-purple-600/20 border-4 border-gradient-to-r from-purple-500/30 to-cyan-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.3),0_0_30px_rgba(14,165,233,0.3)] hover:shadow-[0_0_60px_rgba(168,85,247,0.6),0_0_60px_rgba(14,165,233,0.6)] hover:scale-110 hover:rotate-12 hover:-translate-y-4 transition-all duration-700 ease-out overflow-hidden animation-delay-300"
              title="NestNow"
            >
              <div className="relative w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-gradient-to-r from-purple-500/30 to-cyan-500/30 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:shadow-[0_0_20px_rgba(168,85,247,0.6),0_0_20px_rgba(14,165,233,0.6)] group-hover:scale-110 transition-all duration-500">
                <div className="absolute inset-[-70%] rounded-full bg-gradient-to-r from-purple-400/50 via-cyan-400/50 to-transparent animate-shimmer"></div>
                <Layers className="w-7 h-7 md:w-9 md:h-9 lg:w-11 lg:h-11 text-purple-100 absolute drop-shadow-lg group-hover:rotate-90 transition-transform duration-700" />
                <Package className="w-7 h-7 md:w-9 md:h-9 lg:w-11 lg:h-11 text-cyan-100 relative drop-shadow-lg" />
              </div>
              <span className="text-xs md:text-sm font-bold text-white text-center drop-shadow-md uppercase tracking-wider">
                NestNow
              </span>
              <div className="absolute inset-0 rounded-xl border-2 border-gradient-to-r from-purple-400/50 to-cyan-400/50 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </Link>
            {/* Weight Calc Orb */}
            <Link
              href="/weight-calc"
              className="group relative flex flex-col items-center gap-3 p-3 w-28 h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 rounded-xl bg-gradient-to-r from-amber-500/20 to-amber-600/20 border-4 border-amber-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(245,158,11,0.5)] hover:shadow-[0_0_60px_rgba(245,158,11,0.8)] hover:scale-110 hover:rotate-12 hover:-translate-y-4 transition-all duration-700 ease-out overflow-hidden animation-delay-400"
              title="Weight Calculator"
            >
              <div className="relative w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full bg-amber-500/30 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:shadow-amber-500/60 group-hover:scale-110 transition-all duration-500">
                <div className="absolute inset-[-70%] rounded-full bg-gradient-to-r from-amber-400/50 to-transparent animate-shimmer"></div>
                <Scale className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-amber-100 drop-shadow-lg group-hover:animate-bounce" />
              </div>
              <span className="text-xs md:text-sm font-bold text-white text-center drop-shadow-md uppercase tracking-wider">
                Weight Calc
              </span>
              <div className="absolute inset-0 rounded-xl border-2 border-amber-400/50 animate-spin-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </Link>
          </div>
        </section>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-emerald-400 text-sm font-medium">
                  OPEN QUOTES
                </div>
                <div className="text-6xl font-mono font-bold mt-2">
                  {metrics.openQuotes}
                </div>
              </div>
              <Users className="w-12 h-12 text-emerald-500/30" />
            </div>
          </div>

          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-amber-400 text-sm font-medium">
                  PENDING APPROVALS
                </div>
                <div className="text-6xl font-mono font-bold mt-2">
                  {metrics.pendingApprovals}
                </div>
              </div>
              <CheckCircle className="w-12 h-12 text-amber-500/30" />
            </div>
          </div>

          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-blue-400 text-sm font-medium">
                  YTD QUOTED
                </div>
                <div className="text-6xl font-mono font-bold mt-2">
                  ${metrics.ytdQuoted.toLocaleString()}
                </div>
              </div>
              <DollarSign className="w-12 h-12 text-blue-500/30" />
            </div>
          </div>

          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-purple-400 text-sm font-medium">
                  TOTAL P&amp;L
                </div>
                <div
                  className={`text-6xl font-mono font-bold mt-2 ${metrics.totalPl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  ${metrics.totalPl.toLocaleString()}
                </div>
              </div>
              <TrendingUp className="w-12 h-12 text-purple-500/30" />
            </div>
          </div>
        </div>

        {/* Active vs Completed + Top Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <h3 className="text-xl font-semibold mb-6">Active vs Completed</h3>
            <div className="flex gap-8 items-center">
              <div className="text-center flex-1">
                <div className="text-7xl font-mono font-bold text-white">
                  {metrics.activeProjects}
                </div>
                <div className="text-zinc-500 mt-2">ACTIVE</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-7xl font-mono font-bold text-emerald-400">
                  {metrics.completedProjects}
                </div>
                <div className="text-zinc-500 mt-2">COMPLETED</div>
              </div>
            </div>
          </div>

          <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
            <h3 className="text-xl font-semibold mb-6">
              Top 5 Customers (Revenue)
            </h3>
            <div className="space-y-4">
              {metrics.topCustomers.length > 0 ? (
                metrics.topCustomers.map((c, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="font-medium uppercase">{c.customer}</div>
                    <div className="font-mono text-emerald-400">
                      ${c.revenue.toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 py-8 text-center">
                  No revenue data yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
