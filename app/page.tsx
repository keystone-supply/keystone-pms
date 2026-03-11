'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Users, DollarSign, TrendingUp, CheckCircle, FolderOpen, Package, Layers, LogOut, Scale } from 'lucide-react';
import { signIn, signOut, useSession } from "next-auth/react";

type Metric = {
  openQuotes: number;
  pendingApprovals: number;
  ytdQuoted: number;
  totalPl: number;
  activeProjects: number;
  completedProjects: number;
  topCustomers: Array<{customer: string; revenue: number}>;
};

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metric>({
    openQuotes: 0,
    pendingApprovals: 0,
    ytdQuoted: 0,
    totalPl: 0,
    activeProjects: 0,
    completedProjects: 0,
    topCustomers: []
  });
  const [loading, setLoading] = useState(true);

  const { data: session, status } = useSession();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const fetchMetrics = async () => {
    const now = new Date();
    const ytdStart = `${now.getFullYear()}-01-01`;

    const { data: projects } = await supabase
      .from('projects')
      .select('customer_approval, total_quoted, invoiced_amount, material_cost, labor_cost, engineering_cost, equipment_cost, logistics_cost, additional_costs, project_complete, customer, created_at');

    if (!projects) return;

    const openQuotes = projects.filter(p => p.customer_approval === 'PENDING').length;
    const pendingApprovals = openQuotes;
    const ytdQuoted = projects
      .filter(p => p.created_at >= ytdStart)
      .reduce((sum, p) => sum + (p.total_quoted || 0), 0);
    const totalPl = projects.reduce((sum, p) => {
      const costs = (p.material_cost||0) + (p.labor_cost||0) + (p.engineering_cost||0) + (p.equipment_cost||0) + (p.logistics_cost||0) + (p.additional_costs||0);
      return sum + ((p.invoiced_amount||0) - costs);
    }, 0);
    const activeProjects = projects.filter(p => !p.project_complete).length;
    const completedProjects = projects.filter(p => p.project_complete).length;

    // Top 5 customers by invoiced revenue
    const customerMap = new Map();
    projects.forEach(p => {
      const rev = p.invoiced_amount || 0;
      if (rev > 0) {
        const current = customerMap.get(p.customer) || 0;
        customerMap.set(p.customer, current + rev);
      }
    });
    const topCustomers = Array.from(customerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([customer, revenue]) => ({ customer: customer.toUpperCase(), revenue }));

    setMetrics({
      openQuotes,
      pendingApprovals,
      ytdQuoted,
      totalPl,
      activeProjects,
      completedProjects,
      topCustomers
    });
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    fetchMetrics();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, fetchMetrics)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
          <h1 className="text-6xl font-bold tracking-tighter mb-4">KEYSTONE SUPPLY</h1>
          <p className="text-2xl mb-12 text-zinc-400">Project Management System</p>
          <button
            onClick={() => signIn("azure-ad")}
            className="bg-blue-600 hover:bg-blue-700 px-12 py-4 rounded-2xl font-medium text-lg flex items-center gap-3 mx-auto"
          >
            Sign in with Microsoft
          </button>
          <p className="mt-8 text-sm text-zinc-500">Only your 4 M365 accounts allowed</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex h-screen items-center justify-center bg-zinc-950 text-white p-10 text-center text-xl">Loading dashboard metrics…</div>;

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto space-y-10">
      <div className="flex justify-between items-start mb-12 gap-8">
        <div className="flex flex-col items-center">
          <div className="mb-6">
            <Image
              src="/logo.png"
              alt="Keystone Supply"
              width={500}
              height={246}
              priority
              className="opacity-85 hover:opacity-95 backdrop-blur-sm max-h-57 rounded-3xl shadow-[0_20px_40px_-12px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_40px_50px_-15px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 transition-all duration-800 ease-out"
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0 mb-3">
            <Users size={18} />
            <span className="truncate max-w-48">{session?.user?.name ?? "User"}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800/50 rounded-2xl text-sm font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-900/30 hover:border-rose-600/50 hover:shadow-md hover:shadow-rose-500/20 transition-all duration-300 group"
            title="Sign Out"
          >
            <LogOut size={16} className="group-hover:rotate-180 transition-transform duration-300" />
            <span>Sign Out</span>
          </button>
          <p className="text-zinc-600 text-lg text-center mt-4">Realtime across all 4 users • Last updated just now</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 auto-rows-fr justify-items-end ml-auto max-w-full lg:max-w-2xl">

          <Link
            href="/new-project"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-emerald-600/95 to-emerald-700/95 backdrop-blur-sm hover:from-emerald-600 hover:to-emerald-700 px-3 py-2 sm:px-5 sm:py-2.5 lg:px-8 lg:py-3.5 rounded-2xl font-semibold text-sm sm:text-base lg:text-lg shadow-[0_15px_35px_-10px_rgba(16,185,129,0.4)] shadow-emerald-500/40 hover:shadow-[0_25px_50px_-12px_rgba(16,185,129,0.5)] hover:shadow-emerald-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-emerald-500/50 border-emerald-500/30 transition-all duration-500 ease-out overflow-hidden flex-shrink-0"
          >
            <Plus className="w-5 h-5" /> New Project
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-blue-600/95 to-blue-700/95 backdrop-blur-sm hover:from-blue-600 hover:to-blue-700 px-3 py-2 sm:px-5 sm:py-2.5 lg:px-8 lg:py-3.5 rounded-2xl font-semibold text-sm sm:text-base lg:text-lg shadow-[0_15px_35px_-10px_rgba(59,130,246,0.4)] shadow-blue-500/40 hover:shadow-[0_25px_50px_-12px_rgba(59,130,246,0.5)] hover:shadow-blue-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-blue-500/50 border-blue-500/30 transition-all duration-500 ease-out overflow-hidden flex-shrink-0"
          >
            <FolderOpen className="w-5 h-5" /> View All Projects
          </Link>
          <Link
            href="/remnants"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-purple-600/95 to-purple-700/95 backdrop-blur-sm hover:from-purple-600 hover:to-purple-700 px-3 py-2 sm:px-5 sm:py-2.5 lg:px-8 lg:py-3.5 rounded-2xl font-semibold text-sm sm:text-base lg:text-lg shadow-[0_15px_35px_-10px_rgba(168,85,247,0.4)] shadow-purple-500/40 hover:shadow-[0_25px_50px_-12px_rgba(168,85,247,0.5)] hover:shadow-purple-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-purple-500/50 border-purple-500/30 transition-all duration-500 ease-out overflow-hidden flex-shrink-0"
          >
            <Package className="w-5 h-5" /> Remnant Tracker
          </Link>
          <Link
            href="/nest-tool"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-cyan-600/95 to-cyan-700/95 backdrop-blur-sm hover:from-cyan-600 hover:to-cyan-700 px-3 py-2 sm:px-5 sm:py-2.5 lg:px-8 lg:py-3.5 rounded-2xl font-semibold text-sm sm:text-base lg:text-lg shadow-[0_15px_35px_-10px_rgba(14,165,233,0.4)] shadow-cyan-500/40 hover:shadow-[0_25px_50px_-12px_rgba(14,165,233,0.5)] hover:shadow-cyan-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-cyan-500/50 border-cyan-500/30 transition-all duration-500 ease-out overflow-hidden flex-shrink-0"
          >
            <Layers className="w-5 h-5" /> NestNow
          </Link>
          <Link
            href="/weight-calc"
            className="flex items-center gap-2 group relative bg-gradient-to-r from-amber-600/95 to-amber-700/95 backdrop-blur-sm hover:from-amber-600 hover:to-amber-700 px-3 py-2 sm:px-5 sm:py-2.5 lg:px-8 lg:py-3.5 rounded-2xl font-semibold text-sm sm:text-base lg:text-lg shadow-[0_15px_35px_-10px_rgba(245,158,11,0.4)] shadow-amber-500/40 hover:shadow-[0_25px_50px_-12px_rgba(245,158,11,0.5)] hover:shadow-amber-500/60 hover:-translate-y-1 hover:scale-[1.05] hover:border-amber-500/50 border-amber-500/30 transition-all duration-500 ease-out overflow-hidden flex-shrink-0"
          >
            <Scale className="w-5 h-5" /> Weight Calc
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-emerald-400 text-sm font-medium">OPEN QUOTES</div>
              <div className="text-6xl font-mono font-bold mt-2">{metrics.openQuotes}</div>
            </div>
            <Users className="w-12 h-12 text-emerald-500/30" />
          </div>
        </div>

        <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-amber-400 text-sm font-medium">PENDING APPROVALS</div>
              <div className="text-6xl font-mono font-bold mt-2">{metrics.pendingApprovals}</div>
            </div>
            <CheckCircle className="w-12 h-12 text-amber-500/30" />
          </div>
        </div>

        <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-blue-400 text-sm font-medium">YTD QUOTED</div>
              <div className="text-6xl font-mono font-bold mt-2">${metrics.ytdQuoted.toLocaleString()}</div>
            </div>
            <DollarSign className="w-12 h-12 text-blue-500/30" />
          </div>
        </div>

        <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-purple-400 text-sm font-medium">TOTAL P&amp;L</div>
              <div className={`text-6xl font-mono font-bold mt-2 ${metrics.totalPl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
              <div className="text-7xl font-mono font-bold text-white">{metrics.activeProjects}</div>
              <div className="text-zinc-500 mt-2">ACTIVE</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-7xl font-mono font-bold text-emerald-400">{metrics.completedProjects}</div>
              <div className="text-zinc-500 mt-2">COMPLETED</div>
            </div>
          </div>
        </div>

        <div className="group relative bg-zinc-900/95 backdrop-blur-sm border border-blue-900/50 rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(30,58,138,0.4)] shadow-blue-950/70 hover:shadow-[0_35px_60px_-15px_rgba(30,58,138,0.5)] hover:shadow-blue-900/80 hover:-translate-y-2 hover:scale-[1.02] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
          <h3 className="text-xl font-semibold mb-6">Top 5 Customers (Revenue)</h3>
          <div className="space-y-4">
            {metrics.topCustomers.length > 0 ? metrics.topCustomers.map((c, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="font-medium uppercase">{c.customer}</div>
                <div className="font-mono text-emerald-400">${c.revenue.toLocaleString()}</div>
              </div>
            )) : <div className="text-zinc-500 py-8 text-center">No revenue data yet</div>}
          </div>
        </div>
      </div>

    </div>
  );
}
