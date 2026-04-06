"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  getCommandBoardTVSummary,
  type CommandBoardTVSummary,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";

export default function TVStaticPage() {
  const [summary, setSummary] = useState<CommandBoardTVSummary>(() =>
    getCommandBoardTVSummary([]),
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .order("updated_at", { ascending: false });

      if (fetchError) {
        console.error("Projects fetch error:", fetchError);
        setError(fetchError.message);
        return;
      }

      const rows = (data ?? []) as DashboardProjectRow[];
      const tvSummary = getCommandBoardTVSummary(rows);
      setSummary(tvSummary);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Unexpected error fetching projects:", err);
      setError("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProjects();

    const channel = supabase
      .channel("tv-static-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
        },
        () => {
          fetchProjects();
        },
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchProjects();
      }
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchProjects]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchProjects();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchProjects]);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "#111",
        color: "#fff",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        fontSize: "24px"
      }}>
        Loading Shop TV...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: "#111",
        color: "#fff",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        textAlign: "center",
        padding: "40px"
      }}>
        <div>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>⚠️</div>
          <h2 style={{ fontSize: "32px", marginBottom: "16px" }}>Connection Issue</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const formatCount = (n: number) => n.toLocaleString();

  return (
    <div style={{
      backgroundColor: "#111",
      color: "#fff",
      minHeight: "100vh",
      fontFamily: "sans-serif",
      padding: "30px",
      boxSizing: "border-box"
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "2px solid #333",
        paddingBottom: "20px",
        marginBottom: "30px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{
            width: "60px",
            height: "60px",
            backgroundColor: "#1a3c2e",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px"
          }}>
            📊
          </div>
          <div>
            <div style={{ fontSize: "13px", color: "#0a0", letterSpacing: "2px" }}>
              KEYSTONE SUPPLY
            </div>
            <h1 style={{ fontSize: "42px", fontWeight: "bold", margin: "4px 0 0 0" }}>
              SHOP FLOOR TV
            </h1>
            <p style={{ color: "#888", margin: "0" }}>Live Project Status</p>
          </div>
        </div>

        <div style={{
          backgroundColor: "#1a1a1a",
          padding: "8px 20px",
          borderRadius: "9999px",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          border: "1px solid #0a0"
        }}>
          <div style={{
            width: "10px",
            height: "10px",
            backgroundColor: "#0a0",
            borderRadius: "50%",
            animation: "pulse 2s infinite"
          }}></div>
          LIVE
        </div>
      </div>

      {/* Needs Attention - Prioritized for shop floor visibility */}
      {summary.recentAttention.length > 0 && (
        <div style={{
          backgroundColor: "#2a1f0f",
          border: "2px solid #d97706",
          borderRadius: "16px",
          padding: "28px",
          marginBottom: "40px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div style={{ fontSize: "28px" }}>⚠️</div>
            <h3 style={{ fontSize: "26px", color: "#fcd34d", margin: 0 }}>Needs Attention</h3>
          </div>
          
          <div style={{ display: "grid", gap: "16px" }}>
            {summary.recentAttention.map((item) => (
              <div key={item.id} style={{
                backgroundColor: "#1f1608",
                padding: "16px 20px",
                borderRadius: "12px",
                borderLeft: "4px solid #d97706"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontFamily: "monospace", color: "#fcd34d" }}>#{item.project_number}</span>
                    <span style={{ marginLeft: "12px", color: "#ddd" }}>{item.project_name}</span>
                  </div>
                  <div style={{ color: "#fcd34d", fontSize: "15px" }}>
                    {item.reason}
                  </div>
                </div>
                <div style={{ color: "#888", fontSize: "14px", marginTop: "4px" }}>
                  {item.customer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main KPI Cards - Moved to bottom of main content for attention priority */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        {/* Active Jobs */}
        <div style={{
          backgroundColor: "#1a1a1a",
          border: "2px solid #444",
          borderRadius: "16px",
          padding: "24px 20px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "16px", color: "#888", marginBottom: "8px", letterSpacing: "1px" }}>
            ACTIVE JOBS
          </div>
          <div style={{ fontSize: "56px", fontWeight: "bold", color: "#fff", lineHeight: "1" }}>
            {formatCount(summary.activeProjects)}
          </div>
          <div style={{ fontSize: "14px", color: "#666", marginTop: "6px" }}>
            Total in pipeline
          </div>
        </div>

        {/* In Process */}
        <div style={{
          backgroundColor: "#1a1a1a",
          border: "2px solid #0a3",
          borderRadius: "16px",
          padding: "24px 20px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "16px", color: "#0a3", marginBottom: "8px", letterSpacing: "1px" }}>
            IN PROCESS
          </div>
          <div style={{ fontSize: "56px", fontWeight: "bold", color: "#0a3", lineHeight: "1" }}>
            {formatCount(summary.inProcessCount)}
          </div>
          <div style={{ fontSize: "14px", color: "#666", marginTop: "6px" }}>
            Jobs in shop / fabrication
          </div>
        </div>
      </div>

      {/* Network Guide */}
      <div style={{
        backgroundColor: "#1a1a1a",
        border: "2px solid #0066cc",
        borderRadius: "16px",
        padding: "28px",
        fontSize: "15px"
      }}>
        <h3 style={{ color: "#60a5fa", marginBottom: "16px", fontSize: "22px" }}>
          How to Access from Shop TV
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          <div>
            <div style={{ color: "#666", marginBottom: "8px" }}>1. Start TV Server</div>
            <div style={{
              backgroundColor: "#111",
              padding: "14px",
              borderRadius: "8px",
              fontFamily: "monospace",
              color: "#4ade80",
              border: "1px solid #14532d"
            }}>
              npm run dev:tv
            </div>
          </div>
          <div>
            <div style={{ color: "#666", marginBottom: "8px" }}>2. Find Laptop IP</div>
            <div style={{
              backgroundColor: "#111",
              padding: "14px",
              borderRadius: "8px",
              fontFamily: "monospace",
              color: "#fbbf24",
              border: "1px solid #451a03"
            }}>
              ipconfig
            </div>
            <div style={{ marginTop: "12px", color: "#888", fontSize: "13px" }}>
              Use the IPv4 address (e.g. 192.168.1.105)
            </div>
          </div>
        </div>
        
        <div style={{
          marginTop: "28px",
          padding: "20px",
          backgroundColor: "#0a1428",
          borderRadius: "12px",
          textAlign: "center",
          border: "1px solid #1e40af"
        }}>
          <div style={{ color: "#93c5fd", fontSize: "14px", marginBottom: "8px" }}>
            OPEN ON TV:
          </div>
          <div style={{
            fontFamily: "monospace",
            fontSize: "21px",
            color: "#fff",
            backgroundColor: "#020817",
            padding: "12px 24px",
            borderRadius: "8px",
            display: "inline-block"
          }}>
            http://YOUR-LAPTOP-IP:3000/tv-static
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: "fixed",
        bottom: "20px",
        right: "30px",
        color: "#555",
        fontSize: "13px",
        fontFamily: "monospace"
      }}>
        Updated {lastUpdated?.toLocaleTimeString()} • Keystone PMS
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
