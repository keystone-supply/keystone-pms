'use client';

import { useSession } from "next-auth/react";
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Trash2, Users } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type MaterialKey = 'al' | 'cs' | 'ss';

type ShapeValue = 'round' | 'square' | 'tube';

type CostKey = 'mild' | 'ar500' | 'viking' | 'aluminum' | '304ss';

interface MaterialInfo {
  name: string;
  density: number;
}

interface Shape {
  value: ShapeValue;
  label: string;
  dimLabel1: string;
  dimLabel2: string | null;
  hasDim2: boolean;
}

interface TapeItem {
  id: string;
  material: MaterialKey;
  materialName: string;
  density: number;
  shape: ShapeValue;
  lengthIn: number;
  dim1: number;
  dim2: number;
  thickness: number;
  costPerLb: number;
  quantity: number;
}

export default function WeightCalcPage() {
  const { data: session } = useSession();

  const materialDensities: Record<MaterialKey, MaterialInfo> = {
    al: { name: 'Aluminum 6061', density: 0.098 },
    cs: { name: 'Carbon Steel A36', density: 0.284 },
    ss: { name: 'AR500-Viking-Stainless Steel', density: 0.295 },
  };

  const shapes: Shape[] = [
    { value: 'round', label: 'Solid Round', dimLabel1: 'Diameter (in)', dimLabel2: null, hasDim2: false },
    { value: 'square', label: 'Rectangle / Plate', dimLabel1: 'Width (in)', dimLabel2: 'Thickness (in)', hasDim2: true },
    { value: 'tube', label: 'Hollow Tube', dimLabel1: 'OD (in)', dimLabel2: 'Wall Thickness (in)', hasDim2: true },
  ];

  const costs: Record<CostKey, number> = {
    mild: 0.65,
    ar500: 1.75,
    viking: 3.10,
    aluminum: 6.00,
    '304ss': 3.50,
  };

  const materialOrder: Record<MaterialKey, number> = {
    cs: 0,
    ss: 1,
    al: 2,
  };

  const [material, setMaterial] = useState<MaterialKey>('cs');
  const [shape, setShape] = useState<ShapeValue>('round');
  const [lengthIn, setLengthIn] = useState<number>(96);
  const [dim1, setDim1] = useState(1);
  const [dim2, setDim2] = useState(0.25);

  const [cost, setCost] = useState<CostKey>('mild');

  const [tapeItems, setTapeItems] = useState<TapeItem[]>([]);

  const currentShape = shapes.find((s) => s.value === shape);

  const computeArea = useCallback((shapeVal: ShapeValue, d1: number, d2: number): number => {
    let a = 0;
    if (shapeVal === 'round') {
      const radius = d1 / 2;
      a = Math.PI * radius * radius;
    } else if (shapeVal === 'square') {
      a = d1 * d2;
    } else if (shapeVal === 'tube') {
      const odRadius = d1 / 2;
      const wallThickness = d2;
      const innerDia = d1 - 2 * wallThickness;
      if (innerDia > 0) {
        const idRadius = innerDia / 2;
        a = Math.PI * (odRadius * odRadius - idRadius * idRadius);
      }
    }
    return a;
  }, []);

  const area = computeArea(shape, dim1, currentShape?.hasDim2 ? dim2 : 0);
  const density = materialDensities[material]?.density || 0.284;
  const weight = density * area * lengthIn;
  const weightKg = weight * 0.453592;

  const computeUnitWeight = useCallback((item: TapeItem): number => {
    const a = computeArea(item.shape, item.dim1, item.dim2);
    return item.density * a * item.lengthIn;
  }, [computeArea]);

  const costPerLb = costs[cost] || 0.65;
  const totalCost = weight * costPerLb;

  const getItemTotals = useCallback((item: TapeItem) => {
    const unitWeight = computeUnitWeight(item);
    const unitCost = unitWeight * item.costPerLb;
    const totalWeight = unitWeight * item.quantity;
    const totalCost = unitCost * item.quantity;
    return { unitWeight, unitCost, totalWeight, totalCost };
  }, [computeUnitWeight]);

  const formattedWeight = (isNaN(weight) || weight === 0 ? 0 : weight).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  const formattedWeightKg = (isNaN(weightKg) ? 0 : weightKg).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  const formattedCost = (isNaN(totalCost) || totalCost === 0 ? 0 : totalCost).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  const saveToTape = useCallback(() => {
    const id = crypto.randomUUID();
    const materialInfo = materialDensities[material];
    const newItem: TapeItem = {
      id,
      material,
      materialName: materialInfo.name,
      density: materialInfo.density,
      shape,
      lengthIn,
      dim1,
      dim2,
      thickness: dim2,
      costPerLb: costs[cost],
      quantity: 1,
    };
    setTapeItems((prev) => [...prev, newItem]);
  }, [material, shape, lengthIn, dim1, dim2, cost]);

  const removeFromTape = useCallback((id: string) => {
    setTapeItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const sortedTapeItems = useMemo(() => {
    return [...tapeItems].sort((a, b) => {
      const orderA = materialOrder[a.material] ?? 999;
      const orderB = materialOrder[b.material] ?? 999;
      return orderA - orderB;
    });
  }, [tapeItems]);

  const grandTotalWeight = useMemo(() => {
    return sortedTapeItems.reduce((sum, item) => {
      const totals = getItemTotals(item);
      return sum + totals.totalWeight;
    }, 0);
  }, [sortedTapeItems, getItemTotals]);

  const grandTotalCost = useMemo(() => {
    return sortedTapeItems.reduce((sum, item) => {
      const totals = getItemTotals(item);
      return sum + totals.totalCost;
    }, 0);
  }, [sortedTapeItems, getItemTotals]);

  const formattedGrandWeight = (isNaN(grandTotalWeight) || grandTotalWeight === 0 ? '0.0' : grandTotalWeight).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const formattedGrandCost = (isNaN(grandTotalCost) || grandTotalCost === 0 ? '$0.00' : grandTotalCost).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
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
              <h1 className="text-4xl font-bold text-white tracking-tight mb-3">Weight Calculator</h1>
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
                <Users size={18} />
                <span className="truncate max-w-48">{session?.user?.name ?? "User"}</span>
              </div>
              <p className="text-zinc-600 text-lg text-center">Advanced material weight calculations</p>
            </div>
          </div>
          {/* Right side empty for now */}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
          <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700/50 rounded-3xl p-10 shadow-2xl">
            <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
              <span>⚖️</span>
              Material & Shape
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-zinc-300 font-medium mb-3 text-lg">Material Type</label>
                <select 
                  value={material} 
                  onChange={(e) => setMaterial(e.target.value as MaterialKey)} 
                  className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/70 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {Object.entries(materialDensities).map(([key, mat]) => (
                    <option key={key} value={key}>
                      {mat.name} ({mat.density.toFixed(3)} lb/in³)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-300 font-medium mb-3 text-lg">Shape</label>
                <select 
                  value={shape} 
                  onChange={(e) => setShape(e.target.value as ShapeValue)} 
                  className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/70 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {shapes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-3 text-lg">Cost per Pound</label>
                <select 
                  value={cost} 
                  onChange={(e) => setCost(e.target.value as CostKey)} 
                  className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/70 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  <option value="mild">Mild - $0.65</option>
                  <option value="ar500">AR500 - $1.75</option>
                  <option value="viking">Viking - $3.10</option>
                  <option value="aluminum">Aluminum - $6.00</option>
                  <option value="304ss">304ss - $3.50</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-8">
            <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700/50 rounded-3xl p-10 shadow-2xl relative">
            <h2 className="text-3xl font-bold text-white mb-8">Dimensions</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-zinc-300 font-medium mb-3 text-lg">Length (inches)</label>
                <input 
                  type="number" 
                  step="any" 
                  min="0"
                  value={lengthIn} 
                  onChange={(e) => setLengthIn(+e.target.value || 0)}
                  className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                  placeholder="e.g. 144"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-zinc-300 font-medium mb-3 text-lg">{currentShape?.dimLabel1 ?? 'Dimension 1 (in)'}</label>
                  <input 
                    type="number" 
                    step="0.001" 
                    min="0"
                    value={dim1} 
                    onChange={(e) => setDim1(+e.target.value || 0)}
                    className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                    placeholder="e.g. 2.0"
                  />
                </div>
                {currentShape?.hasDim2 && (
                  <div>
                    <label className="block text-zinc-300 font-medium mb-3 text-lg">{currentShape!.dimLabel2!}</label>
                    <input 
                      type="number" 
                      step="0.001" 
                      min="0"
                      value={dim2} 
                      onChange={(e) => setDim2(+e.target.value || 0)}
                      className="w-full bg-zinc-800/50 border border-zinc-600/50 hover:border-zinc-500/70 focus:border-blue-500/70 focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-2xl px-5 py-4 text-xl font-medium text-white transition-all duration-300 shadow-lg hover:shadow-xl"
                      placeholder="e.g. 0.125"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-12 pt-10 border-t border-zinc-800">
              <h3 className="text-2xl font-bold text-white mb-6">Weight & Cost</h3>
              <div className="grid grid-cols-2 gap-12">
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-zinc-400 mb-1 tracking-tight">Weight (lbs)</div>
                  <div className="text-5xl font-mono font-bold bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent mb-2 shadow-2xl">
                    {formattedWeight}
                  </div>
                  <p className="text-zinc-400 text-lg">({formattedWeightKg} kg)</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold text-zinc-400 mb-1 tracking-tight">Est. Cost</div>
                  <div className="text-5xl font-mono font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent mb-2 shadow-2xl">
                    {formattedCost}
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={saveToTape}
              className="group absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/95 backdrop-blur-sm hover:bg-zinc-900 border border-blue-900/50 rounded-2xl px-6 py-3 font-medium text-white text-sm shadow-[0_20px_40px_-10px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_30px_50px_-12px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-1 hover:scale-[1.05] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden"
            >
              Save to Tape
            </button>
          </div>

            <div className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700/50 rounded-3xl p-10 shadow-2xl">
              <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
                <span>📋</span>Tape
              </h2>
              {tapeItems.length === 0 ? (
                <p className="text-zinc-500 text-xl text-center py-20">No items in tape yet. Use &quot;Save to Tape&quot; to add items.</p>
              ) : (
                <>
                  <div className="rounded-2xl border border-zinc-700/50 overflow-hidden shadow-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-36 font-medium">Material</TableHead>
                          <TableHead className="w-28">Shape</TableHead>
                          <TableHead className="font-mono">Dimensions</TableHead>
                          <TableHead className="w-14 text-right">Qty</TableHead>
                          <TableHead className="w-28 text-right font-mono">Weight (lbs)</TableHead>
                          <TableHead className="w-28 text-right font-mono">Total Cost</TableHead>
                          <TableHead className="w-16" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTapeItems.map((item) => {
                          const totals = getItemTotals(item);
                          const shapeInfo = shapes.find((s) => s.value === item.shape);
                          const dimDisplay = `${item.lengthIn}" × ${item.dim1.toFixed(2)}" × ${item.thickness.toFixed(3)}"`;
                          return (
                            <TableRow key={item.id} className="group hover:bg-zinc-800/50">
                              <TableCell className="font-medium text-white/90 group-hover:text-white">{item.materialName}</TableCell>
                              <TableCell>{shapeInfo?.label ?? item.shape}</TableCell>
                              <TableCell className="font-mono text-sm opacity-90">{dimDisplay}</TableCell>
                              <TableCell className="text-right font-mono text-lg">{item.quantity}</TableCell>
                              <TableCell className="text-right font-mono font-semibold text-emerald-400 text-lg">{totals.totalWeight.toLocaleString('en-US', { maximumFractionDigits: 1 })}</TableCell>
                              <TableCell className="text-right font-mono font-semibold text-amber-400">${totals.totalCost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell>
                              <TableCell>
                                <button
                                  onClick={() => removeFromTape(item.id)}
                                  className="group-hover:opacity-100 opacity-70 p-2 -ml-2 rounded-xl hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 flex items-center justify-center hover:scale-110"
                                  title="Delete from tape"
                                >
                                  <Trash2 size={18} strokeWidth={2} />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {sortedTapeItems.length > 0 && (
                    <div className="mt-8 pt-8 border-t border-zinc-600/50 bg-gradient-to-r from-zinc-900/80 to-zinc-900/40 backdrop-blur-sm rounded-3xl p-8 shadow-2xl">
                      <div className="flex justify-between items-baseline mb-4">
                        <div className="text-2xl font-bold text-zinc-300">Tape Summary</div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-right">
                        <div>
                          <div className="text-xl text-zinc-400 mb-2">Total Weight</div>
                          <div className="text-4xl font-mono font-bold bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent shadow-2xl">
                            {formattedGrandWeight} lbs
                          </div>
                        </div>
                        <div>
                          <div className="text-xl text-zinc-400 mb-2">Estimated Total Cost</div>
                          <div className="text-5xl font-mono font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent shadow-2xl tracking-tight">
                            {formattedGrandCost}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}