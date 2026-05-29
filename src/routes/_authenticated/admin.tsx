import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  getMachines,
  getAllHistory,
  forceReleaseMachine,
  sweepExpiredMachines,
  updateMachineStatus,
  updateGracePeriod,
  getAppSettings,
} from "@/lib/laundry.functions";
import {
  Settings,
  Power,
  PowerOff,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Clock,
  XCircle,
  Loader2,
  ChevronRight,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MachineWithOccupancy = Database["public"]["Tables"]["machines"]["Row"] & {
  occupancies: Database["public"]["Tables"]["occupancies"]["Row"] | null;
};

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const fetchMachines = useServerFn(getMachines);
  const fetchHistory = useServerFn(getAllHistory);
  const fetchSettings = useServerFn(getAppSettings);
  const releaseFn = useServerFn(forceReleaseMachine);
  const sweepFn = useServerFn(sweepExpiredMachines);
  const updateStatusFn = useServerFn(updateMachineStatus);
  const updateGraceFn = useServerFn(updateGracePeriod);

  const [activeTab, setActiveTab] = useState<"machines" | "history" | "settings">("machines");
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [graceValue, setGraceValue] = useState<number[]>([5]);

  const { data: machinesData } = useQuery({
    queryKey: ["machines"],
    queryFn: () => fetchMachines(),
  });

  const { data: historyData } = useQuery({
    queryKey: ["all-history"],
    queryFn: () => fetchHistory(),
    enabled: activeTab === "history",
  });

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => fetchSettings(),
    enabled: activeTab === "settings",
  });

  useEffect(() => {
    if (settingsData?.settings?.grace_period_minutes) {
      setGraceValue([Number(settingsData.settings.grace_period_minutes)]);
    }
  }, [settingsData]);

  const machines = machinesData?.machines ?? [];
  const history = historyData?.history ?? [];

  const handleForceRelease = async (machineId: string) => {
    setIsProcessing(machineId);
    try {
      await releaseFn({ data: { machineId } });
      toast.success("Machine force-released");
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to release machine");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleSweep = async () => {
    setIsProcessing("sweep");
      try {
        const result = await sweepFn();
        toast.success(`Swept ${result.count} expired machines`);
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    } catch (err: any) {
      toast.error(err.message || "Sweep failed");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleToggleOutOfService = async (machine: MachineWithOccupancy) => {
    try {
      await updateStatusFn({
        data: { machineId: machine.id, outOfService: !machine.out_of_service },
      });
      toast.success(`Machine ${machine.number} ${machine.out_of_service ? "restored" : "marked out of service"}`);
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update machine");
    }
  };

  const handleUpdateGrace = async () => {
    try {
      await updateGraceFn({ data: { minutes: graceValue[0] } });
      toast.success(`Grace period updated to ${graceValue[0]} minutes`);
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update grace period");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage machines, view history, and configure settings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {([
          { key: "machines", label: "Machines", icon: <Power className="h-4 w-4" /> },
          { key: "history", label: "History", icon: <History className="h-4 w-4" /> },
          { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Machines Tab */}
      {activeTab === "machines" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Machine Management</h2>
            <Button
              onClick={handleSweep}
              disabled={isProcessing === "sweep"}
              variant="outline"
              size="sm"
            >
              {isProcessing === "sweep" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Sweep Expired
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((machine) => (
              <AdminMachineCard
                key={machine.id}
                machine={machine}
                onToggle={() => handleToggleOutOfService(machine)}
                onForceRelease={() => handleForceRelease(machine.id)}
                isProcessing={isProcessing === machine.id}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h2 className="mb-4 text-lg font-semibold">Usage History</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Machine</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Room</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Released By</th>
                  <th className="px-4 py-3 text-left font-medium">End Time</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No usage history yet
                    </td>
                  </tr>
                )}
                {history.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">Machine {row.machine_number}</td>
                    <td className="px-4 py-3">{row.user_name}</td>
                    <td className="px-4 py-3">{row.room_number}</td>
                    <td className="px-4 py-3">{row.duration_minutes} min</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.released_by === "auto" ? "bg-info/10 text-info" :
                        row.released_by === "admin" ? "bg-warning/10 text-warning" :
                        "bg-success/10 text-success"
                      }`}>
                        {row.released_by}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(row.end_time).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md">
          <h2 className="mb-4 text-lg font-semibold">System Settings</h2>
          <div className="rounded-xl border p-6">
            <label className="block text-sm font-medium mb-4">
              Grace Period: {graceValue[0]} minutes
            </label>
            <Slider
              value={graceValue}
              onValueChange={setGraceValue}
              min={0}
              max={30}
              step={1}
              className="mb-6"
            />
            <p className="text-xs text-muted-foreground mb-4">
              Time after a machine finishes before it is automatically released.
            </p>
            <Button onClick={handleUpdateGrace} size="sm">
              Save Settings
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function AdminMachineCard({
  machine,
  onToggle,
  onForceRelease,
  isProcessing,
}: {
  machine: MachineWithOccupancy;
  onToggle: () => void;
  onForceRelease: () => void;
  isProcessing: boolean;
}) {
  const statusConfig = {
    available: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Available", class: "text-success" },
    occupied: { icon: <Timer className="h-4 w-4" />, label: "In Use", class: "text-warning" },
    finished: { icon: <Clock className="h-4 w-4" />, label: "Finished", class: "text-info" },
  };

  const config = machine.out_of_service
    ? { icon: <XCircle className="h-4 w-4" />, label: "Out of Service", class: "text-destructive" }
    : statusConfig[machine.status as keyof typeof statusConfig];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={config.class}>{config.icon}</span>
          <span className="font-semibold">Machine {machine.number}</span>
        </div>
        <span className={`text-xs font-medium ${config.class}`}>{config.label}</span>
      </div>

      {machine.occupancies && (
        <div className="mb-3 rounded-lg bg-muted/50 p-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">User:</span>
            <span>{machine.occupancies.user_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Room:</span>
            <span>{machine.occupancies.room_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ends:</span>
            <span>{new Date(machine.occupancies.end_time).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!machine.out_of_service}
            onCheckedChange={onToggle}
          />
          <span className="text-xs text-muted-foreground">
            {machine.out_of_service ? "Offline" : "Online"}
          </span>
        </div>

        {(machine.status === "occupied" || machine.status === "finished") && (
          <Button
            onClick={onForceRelease}
            disabled={isProcessing}
            variant="destructive"
            size="sm"
          >
            {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Force Release"}
          </Button>
        )}
      </div>
    </div>
  );
}
