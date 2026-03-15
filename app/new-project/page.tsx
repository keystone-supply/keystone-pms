/*
keystone-pms/app/new-project/page.tsx
*/

"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";

// === YOUR EXACT GRAPH CODE ===
export async function createProjectFolders(
  accessToken: string,
  customer: string,
  projectNumber: string,
  projectName: string,
) {
  const customerUpper = customer
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
  const projectUpper = projectName
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
  const folderName = `${projectNumber} - ${projectUpper}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const baseSegments = ["0 PROJECT FOLDERS", customerUpper, folderName];
  let currentPath = "Documents";
  for (const segment of baseSegments) {
    currentPath += "/" + segment;
    await ensureFolder(headers, currentPath);
  }
  const subfolders = [
    `${projectNumber}_CAD`,
    `${projectNumber}_VENDORS`,
    `${projectNumber}_PICS`,
    `${projectNumber}_DOCS`,
    `${projectNumber}_MACHINING`,
    `${projectNumber}_G-CODE`,
  ];
  for (const sub of subfolders)
    await ensureFolder(headers, `${currentPath}/${sub}`);
  console.log("✅ Folders created successfully in Documents");
  return `Documents/0 PROJECT FOLDERS/${customerUpper}/${folderName}`;
}
async function ensureFolder(headers: any, fullPath: string) {
  const parts = fullPath.split("/");
  const parentPath = parts.slice(0, -1).join("/") || "";
  const name = parts[parts.length - 1];
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(parentPath)}:/children`;
  const body = JSON.stringify({ name, folder: {} });
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text().catch(() => "no body");
  if (!res.ok && res.status !== 409)
    throw new Error(`Failed for "${name}": ${res.status} ${text}`);
  return res.status === 409 ? "already exists" : "created";
}

export default function NewProject() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [form, setForm] = useState({
    customer: "",
    project_name: "",
    customer_po: "",
    supply_industrial: "SUPPLY",
  });

  const [nextJob, setNextJob] = useState("");

  useEffect(() => {
    const getNextJob = async () => {
      const { data } = await supabase
        .from("projects")
        .select("project_number")
        .order("project_number", { ascending: false })
        .limit(1);
      const last = data?.[0]?.project_number
        ? parseInt(data[0].project_number)
        : 101350;
      setNextJob((last + 1).toString());
    };
    getNextJob();
  }, []);

  // Token fetched fresh at submit time (handles expiry)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newProject = {
        project_number: nextJob,
        customer: form.customer.toUpperCase(),
        project_name: form.project_name.toUpperCase(),
        customer_po: form.customer_po,
        supply_industrial: form.supply_industrial,
        customer_approval: "PENDING",
        project_complete: false,
        material_cost: 0,
        labor_cost: 0,
        engineering_cost: 0,
        equipment_cost: 0,
        logistics_cost: 0,
        additional_costs: 0,
        invoiced_amount: 0,
      };
      const { data: saved, error } = await supabase
        .from("projects")
        .insert(newProject)
        .select()
        .single();
      if (error) throw error;

      // Fetch FRESH token right before folder creation (triggers server-side refresh)
      const freshSessionRes = await fetch("/api/auth/session");
      const freshSession = await freshSessionRes.json();
      const freshToken = freshSession?.accessToken;
      console.log("Fresh token length:", freshToken?.length || 0);
      if (freshToken) {
        await createProjectFolders(
          freshToken,
          form.customer,
          nextJob,
          form.project_name,
        );
      } else {
        console.error("❌ No fresh token - re-login required");
      }

      alert(
        `✅ Job ${nextJob} created! Folders in Documents/0 PROJECT FOLDERS`,
      );
      router.push(`/projects/${saved.id}`);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-10">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <h1 className="text-4xl font-bold tracking-tight">New Project</h1>
      </div>
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 space-y-8"
      >
        <div>
          <label className="text-xs text-zinc-500 block mb-2">
            PROJECT # (auto)
          </label>
          <div className="font-mono text-5xl font-bold text-emerald-400">
            {nextJob}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="text-xs text-zinc-500 block mb-2">CUSTOMER</label>
            <input
              required
              value={form.customer}
              onChange={(e) => setForm({ ...form, customer: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 text-lg uppercase"
              placeholder="TEST INC"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-2">
              PROJECT NAME
            </label>
            <input
              required
              value={form.project_name}
              onChange={(e) =>
                setForm({ ...form, project_name: e.target.value })
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 text-lg uppercase"
              placeholder="TEST JOB"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="text-xs text-zinc-500 block mb-2">
              CUSTOMER PO #
            </label>
            <input
              value={form.customer_po}
              onChange={(e) =>
                setForm({ ...form, customer_po: e.target.value })
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-2">
              SUPPLY / INDUSTRIAL
            </label>
            <select
              value={form.supply_industrial}
              onChange={(e) =>
                setForm({ ...form, supply_industrial: e.target.value })
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4"
            >
              <option value="SUPPLY">SUPPLY</option>
              <option value="INDUSTRIAL">INDUSTRIAL</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black hover:bg-zinc-800 text-white py-5 rounded-3xl font-medium text-xl flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <Save className="w-6 h-6" />{" "}
          {loading ? "Creating..." : "Create Job + Folders"}
        </button>
      </form>
    </div>
  );
}
