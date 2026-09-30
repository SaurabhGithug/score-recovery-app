"use client";

import React, { useState } from "react";
import { useLang } from "@/lib/i18n";

interface UsefulDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UsefulDataModal({ isOpen, onClose }: UsefulDataModalProps) {
  const { t } = useLang();
  const [activeTable, setActiveTable] = useState<"is456" | "steam">("is456");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-300">
        {/* Modal Header per SSC Notice Para 13.11 */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-blue-400" />
            <h2 className="text-sm font-bold tracking-wide">
              {t({ en: "CBT Console — Useful Data Reference (Para 13.11)", hi: "सीबीटी कंसोल — उपयोगी डेटा संदर्भ (पैरा 13.11)" })}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition"
          >
            {t({ en: "Close [X]", hi: "बंद करें [X]" })}
          </button>
        </div>

        {/* Table Selector Subheader */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTable("is456")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTable === "is456"
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
              }`}
            >
              IS 456:2000 Code of Practice
            </button>
            <button
              onClick={() => setActiveTable("steam")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                activeTable === "steam"
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
              }`}
            >
              Steam Tables (Saturated Steam Properties)
            </button>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            Active throughout examination console
          </span>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-5 text-slate-800 text-xs leading-relaxed space-y-5">
          {activeTable === "is456" && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2 font-bold text-slate-900 border-b border-slate-200">
                  Table 1: Concrete Grade & Characteristic Strength (Clause 6.1 & 6.2)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left divide-y divide-slate-200 text-[11px]">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Grade</th>
                        <th className="p-2.5">Specified Char. Strength fck (N/mm²)</th>
                        <th className="p-2.5">Modulus of Elasticity Ec (N/mm²)</th>
                        <th className="p-2.5">Flexural Tensile Strength fcr = 0.7√fck</th>
                        <th className="p-2.5">Permissible σcbc (N/mm²)</th>
                        <th className="p-2.5">Modular Ratio m = 280/(3σcbc)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">M15</td>
                        <td className="p-2.5">15</td>
                        <td className="p-2.5">19,365</td>
                        <td className="p-2.5">2.71</td>
                        <td className="p-2.5">5.0</td>
                        <td className="p-2.5">18.67</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">M20</td>
                        <td className="p-2.5">20</td>
                        <td className="p-2.5">22,360</td>
                        <td className="p-2.5">3.13</td>
                        <td className="p-2.5">7.0</td>
                        <td className="p-2.5">13.33</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">M25</td>
                        <td className="p-2.5">25</td>
                        <td className="p-2.5">25,000</td>
                        <td className="p-2.5">3.50</td>
                        <td className="p-2.5">8.5</td>
                        <td className="p-2.5">10.98</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">M30</td>
                        <td className="p-2.5">30</td>
                        <td className="p-2.5">27,386</td>
                        <td className="p-2.5">3.83</td>
                        <td className="p-2.5">10.0</td>
                        <td className="p-2.5">9.33</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">M35</td>
                        <td className="p-2.5">35</td>
                        <td className="p-2.5">29,580</td>
                        <td className="p-2.5">4.14</td>
                        <td className="p-2.5">11.5</td>
                        <td className="p-2.5">8.12</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">M40</td>
                        <td className="p-2.5">40</td>
                        <td className="p-2.5">31,623</td>
                        <td className="p-2.5">4.43</td>
                        <td className="p-2.5">13.0</td>
                        <td className="p-2.5">7.18</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 shadow-2xs space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Limiting Neutral Axis Depth (xu,max / d)</h4>
                  <ul className="space-y-1 text-slate-700">
                    <li>• Fe 250 (Mild steel): <strong>0.53 d</strong></li>
                    <li>• Fe 415 (HYSD): <strong>0.48 d</strong></li>
                    <li>• Fe 500 (HYSD): <strong>0.46 d</strong></li>
                    <li>• Fe 550: <strong>0.44 d</strong></li>
                  </ul>
                  <p className="text-[10px] text-slate-500 pt-1">
                    Formula: xu,max / d = 700 / (1100 + 0.87 fy)
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 shadow-2xs space-y-2">
                  <h4 className="font-bold text-slate-900 text-xs">Minimum Nominal Cover (Clause 26.4.1)</h4>
                  <ul className="space-y-1 text-slate-700">
                    <li>• Slabs: <strong>20 mm</strong></li>
                    <li>• Beams: <strong>25 mm</strong></li>
                    <li>• Columns: <strong>40 mm</strong> (or bar diameter if &gt; 40mm)</li>
                    <li>• Footings (Foundation): <strong>50 mm</strong></li>
                  </ul>
                  <p className="text-[10px] text-slate-500 pt-1">
                    Partial safety factor: Concrete γc = 1.5, Steel γs = 1.15
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTable === "steam" && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2 font-bold text-slate-900 border-b border-slate-200">
                  Properties of Saturated Water and Steam (Pressure Basis)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left divide-y divide-slate-200 text-[11px]">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">P (bar)</th>
                        <th className="p-2.5">Tsat (°C)</th>
                        <th className="p-2.5">vf (m³/kg)</th>
                        <th className="p-2.5">vg (m³/kg)</th>
                        <th className="p-2.5">hf (kJ/kg)</th>
                        <th className="p-2.5">hfg (kJ/kg)</th>
                        <th className="p-2.5">hg (kJ/kg)</th>
                        <th className="p-2.5">sf (kJ/kg·K)</th>
                        <th className="p-2.5">sg (kJ/kg·K)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">1.0</td>
                        <td className="p-2.5">99.63</td>
                        <td className="p-2.5">0.001043</td>
                        <td className="p-2.5">1.694</td>
                        <td className="p-2.5">417.5</td>
                        <td className="p-2.5">2258.0</td>
                        <td className="p-2.5">2675.5</td>
                        <td className="p-2.5">1.303</td>
                        <td className="p-2.5">7.359</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">2.0</td>
                        <td className="p-2.5">120.23</td>
                        <td className="p-2.5">0.001061</td>
                        <td className="p-2.5">0.8857</td>
                        <td className="p-2.5">504.7</td>
                        <td className="p-2.5">2201.9</td>
                        <td className="p-2.5">2706.6</td>
                        <td className="p-2.5">1.530</td>
                        <td className="p-2.5">7.127</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">5.0</td>
                        <td className="p-2.5">151.86</td>
                        <td className="p-2.5">0.001093</td>
                        <td className="p-2.5">0.3749</td>
                        <td className="p-2.5">640.2</td>
                        <td className="p-2.5">2108.5</td>
                        <td className="p-2.5">2748.7</td>
                        <td className="p-2.5">1.860</td>
                        <td className="p-2.5">6.822</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">10.0</td>
                        <td className="p-2.5">179.91</td>
                        <td className="p-2.5">0.001127</td>
                        <td className="p-2.5">0.1944</td>
                        <td className="p-2.5">762.8</td>
                        <td className="p-2.5">2015.3</td>
                        <td className="p-2.5">2778.1</td>
                        <td className="p-2.5">2.138</td>
                        <td className="p-2.5">6.586</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold text-blue-900">20.0</td>
                        <td className="p-2.5">212.42</td>
                        <td className="p-2.5">0.001177</td>
                        <td className="p-2.5">0.0996</td>
                        <td className="p-2.5">908.8</td>
                        <td className="p-2.5">1890.7</td>
                        <td className="p-2.5">2799.5</td>
                        <td className="p-2.5">2.447</td>
                        <td className="p-2.5">6.340</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 font-bold text-blue-900">50.0</td>
                        <td className="p-2.5">263.99</td>
                        <td className="p-2.5">0.001286</td>
                        <td className="p-2.5">0.0394</td>
                        <td className="p-2.5">1154.2</td>
                        <td className="p-2.5">1640.1</td>
                        <td className="p-2.5">2794.3</td>
                        <td className="p-2.5">2.920</td>
                        <td className="p-2.5">5.973</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 shadow-2xs space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">Essential Thermodynamic Relations</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-700">
                  <div>
                    <p>• Wet Steam Enthalpy: <strong>h = hf + x · hfg</strong></p>
                    <p>• Wet Steam Entropy: <strong>s = sf + x · sfg</strong></p>
                  </div>
                  <div>
                    <p>• Superheated Enthalpy: <strong>h = hg + Cpv(Tsup - Tsat)</strong></p>
                    <p>• Dryness Fraction: <strong>x = (h - hf) / hfg</strong></p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
          <span>Click Close or [X] to return to the question console</span>
          <button
            onClick={onClose}
            className="rounded bg-slate-800 px-4 py-1.5 font-semibold text-white hover:bg-slate-700"
          >
            {t({ en: "Close Table", hi: "तालिका बंद करें" })}
          </button>
        </div>
      </div>
    </div>
  );
}
