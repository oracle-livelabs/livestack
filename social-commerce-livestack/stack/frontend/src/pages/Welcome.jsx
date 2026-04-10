import {
  Zap, Database, TrendingUp, Network, MapPin, BrainCircuit,
  Package, ArrowRight, Sparkles, Globe, BarChart2, Shield,
  Server, Cpu, HardDrive, Cloud, Monitor, ArrowDown, ArrowLeftRight,
  Code2, Terminal, Wand2, MessageSquare, ChevronRight, Bot
} from 'lucide-react';

// ── Oracle capabilities badges ───────────────────────────────────────────────
const CAPABILITIES = [
  { label: 'Relational', icon: Database, color: '#1B84ED', desc: 'ACID transactions, referential integrity, analytic SQL' },
  { label: 'JSON', icon: Shield, color: '#D4760A', desc: 'Native JSON type, dot-notation queries, JSON_TABLE' },
  { label: 'Graph', icon: Network, color: '#7B48A5', desc: 'Property graphs, PGQL traversal, community detection' },
  { label: 'Vector', icon: Sparkles, color: '#1AADA8', desc: 'VECTOR_EMBEDDING, COSINE distance, ANN indexes' },
  { label: 'Spatial', icon: Globe, color: '#2D9F5E', desc: 'SDO_GEOMETRY, SDO_BUFFER, R-Tree spatial indexes' },
  { label: 'ML / AI', icon: BrainCircuit, color: '#D4549A', desc: 'ONNX models, REGR_SLOPE, NTILE, DBMS_DATA_MINING' },
  { label: 'AI Agents', icon: Bot, color: '#F59E0B', desc: 'Select AI, autonomous agents, natural language to SQL' },
];

