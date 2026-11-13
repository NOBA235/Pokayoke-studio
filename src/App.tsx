import { useCallback, useEffect, useMemo, useState } from 'react';
import { BenchmarkModal } from './components/BenchmarkModal';
import { CompilerDrawer } from './components/CompilerDrawer';
import { EscalationQueueModal } from './components/EscalationQueueModal';
import { TelemetryHeader, TelemetryStats } from './components/TelemetryHeader';
import { WorkstationHud } from './components/WorkstationHud';
import { getFirebaseInitStatus } from './config/firebase';
import { DEFAULT_ROUTER_CARTRIDGE } from './fixtures/defaultRouterCartridge';
import { probeLocalNanoHardware } from './services/hybridAiService';
import {
  listEscalations,
  seedDefaultCartridgeIfEmpty
} from './services/storageService';
import {
  HardwareInferenceSource,
  HybridExecutionMode,
  LocalNanoAvailability,
  VisualCartridge
} from './types/cartridge';

export function App() {
  const [cartridges, setCartridges] = useState<VisualCartridge[]>([
    DEFAULT_ROUTER_CARTRIDGE
  ]);
  const [activeCartridgeId, setActiveCartridgeId] = useState<string>(
    DEFAULT_ROUTER_CARTRIDGE.id
  );
  const [nanoAvailability, setNanoAvailability] =
    useState<LocalNanoAvailability>('UNSUPPORTED');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [executionMode, setExecutionMode] =
    useState<HybridExecutionMode>('PREFER_ON_DEVICE');
  const [telemetry, setTelemetry] = useState<TelemetryStats>({
    onDeviceFrames: 0,
    inCloudCalls: 0,
    lastLatencyMs: null,
    lastInferenceSource: null
  });
  const [pendingEscalationCount, setPendingEscalationCount] = useState<number>(0);

  const [isCompilerOpen, setIsCompilerOpen] = useState<boolean>(false);
  const [isEscalationsOpen, setIsEscalationsOpen] = useState<boolean>(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState<boolean>(false);

  const firebaseStatus = useMemo(() => getFirebaseInitStatus(), []);

  const refreshNanoProbe = useCallback(async () => {
    const availability = await probeLocalNanoHardware();
    setNanoAvailability(availability);
  }, []);

  const refreshPendingEscalations = useCallback(async () => {
    try {
      const pending = await listEscalations('PENDING_SYNC');
      setPendingEscalationCount(pending.length);
    } catch {
      // IndexedDB unavailable in restricted browser privacy modes
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const seeded = await seedDefaultCartridgeIfEmpty();
        if (active && seeded.length > 0) {
          setCartridges(seeded);
          setActiveCartridgeId(seeded[0].id);
        }
      } catch {
        // Keep in-memory DEFAULT_ROUTER_CARTRIDGE if IndexedDB is blocked
      }

      if (active) {
        await Promise.all([refreshNanoProbe(), refreshPendingEscalations()]);
      }
    };

    void bootstrap();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshNanoProbe, refreshPendingEscalations]);

  const activeCartridge = useMemo(
    () =>
      cartridges.find((c) => c.id === activeCartridgeId) ??
      cartridges[0] ??
      DEFAULT_ROUTER_CARTRIDGE,
    [cartridges, activeCartridgeId]
  );

  const handleTelemetryEvent = useCallback(
    (source: HardwareInferenceSource, latencyMs: number) => {
      setTelemetry((prev) => ({
        onDeviceFrames:
          source === 'ON_DEVICE' ? prev.onDeviceFrames + 1 : prev.onDeviceFrames,
        inCloudCalls:
          source === 'IN_CLOUD' ? prev.inCloudCalls + 1 : prev.inCloudCalls,
        lastLatencyMs: latencyMs,
        lastInferenceSource: source
      }));
    },
    []
  );

  const handleUpsertCartridge = useCallback((saved: VisualCartridge) => {
    setCartridges((prev) => {
      const filtered = prev.filter((item) => item.id !== saved.id);
      return [saved, ...filtered];
    });
    setActiveCartridgeId(saved.id);
  }, []);

  const anyModalOpen = isCompilerOpen || isEscalationsOpen || isBenchmarkOpen;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <TelemetryHeader
        nanoAvailability={nanoAvailability}
        isOnline={isOnline}
        executionMode={executionMode}
        onExecutionModeChange={setExecutionMode}
        onRefreshHardwareProbe={() => void refreshNanoProbe()}
        telemetry={telemetry}
        activeCartridge={activeCartridge}
        cartridges={cartridges}
        onSelectCartridge={setActiveCartridgeId}
        pendingEscalationCount={pendingEscalationCount}
        onOpenCompiler={() => setIsCompilerOpen(true)}
        onOpenEscalations={() => setIsEscalationsOpen(true)}
        onOpenBenchmark={() => setIsBenchmarkOpen(true)}
      />

      <main className="flex-1 pb-8">
        <WorkstationHud
          cartridge={activeCartridge}
          executionMode={executionMode}
          isOnline={isOnline}
          disableHotkeys={anyModalOpen}
          onTelemetryEvent={handleTelemetryEvent}
          onEscalationQueued={() => void refreshPendingEscalations()}
        />
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/90 px-4 py-2.5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-500">
          <span>
            PokaYoke Studio (Kinetic SOP) • Concurrency-1 FIFO Hybrid AI Guard
          </span>
          <span>
            Firebase AI:{' '}
            {firebaseStatus.configured
              ? `Configured (${firebaseStatus.cloudModel}${
                  firebaseStatus.appCheckEnabled ? ' + App Check' : ''
                })`
              : 'Unconfigured (.env required for Cloud / Firebase AI)'}
          </span>
        </div>
      </footer>

      <CompilerDrawer
        isOpen={isCompilerOpen}
        onClose={() => setIsCompilerOpen(false)}
        isOnline={isOnline}
        activeCartridge={activeCartridge}
        onCartridgeSaved={handleUpsertCartridge}
        onTelemetryEvent={handleTelemetryEvent}
      />

      <EscalationQueueModal
        isOpen={isEscalationsOpen}
        onClose={() => setIsEscalationsOpen(false)}
        isOnline={isOnline}
        cartridges={cartridges}
        onCartridgePatched={handleUpsertCartridge}
        onEscalationsChanged={() => void refreshPendingEscalations()}
        onTelemetryEvent={handleTelemetryEvent}
      />

      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
        cartridge={activeCartridge}
        executionMode={executionMode}
        onTelemetryEvent={handleTelemetryEvent}
      />
    </div>
  );
}

export default App;
