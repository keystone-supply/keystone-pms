'use client';

import { useSession } from "next-auth/react";
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Users, Layers } from 'lucide-react';

export default function NestToolPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group relative bg-zinc-900/95 backdrop-blur-sm hover:bg-zinc-900 border border-blue-900/50 rounded-2xl px-6 py-3 font-medium text-white shadow-[0_20px_40px_-10px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_30px_50px_-12px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-1 hover:scale-[1.05] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden">
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
              <h1 className="text-4xl font-bold text-white tracking-tight mb-3">Nest Tool</h1>
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
                <Users size={18} />
                <span className="truncate max-w-48">{session?.user?.name ?? "User"}</span>
              </div>
              <p className="text-zinc-600 text-lg text-center">Advanced nesting optimization</p>
            </div>
          </div>
          {/* Right side empty for now */}
        </div>

        {/* Placeholder content */}
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-3xl p-12 text-center shadow-2xl min-h-[60vh] flex flex-col items-center justify-center">
          <h2 className="text-3xl font-bold text-white mb-4">Coming Soon</h2>
          <p className="text-xl text-zinc-400 mb-8 max-w-2xl">Nest Tool will enable intelligent sheet nesting, part placement optimization, and waste minimization integrated with projects.</p>
          <div className="bg-gradient-to-r from-cyan-600/20 to-cyan-700/20 border border-cyan-500/30 rounded-3xl p-8 shadow-[0_15px_35px_rgba(14,165,233,0.2)]">
            <p className="text-2xl font-mono text-cyan-400 mb-2">Sheets • Parts • Optimization</p>
            <p className="text-lg text-cyan-300">Max Utilization = Min Waste = Max Profit</p>
          </div>
        </div>
      </div>
    </div>
  );
}