// ── Main Welcome Page ────────────────────────────────────────────────────────
export default function Welcome({ onNavigate }) {
  return (
    <div className="space-y-8 fade-in max-w-[1800px] mx-auto px-6">

      {/* ── Hero Section ── */}
      <div className="text-center space-y-5 pt-4">
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-oracle)] flex items-center justify-center">
            <Zap size={15} className="text-white" />
          </div>
          <span className="text-sm font-semibold">Oracle AI Database 26ai — Converged Architecture Demo</span>
        </div>

        <h1 className="text-5xl font-extrabold tracking-tight leading-tight">
          One Database.{' '}
          <span className="bg-gradient-to-r from-[#C74634] via-[#D4760A] to-[#1AADA8] bg-clip-text text-transparent">
            Seven Capabilities.
          </span>
          <br />Zero Complexity.
        </h1>

        <p className="text-lg text-[var(--color-text-dim)] max-w-2xl mx-auto leading-relaxed">
          Most companies run <strong className="text-[var(--color-text)]">7+ separate systems</strong> for relational data,
          document stores, graph databases, vector search, spatial, ML platforms, and AI agents.
          Each one adds latency, sync failures, and operational burden.
        </p>
        <p className="text-lg text-[var(--color-text)] max-w-2xl mx-auto leading-relaxed font-medium">
          Oracle AI Database 26ai runs <span className="text-[var(--color-accent)]">all seven natively</span> — in a single engine,
          on the same data, with ACID guarantees across every query.
        </p>
      </div>

      {/* ── Three-Column: Architecture + Dev Toolchain + What This Solves ── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* ── LEFT: Live Architecture ── */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
            <Server size={20} className="text-[#1B84ED]" />
            Live Architecture
          </h2>

          <div className="flex flex-col items-center gap-0">

            {/* Tier 1: Browser Client */}
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-[var(--color-border)]/50 w-full max-w-md"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <Monitor size={20} className="text-[var(--color-text-dim)]" />
              <div>
                <p className="text-sm font-semibold">Browser Client</p>
                <p className="text-xs text-[var(--color-text-dim)]">React 18 · Vite · Recharts · Leaflet</p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center py-1.5">
              <div className="w-px h-4 bg-[var(--color-border)]" />
              <ArrowDown size={12} className="text-[var(--color-text-dim)] -mt-0.5" />
              <span className="text-[10px] text-[var(--color-text-dim)] mt-0.5">HTTPS · Port 3001</span>
            </div>

            {/* Tier 2: Compute Instance */}
            <div className="w-full max-w-md rounded-xl border border-[#1AADA8]/30 overflow-hidden"
              style={{ background: '#1AADA808' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ background: '#1AADA812', borderBottom: '1px solid rgba(26,173,168,0.15)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#1AADA822' }}>
                    <Cpu size={18} className="text-[#1AADA8]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1AADA8]">OCI Compute Instance</p>
                    <p className="text-[11px] text-[var(--color-text-dim)]">VM.Standard.A1.Flex — Oracle Linux 9</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-[#1AADA8]">4 OCPU</p>
                  <p className="text-[11px] text-[var(--color-text-dim)]">24 GB RAM</p>
                </div>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 gap-2.5">
                <div className="rounded-lg p-2.5 text-center border border-[var(--color-border)]/30"
                  style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <Server size={16} className="mx-auto text-[#D4760A] mb-1" />
                  <p className="text-xs font-semibold">Node.js 20</p>
                  <p className="text-[10px] text-[var(--color-text-dim)]">Express API</p>
                </div>
                <div className="rounded-lg p-2.5 text-center border border-[var(--color-border)]/30"
                  style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <Package size={16} className="mx-auto text-[#2D9F5E] mb-1" />
                  <p className="text-xs font-semibold">PM2</p>
                  <p className="text-[10px] text-[var(--color-text-dim)]">Process Mgr</p>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center py-1.5">
              <div className="w-px h-4 bg-[var(--color-border)]" />
              <ArrowDown size={12} className="text-[var(--color-text-dim)] -mt-0.5" />
              <span className="text-[10px] text-[var(--color-text-dim)] mt-0.5">Oracle Thin Driver · mTLS Wallet</span>
            </div>

            {/* Tier 3: Autonomous Database */}
            <div className="w-full max-w-md rounded-xl border border-[#C74634]/30 overflow-hidden"
              style={{ background: '#C7463408' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ background: '#C7463412', borderBottom: '1px solid rgba(199,70,52,0.15)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#C7463422' }}>
                    <Database size={18} className="text-[#C74634]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#C74634]">Autonomous Database</p>
                    <p className="text-[11px] text-[var(--color-text-dim)]">Oracle AI Database 26ai — Always Free</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-[#C74634]">4 ECPU</p>
                  <p className="text-[11px] text-[var(--color-text-dim)]">20 GB</p>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#1B84ED]">22 Tables</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">Relational</p>
                  </div>
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#D4760A]">JSON Duality</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">Doc Views</p>
                  </div>
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#1AADA8]">ONNX Model</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">Embeddings</p>
                  </div>
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#D4549A]">4 ML Models</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">DBMS_DATA_MINING</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#7B48A5]">Property Graph</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">PGQL · SQL/PGQ</p>
                  </div>
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#2D9F5E]">Spatial</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">SDO_GEOMETRY</p>
                  </div>
                  <div className="rounded-lg p-1.5 text-center border border-[var(--color-border)]/30"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[11px] font-semibold text-[#E87B1A]">Vector Search</p>
                    <p className="text-[9px] text-[var(--color-text-dim)]">384-dim ANN</p>
                  </div>
                </div>
              </div>
            </div>

            {/* OCI badge */}
            <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-border)]/30"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              <Cloud size={14} className="text-[var(--color-text-dim)]" />
              <span className="text-xs text-[var(--color-text-dim)]">
                Oracle Cloud Infrastructure — <span className="text-[var(--color-text)] font-medium">Ashburn, US-East</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: AI-Assisted Development + Capabilities ── */}
        <div className="flex flex-col gap-6">

          {/* AI-Assisted Development Toolchain */}
          <div className="glass-card p-6 relative overflow-hidden flex-1">
            {/* Subtle gradient background */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{ background: 'linear-gradient(135deg, #0078D4 0%, #E87B1A 50%, #C74634 100%)' }} />

            <div className="relative">
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0078D4, #1AADA8)' }}>
                  <Code2 size={17} className="text-white" />
                </div>
                AI-Assisted Development
              </h2>
              <p className="text-xs text-[var(--color-text-dim)] mb-5 ml-10">
                Built entirely with AI-powered tooling
              </p>

              {/* VSCode Hub */}
              <div className="flex items-center gap-4 mb-5">
                <div className="rounded-xl border-2 border-[#0078D4]/40 p-4 text-center relative flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #0078D410, #0078D406)' }}>
                  <div className="absolute inset-0 rounded-xl"
                    style={{ boxShadow: '0 0 30px rgba(0,120,212,0.12), inset 0 0 30px rgba(0,120,212,0.04)' }} />
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl mx-auto mb-2 flex items-center justify-center relative"
                      style={{ background: 'linear-gradient(135deg, #0078D4, #005BA4)' }}>
                      <Code2 size={28} className="text-white" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #1AADA8, #0E8E89)', border: '2px solid var(--color-bg)' }}>
                        <Sparkles size={10} className="text-white" />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#0078D4]">VS Code</p>
                    <p className="text-[10px] text-[var(--color-text-dim)]">Developer IDE</p>
                  </div>
                </div>

                {/* Connecting arrows */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="flex items-center">
                    <div className="w-8 h-px" style={{ background: 'linear-gradient(90deg, #0078D4, #E87B1A)' }} />
                    <ChevronRight size={10} className="text-[#E87B1A] -ml-1.5" />
                  </div>
                  <div className="flex items-center">
                    <div className="w-8 h-px" style={{ background: 'linear-gradient(90deg, #0078D4, #1AADA8)' }} />
                    <ChevronRight size={10} className="text-[#1AADA8] -ml-1.5" />
                  </div>
                  <div className="flex items-center">
                    <div className="w-8 h-px" style={{ background: 'linear-gradient(90deg, #0078D4, #D4549A)' }} />
                    <ChevronRight size={10} className="text-[#D4549A] -ml-1.5" />
                  </div>
                </div>

                {/* Tool stack */}
                <div className="flex-1 space-y-2.5">
                  {/* Oracle Code Assist */}
                  <div className="rounded-lg border border-[#E87B1A]/25 px-4 py-2.5 flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #E87B1A06, #E87B1A03)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #E87B1A, #C74634)' }}>
                      <Wand2 size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#E87B1A]">Oracle Code Assist</p>
                      <p className="text-[10px] text-[var(--color-text-dim)]">Context-aware · PL/SQL + JS · Oracle-optimized</p>
                    </div>
                  </div>

                  {/* SQLcl MCP */}
                  <div className="rounded-lg border border-[#1AADA8]/25 px-4 py-2.5 flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #1AADA806, #1AADA803)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #1AADA8, #0E8E89)' }}>
                      <Terminal size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1AADA8]">SQLcl MCP Server</p>
                      <p className="text-[10px] text-[var(--color-text-dim)]">Schema introspection · SQL execution · DDL ops</p>
                    </div>
                  </div>

                  {/* LLM */}
                  <div className="rounded-lg border border-[#D4549A]/25 px-4 py-2.5 flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #D4549A06, #D4549A03)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #D4549A, #A83279)' }}>
                      <BrainCircuit size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#D4549A]">LLM</p>
                      <p className="text-[10px] text-[var(--color-text-dim)]">Multi-step reasoning · Full-stack generation</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Flow pills */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border border-[#0078D4]/20"
                  style={{ background: '#0078D408' }}>
                  <Code2 size={11} className="text-[#0078D4]" /> VS Code
                </div>
                <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border border-[#E87B1A]/20"
                  style={{ background: '#E87B1A08' }}>
                  <Wand2 size={11} className="text-[#E87B1A]" /> Code Assist + SQLcl MCP
                </div>
                <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border border-[#D4549A]/20"
                  style={{ background: '#D4549A08' }}>
                  <BrainCircuit size={11} className="text-[#D4549A]" /> LLM
                </div>
                <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border border-[#C74634]/20"
                  style={{ background: '#C7463408' }}>
                  <Database size={11} className="text-[#C74634]" /> Oracle ADB
                </div>
              </div>
            </div>
          </div>

          {/* Six Capabilities Grid */}
          {/* Top row: 4 capabilities */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CAPABILITIES.slice(0, 4).map(cap => {
              const Icon = cap.icon;
              return (
                <div key={cap.label} className="text-center p-3.5 rounded-xl border border-[var(--color-border)]/40"
                  style={{ background: `${cap.color}08` }}>
                  <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-2"
                    style={{ background: `${cap.color}22` }}>
                    <Icon size={22} style={{ color: cap.color }} />
                  </div>
                  <p className="text-xs font-bold" style={{ color: cap.color }}>{cap.label}</p>
                  <p className="text-[10px] text-[var(--color-text-dim)] mt-1 leading-tight">{cap.desc}</p>
                </div>
              );
            })}
          </div>
          {/* Bottom row: 3 capabilities, centered */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-[75%] sm:max-w-none sm:mx-auto mt-3">
            {CAPABILITIES.slice(4).map(cap => {
              const Icon = cap.icon;
              return (
                <div key={cap.label} className="text-center p-3.5 rounded-xl border border-[var(--color-border)]/40"
                  style={{ background: `${cap.color}08` }}>
                  <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-2"
                    style={{ background: `${cap.color}22` }}>
                    <Icon size={22} style={{ color: cap.color }} />
                  </div>
                  <p className="text-xs font-bold" style={{ color: cap.color }}>{cap.label}</p>
                  <p className="text-[10px] text-[var(--color-text-dim)] mt-1 leading-tight">{cap.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── THIRD COLUMN: What This Demo Solves ── */}
        <div className="glass-card p-6 flex flex-col">
          <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
            <BarChart2 size={20} className="text-[var(--color-accent)]" />
            What This Demo Solves
          </h2>
          <div className="space-y-6 flex-1">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400" /> The Problem (Traditional Stack)
              </h3>
              <ul className="space-y-2 text-[13px] text-[var(--color-text-dim)]">
                {[
                  'PostgreSQL for orders + MongoDB for social posts',
                  'Neo4j for influencer graphs + Pinecone for vectors',
                  'PostGIS for spatial + separate ML platform',
                  'Data sync across 6 systems = eventual consistency bugs',
                  'Each system needs its own DevOps, backups, scaling',
                ].map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-red-400/60 flex-shrink-0">✗</span> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-green-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400" /> The Solution (Oracle AI Database 26ai)
              </h3>
              <ul className="space-y-2 text-[13px] text-[var(--color-text-dim)]">
                {[
                  'One database engine — relational, JSON, graph, vector, spatial, ML, AI agents',
                  'Single ACID transaction spans all data models',
                  'Vector search with ONNX models loaded into the DB kernel',
                  'SDO_GEOMETRY spatial queries on the same tables as orders',
                  'Select AI — natural language to SQL with zero application code',
                  'One backup, one HA config, one security perimeter',
                  'In-Memory Column Store — Products, Social Posts, Orders & Order Items accelerated with MEMCOMPRESS FOR QUERY HIGH for analytical scans',
                  'JSON Duality Views — orders, products, and customers as JSON documents backed by relational tables with full integrity',
                  'Virtual Private Database (VPD) — row-level security via DBMS_RLS, fulfillment managers see only their region\'s data',
                ].map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-green-400/60 flex-shrink-0">✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA: Get Started ── */}
      <div className="text-center space-y-4">
        <button
          onClick={() => onNavigate('datamodel')}
          className="px-10 py-5 rounded-xl text-lg font-bold flex items-center gap-3 mx-auto transition-all hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #C74634, #D4760A)',
            boxShadow: '0 4px 24px rgba(199,70,52,0.3)',
          }}
        >
          <Database size={22} />
          Explore the Schema &amp; Run the Demo
          <ArrowRight size={22} />
        </button>
        <p className="text-sm text-[var(--color-text-dim)]">
          See all 22 tables, data connections, and populate Oracle with live data
        </p>
      </div>

      {/* ── Footer ── */}
      <div className="text-center pb-6">
        <p className="text-xs text-[var(--color-text-dim)]">
          Built on <strong>Oracle AI Database 26ai</strong> — Autonomous, Converged, AI-Native
        </p>
      </div>
    </div>
  );
}
