/*
keystone-pms/app/projects/[id]/page.tsx
*/

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

type Project = any;

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const fetchProject = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) console.error(error);
    else setProject(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

  // LIVE P&L FORMULAS (exact match to your Excel)
  const pl = project ? 
    ((project.invoiced_amount || 0) - 
     ((project.material_cost || 0) + 
      (project.labor_cost || 0) + 
      (project.engineering_cost || 0) + 
      (project.equipment_cost || 0) + 
      (project.logistics_cost || 0) + 
      (project.additional_costs || 0))) : 0;

  const plMargin = project && (project.invoiced_amount || 0) > 0 
    ? Math.round((pl / (project.invoiced_amount || 0)) * 100) 
    : 0;

  const estimatedPl = project ? 
    ((project.total_quoted || 0) - 
     ((project.materials_quoted || 0) + 
      (project.labor_quoted || 0) + 
      (project.engineering_quoted || 0) + 
      (project.equipment_quoted || 0) + 
      (project.logistics_quoted || 0) + 
      (project.taxes_quoted || 0))) : 0;

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    const { error } = await supabase
      .from('projects')
      .update(project)
      .eq('id', id);
    if (!error) {
      alert('✅ Saved – realtime update sent to all 4 users');
      fetchProject(); // refresh live formulas
    }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => {
    setProject(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) return <div className="p-10 text-center text-xl">Loading project details…</div>;
  if (!project) return <div className="p-10 text-center text-xl">Project not found</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/projects" className="flex items-center gap-2 text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" /> Back to All Projects
        </Link>
        <h1 className="text-4xl font-bold tracking-tight flex-1">
          {project.project_number} – {project.project_name?.toUpperCase()}
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-2xl font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <Save className="w-5 h-5" /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT – Core Info */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-xl font-semibold mb-6">Project Info</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">CUSTOMER</label>
                <input
                  value={project.customer || ''}
                  onChange={e => updateField('customer', e.target.value.toUpperCase())}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-lg uppercase"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">PROJECT NAME</label>
                <input
                  value={project.project_name || ''}
                  onChange={e => updateField('project_name', e.target.value.toUpperCase())}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-lg uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">CUSTOMER PO #</label>
                  <input value={project.customer_po || ''} onChange={e => updateField('customer_po', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">APPROVAL</label>
                  <select value={project.customer_approval || 'PENDING'} onChange={e => updateField('customer_approval', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3">
                    <option value="PENDING">PENDING</option>
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT – LIVE P&L + Costs (exact Excel mirror) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-8">
          <h2 className="text-xl font-semibold">Live P&amp;L (updates instantly)</h2>

          <div className="grid grid-cols-2 gap-6 text-lg">
            <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-700">
              <div className="text-zinc-500 text-sm">INVOICED AMOUNT</div>
              <input
                type="number"
                value={project.invoiced_amount || 0}
                onChange={e => updateField('invoiced_amount', parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent text-4xl font-mono font-bold mt-2 focus:outline-none"
              />
            </div>
            <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-700">
              <div className="text-zinc-500 text-sm">TOTAL COSTS</div>
              <div className="text-4xl font-mono font-bold mt-2 text-red-400">
                ${((project.material_cost||0)+(project.labor_cost||0)+(project.engineering_cost||0)+(project.equipment_cost||0)+(project.logistics_cost||0)+(project.additional_costs||0)).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="bg-emerald-950 border border-emerald-800 rounded-3xl p-8">
            <div className="text-emerald-400 text-sm font-medium">P&amp;L</div>
            <div className="text-6xl font-mono font-bold mt-2 text-emerald-300">${pl.toLocaleString()}</div>
            <div className="text-emerald-400 text-2xl mt-1">{plMargin}% MARGIN</div>
          </div>

          {/* Full cost breakdown – editable */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {['material_cost','labor_cost','engineering_cost','equipment_cost','logistics_cost','additional_costs'].map(field => (
              <div key={field}>
                <label className="text-zinc-500 block mb-1 capitalize">{field.replace('_',' ')}</label>
                <input
                  type="number"
                  value={project[field] || 0}
                  onChange={e => updateField(field, parseFloat(e.target.value) || 0)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* View / Edit folder link */}
      <div className="mt-12 text-center">
        <a
          href={`https://onedrive.live.com/?id=ROOT&cid=...&folder=Documents%2F0%20PROJECT%20FOLDERS%2F${project.customer}%2F${project.project_number}%20-%20${project.project_name}`} 
          target="_blank"
          className="text-blue-400 hover:underline"
        >
          Open this job’s folder in OneDrive (Documents/0 PROJECT FOLDERS)
        </a>
      </div>
    </div>
  );
}