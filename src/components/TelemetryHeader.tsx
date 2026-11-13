import {
  Activity,
  Cloud,
  Cpu,
  FilePlus2,
  FlaskConical,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  HardwareInferenceSource,
  HybridExecutionMode,
  LocalNanoAvailability,
  VisualCartridge
} from '../types/cartridge';

export interface TelemetryStats {
  onDeviceFrames: number;
  inCloudCalls: number;
  lastLatencyMs: number | null;
  lastInferenceSource: HardwareInferenceSource | null;
}

export interface TelemetryHeaderProps {
  nanoAvailability: LocalNanoAvailability;
  isOnline: boolean;
  executionMode: HybridExecutionMode;
  onExecutionModeChange: (mode: HybridExecutionMode) => void;
  onRefreshHardwareProbe: () => void;
  telemetry: TelemetryStats;
  activeCartridge: VisualCartridge;
  cartridges: VisualCartridge[];
  onSelectCartridge: (cartridgeId: string) => void;
  pendingEscalationCount: number;
  onOpenCompiler: () => void;
  onOpenEscalations: () => void;
  onOpenBenchmark: () => void;
}

function getNanoBadgeStyle(availability: LocalNanoAvailability): {
  label: string;
  classes: string;
} {
  switch (availability) {
    case 'AVAILABLE':
      return {
        label: 'NANO: AVAILABLE',
        classes: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
      };
    case 'DOWNLOADABLE':
      return {
        label: 'NANO: DOWNLOADABLE',
        classes: 'border-amber-500/50 bg-amber-500/15 text-amber-300'
      };
    case 'DOWNLOADING':
      return {
        label: 'NANO: DOWNLOADING',
        classes: 'border-sky-500/50 bg-sky-500/15 text-sky-300'
      };
    case 'UNAVAILABLE':
      return {
        label: 'NANO: UNAVAILABLE',
        classes: 'border-rose-500/50 bg-rose-500/15 text-rose-300'
      };
    default:
      return {
        label: 'NANO: UNSUPPORTED',
        classes: 'border-slate-700 bg-slate-800 text-slate-300'
      };
  }
}

export function TelemetryHeader({
  nanoAvailability,
  isOnline,
  executionMode,
  onExecutionModeChange,
  onRefreshHardwareProbe,
  telemetry,
  activeCartridge,
  cartridges,
  onSelectCartridge,
  pendingEscalationCount,
  onOpenCompiler,
  onOpenEscalations,
  onOpenBenchmark
}: TelemetryHeaderProps) {
  const nanoBadge = getNanoBadgeStyle(nanoAvailability);
  const { validationReport } = activeCartridge;
  const quotePercent = Math.round(validationReport.quoteVerificationRate * 100);
  const testPercent = Math.round(validationReport.testPassRate * 100);

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
        {/* Top Row: Brand, Active Cartridge, Primary Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wide text-slate-100 sm:text-base">
                  POKAYOKE STUDIO
                </h1>
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                  KINETIC SOP
                </span>
              </div>
              <p className="font-mono text-[11px] text-slate-400">
                Compile-Time Quote Verification: {quotePercent}% • Test Pass Rate:{' '}
                {testPercent}%
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300">
              <span className="font-mono text-[10px] uppercase text-slate-400">
                Cartridge
              </span>
              <select
                aria-label="Select active SOP cartridge"
                value={activeCartridge.id}
                onChange={(e) => onSelectCartridge(e.target.value)}
                className="bg-transparent font-mono text-xs text-slate-100 focus:outline-none cursor-pointer"
              >
                {cartridges.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    className="bg-slate-900 text-slate-100"
                  >
                    {item.name} (v{item.version})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onOpenCompiler}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-500/50 hover:text-amber-200 cursor-pointer"
            >
              <FilePlus2 className="h-3.5 w-3.5 text-amber-400" />
              Compile Manual
            </button>

            <button
              type="button"
              onClick={onOpenEscalations}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-500/50 hover:text-amber-200 cursor-pointer"
            >
              <Inbox className="h-3.5 w-3.5 text-amber-400" />
              Escalations
              {pendingEscalationCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 font-mono text-[10px] font-bold text-slate-950">
                  {pendingEscalationCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenBenchmark}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-200 cursor-pointer"
            >
              <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
              Benchmark
            </button>
          </div>
        </div>

        {/* Bottom Row: Hardware & Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/85 px-3 py-2 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            {/* Local Gemini Nano Probe */}
            <div className="flex items-center gap-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${nanoBadge.classes}`}
              >
                <Cpu className="h-3.5 w-3.5" />
                {nanoBadge.label}
              </span>
              <button
                type="button"
                onClick={onRefreshHardwareProbe}
                title="Re-probe window.LanguageModel.availability()"
                aria-label="Re-probe local Gemini Nano hardware availability"
                className="rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 transition hover:border-slate-700 hover:text-slate-200 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>

            {/* Online / Offline Status */}
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                isOnline
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" /> ONLINE
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" /> OFFLINE / AIR-GAPPED
                </>
              )}
            </span>

            {/* Execution Mode Switch */}
            <div
              role="group"
              aria-label="Hybrid inference execution mode"
              className="inline-flex overflow-hidden rounded border border-slate-700 bg-slate-950"
            >
              <button
                type="button"
                onClick={() => onExecutionModeChange('PREFER_ON_DEVICE')}
                className={`px-2 py-0.5 text-[11px] transition cursor-pointer ${
                  executionMode === 'PREFER_ON_DEVICE'
                    ? 'bg-amber-500/20 font-semibold text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PREFER_ON_DEVICE
              </button>
              <button
                type="button"
                onClick={() => onExecutionModeChange('ONLY_ON_DEVICE')}
                className={`border-l border-slate-800 px-2 py-0.5 text-[11px] transition cursor-pointer ${
                  executionMode === 'ONLY_ON_DEVICE'
                    ? 'bg-emerald-500/20 font-semibold text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ONLY_ON_DEVICE
              </button>
            </div>
          </div>

          {/* Exact Telemetry Counters */}
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Cpu className="h-3.5 w-3.5" />
              ON_DEVICE: <strong>{telemetry.onDeviceFrames}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-sky-300">
              <Cloud className="h-3.5 w-3.5" />
              IN_CLOUD: <strong>{telemetry.inCloudCalls}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-slate-300">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              LATENCY:{' '}
              <strong>
                {telemetry.lastLatencyMs !== null
                  ? `${telemetry.lastLatencyMs} ms`
                  : '—'}
              </strong>
              {telemetry.lastInferenceSource && (
                <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
                  [{telemetry.lastInferenceSource}]
                </span>
              )}
            </span>
            {activeCartridge.status === 'BLOCKED_FAILED_CHECKS' && (
              <span className="inline-flex items-center gap-1 rounded border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                AUDIT BLOCKED
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
