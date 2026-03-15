"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Users,
  Package,
  Layers,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";

import { type Remnant, genMockSVG } from "@/lib/utils";

export default function NestRemnantsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"remnants" | "nest">("nest");

  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("keystone_remnants");
    if (saved) {
      setRemnants(JSON.parse(saved));
    } else {
      // Seed mocks
      setRemnants([
        {
          id: "#RMT001",
          dims: '96x48"',
          material: "A36 Steel",
          thickness_in: 0.25,
          est_weight_lbs: 125,
          status: "Available",
          svg_path: genMockSVG(96, 48),
        },
        {
          id: "#RMT002",
          dims: '48x96"',
          material: "304 SS",
          thickness_in: 0.125,
          est_weight_lbs: 89,
          status: "Available",
          svg_path: genMockSVG(48, 96),
        },
        {
          id: "#RMT003",
          dims: '120x60"',
          material: "A36 Steel",
          thickness_in: 0.375,
          est_weight_lbs: 210,
          status: "Allocated",
          svg_path: genMockSVG(120, 60),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("keystone_remnants", JSON.stringify(remnants));
  }, [remnants]);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent tracking-tight mb-3">
                NestNow
              </h1>
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
                <Users size={18} />
                <span className="truncate max-w-48">
                  {session?.user?.name ?? "User"}
                </span>
              </div>
              <p className="text-zinc-600 text-lg text-center">
                Track remnants • Optimize nesting • Minimize waste
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden mb-8">
          <div className="flex border-b border-zinc-700">
            <button
              onClick={() => setActiveTab("nest")}
              className={`flex-1 py-6 px-8 min-h-[4rem] border-b border-transparent font-bold text-lg transition-all ${
                activeTab === "nest"
                  ? "bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 border-cyan-400 text-cyan-100 shadow-lg"
                  : "text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-b-2 hover:border-cyan-400"
              }`}
            >
              <Layers className="inline w-6 h-6 mr-2" />
              Nest Tool
            </button>
            <button
              onClick={() => setActiveTab("remnants")}
              className={`flex-1 py-6 px-8 min-h-[4rem] border-b border-transparent font-bold text-lg transition-all ${
                activeTab === "remnants"
                  ? "bg-gradient-to-r from-purple-500/20 to-purple-600/20 border-purple-400 text-purple-100 shadow-lg"
                  : "text-zinc-400 hover:text-purple-300 hover:bg-purple-500/10 hover:border-b-2 hover:border-purple-400"
              }`}
            >
              <Package className="inline w-6 h-6 mr-2" />
              Remnants ({remnants.length})
            </button>
          </div>

          {/* Remnants Tab */}
          {activeTab === "remnants" && (
            <div className="p-8">
              <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 mb-8 shadow-xl">
                <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-end justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search remnants, materials, jobs..."
                      className="w-full pl-12 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-purple-500 transition-colors">
                      <Filter className="w-4 h-4" />
                      <span className="text-sm">Filter</span>
                    </div>
                    <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border border-purple-500/50 rounded-xl font-medium text-white shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 transition-all duration-300">
                      <Plus className="w-4 h-4" />
                      Add Remnant
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {remnants.map((remnant, i) => (
                  <div
                    key={i}
                    className="group relative bg-gradient-to-b from-zinc-800 to-zinc-900/50 border border-purple-800/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:shadow-purple-500/25 hover:-translate-y-2 hover:border-purple-600/70 transition-all duration-500 overflow-hidden will-change-transform"
                  >
                    <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-gradient-to-r from-purple-400/0 via-purple-400/30 to-purple-400/0 animate-spin-slow opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/2 to-transparent opacity-50 group-hover:opacity-100" />
                    <div className="relative z-10">
                      <h3 className="font-bold text-xl text-white mb-2 truncate">
                        {remnant.id}
                      </h3>
                      <p className="text-purple-400 font-mono text-sm mb-3">
                        {remnant.dims}
                      </p>
                      <div className="space-y-1 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Material:</span>{" "}
                          <span className="font-mono">{remnant.material}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Thickness:</span>{" "}
                          <span className="font-mono">
                            {remnant.thickness_in.toFixed(3)}"
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Weight:</span>{" "}
                          <span className="font-bold text-emerald-400">
                            {remnant.est_weight_lbs} lbs
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          remnant.status === "Available"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        } border`}
                      >
                        {remnant.status}
                      </span>
                      <div className="flex gap-2 mt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button className="flex-1 p-2 bg-purple-600/30 hover:bg-purple-500/50 border border-purple-500/40 rounded-xl text-purple-200 text-sm font-medium transition-all hover:scale-105">
                          <Edit className="w-4 h-4 mr-1" /> Edit
                        </button>
                        <button className="flex-1 p-2 bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 rounded-xl text-zinc-300 text-sm font-medium transition-all hover:scale-105">
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {remnants.length === 0 && (
                <div className="text-center py-20 text-zinc-500">
                  <Package className="w-20 h-20 mx-auto mb-4 text-zinc-600" />
                  <p>
                    No remnants yet.{" "}
                    <button className="text-purple-400 hover:text-purple-300 font-medium">
                      Add your first remnant
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Nest Tool Tab */}
          {activeTab === "nest" && (
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
              {/* Canvas Area */}
              <div className="bg-gradient-to-br from-zinc-900/70 to-zinc-950/50 backdrop-blur-sm border-2 border-cyan-800/50 rounded-3xl p-8 shadow-2xl flex flex-col shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all hover:border-cyan-600/70">
                <h3 className="text-2xl font-bold text-cyan-100 mb-6 flex items-center gap-3">
                  <Layers className="w-8 h-8" />
                  Nesting Canvas
                </h3>
                <div className="flex-1 bg-zinc-800/30 border-2 border-dashed border-cyan-700/50 rounded-2xl flex items-center justify-center shadow-inner">
                  <div className="text-center text-zinc-500">
                    <Zap className="w-16 h-16 mx-auto mb-4 text-cyan-500/50 animate-pulse" />
                    <p className="text-lg mb-2">Ready for nesting</p>
                    <p className="text-sm">
                      Drag parts, select remnants, or upload DXF
                    </p>
                  </div>
                </div>
              </div>

              {/* Controls Sidebar */}
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-cyan-600/20 to-cyan-700/20 border border-cyan-500/30 rounded-3xl p-6 shadow-xl">
                  <h4 className="font-bold text-xl text-cyan-100 mb-4">
                    Quick Actions
                  </h4>
                  <div className="space-y-3">
                    <button className="w-full flex items-center gap-3 p-4 bg-cyan-600/30 hover:bg-cyan-500/50 border border-cyan-500/40 rounded-2xl text-cyan-200 font-medium transition-all hover:scale-105 hover:shadow-cyan-500/25">
                      <Upload className="w-5 h-5" /> Upload DXF/Parts
                    </button>
                    <button className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-600/30 to-emerald-500/50 border border-emerald-500/40 rounded-2xl text-emerald-200 font-medium transition-all hover:scale-105 hover:shadow-emerald-500/25">
                      <Zap className="w-5 h-5" /> Generate Nest
                    </button>
                    <button className="w-full p-4 bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 rounded-2xl text-zinc-300 font-medium transition-all hover:scale-105">
                      Export Cuts (.DXF)
                    </button>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-3xl p-6 shadow-xl">
                  <h4 className="font-bold text-xl text-purple-100 mb-4">
                    Available Remnants
                  </h4>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {remnants.slice(0, 3).map((r, i) => (
                      <button
                        key={i}
                        className="w-full flex items-center gap-3 p-3 bg-purple-500/20 hover:bg-purple-400/30 border border-purple-500/30 rounded-xl text-purple-200 text-sm font-medium transition-all hover:scale-[1.02]"
                      >
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500/30 to-purple-600/30 rounded-lg flex items-center justify-center shadow-md">
                          {r.dims ? `${r.dims.split("x")[0]}x${r.dims.split("x")[1]}` : 'N/A'}
                        </div>
                        <span className="truncate">
                          {r.material} {r.thickness_in.toFixed(3)}"
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-emerald-400">245 lbs</div>
            <div className="text-zinc-500 mt-1">Total Remnants</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-purple-400">$1,240</div>
            <div className="text-zinc-500 mt-1">Est. Value</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-cyan-400">92%</div>
            <div className="text-zinc-500 mt-1">Avg Utilization</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-amber-400">4.2%</div>
            <div className="text-zinc-500 mt-1">Waste Saved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
