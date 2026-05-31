import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  WashingMachine,
  Timer,
  User,
  DoorOpen,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { getMachines, occupyMachine, releaseMachine } from "@/lib/laundry.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type MachineWithOccupancy = Database["public"]["Tables"]["machines"]["Row"] & {
  occupancies: Database["public"]["Tables"]["occupancies"]["Row"] | null;
};

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchMachines = useServerFn(getMachines);

  const { data: machinesData, isLoading } = useQuery({
    queryKey: ["machines"],
    queryFn: () => fetchMachines(),
    refetchInterval: 10000,
  });

  const machines = machinesData?.machines ?? [];
  const availableCount = machines.filter((m) => m.status === "available" && m.out_of_service !== true).length;
  const totalCount = machines.filter((m) => m.out_of_service !== true).length;

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("machines")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machines" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["machines"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "occupancies" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["machines"] });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <WashingMachine className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight">Laundry Management System</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome to the college hostel laundry system. Sign in to reserve and manage washing machines.
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <Button onClick={() => router.navigate({ to: "/login" })} variant="outline">
              Login
            </Button>
            <Button onClick={() => router.navigate({ to: "/signup" })}>
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header stats */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Laundry Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Real-time machine availability</p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Available"
          value={`${availableCount}/${totalCount}`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          label="In Use"
          value={String(machines.filter((m) => m.status === "occupied").length)}
          icon={<Timer className="h-5 w-5" />}
          variant="warning"
        />
        <StatCard
          label="Finished"
          value={String(machines.filter((m) => m.status === "finished").length)}
          icon={<Clock className="h-5 w-5" />}
          variant="info"
        />
      </div>

      {/* Warning banner */}
      <AnimatePresence>
        {availableCount === 0 && totalCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8 rounded-xl border border-warning/20 bg-warning/10 px-4 py-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
              <div>
                <h3 className="font-semibold text-warning-foreground">No machines available</h3>
                <p className="text-sm text-warning-foreground/80">
                  All machines are currently occupied or out of service. Please check back later.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Machine grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {machines.map((machine) => (
          <MachineCard key={machine.id} machine={machine} />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "success" | "warning" | "info";
}) {
  const variantClasses = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    info: "bg-info/10 text-info border-info/20",
  };

  return (
    <div className={`rounded-xl border p-4 ${variantClasses[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2">{icon}</div>
      </div>
    </div>
  );
}

function MachineCard({ machine }: { machine: MachineWithOccupancy }) {
  const [occupyOpen, setOccupyOpen] = useState(false);
  const { user } = useAuth();
  const defaultName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "";
  const [userName, setUserName] = useState(defaultName);
  const [roomNumber, setRoomNumber] = useState("");
  const [duration, setDuration] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const occupyFn = useServerFn(occupyMachine);
  const releaseFn = useServerFn(releaseMachine);

  const statusConfig = {
    available: {
      color: "bg-success/10 border-success/30 text-success",
      badge: "bg-success text-success-foreground",
      label: "Available",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    occupied: {
      color: "bg-warning/10 border-warning/30 text-warning",
      badge: "bg-warning text-warning-foreground",
      label: "In Use",
      icon: <Timer className="h-5 w-5" />,
    },
    finished: {
      color: "bg-info/10 border-info/30 text-info",
      badge: "bg-info text-info-foreground",
      label: "Finished",
      icon: <Clock className="h-5 w-5" />,
    },
  };

  const isOutOfService = machine.out_of_service === true;

  const config = isOutOfService
    ? {
        color: "bg-destructive/10 border-destructive/30 text-destructive",
        badge: "bg-destructive text-destructive-foreground",
        label: "Out of Service",
        icon: <XCircle className="h-5 w-5" />,
      }
    : statusConfig[machine.status as keyof typeof statusConfig];

  const handleOccupy = async () => {
    if (!userName.trim() || !roomNumber.trim()) {
      toast.error("Please enter both your name and room number");
      return;
    }
    const mins = parseInt(duration, 10);
    if (Number.isNaN(mins) || mins < 5 || mins > 180) {
      toast.error("Duration must be between 5 and 180 minutes");
      return;
    }
    setIsSubmitting(true);
    try {
      console.log("[occupy] submitting", { machineId: machine.id, userName, roomNumber, mins });
      await occupyFn({
        data: {
          machineId: machine.id,
          userName: userName.trim(),
          roomNumber: roomNumber.trim(),
          durationMinutes: mins,
        },
      });
      console.log("[occupy] success");
      toast.success(`Machine ${machine.number} occupied successfully`);
      setOccupyOpen(false);
      setRoomNumber("");
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    } catch (err: any) {
      console.error("[occupy] failed", err);
      toast.error(err.message || "Failed to occupy machine");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRelease = async () => {
    setIsSubmitting(true);
    try {
      await releaseFn({ data: { machineId: machine.id } });
      toast.success(`Machine ${machine.number} released`);
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to release machine");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-xl border-2 p-5 transition-shadow hover:shadow-lg ${config.color}`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/60">
              {config.icon}
            </div>
            <div>
              <h3 className="font-semibold">Machine {machine.number}</h3>
              <p className="text-xs opacity-70">{machine.label}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badge}`}>
            {config.label}
          </span>
        </div>

        {machine.occupancies && (
          <div className="mt-4 space-y-2 rounded-lg bg-background/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 opacity-70" />
              <span>{machine.occupancies.user_name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DoorOpen className="h-4 w-4 opacity-70" />
              <span>Room {machine.occupancies.room_number}</span>
            </div>
            <TimeRemaining endTime={machine.occupancies.end_time} />
          </div>
        )}

        <div className="mt-4">
          {machine.status === "available" && !machine.out_of_service ? (
            <Button
              onClick={() => setOccupyOpen(true)}
              className="w-full"
              size="sm"
            >
              Occupy Machine
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : machine.status === "finished" ? (
            <Button
              onClick={handleRelease}
              disabled={isSubmitting}
              className="w-full"
              size="sm"
              variant="secondary"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release Machine"}
            </Button>
          ) : machine.status === "occupied" ? (
            <Button
              onClick={handleRelease}
              disabled={isSubmitting}
              className="w-full"
              size="sm"
              variant="outline"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "End Early"}
            </Button>
          ) : null}
        </div>
      </motion.div>

      <Dialog open={occupyOpen} onOpenChange={setOccupyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Occupy Machine {machine.number}</DialogTitle>
            <DialogDescription>
              Enter your details to reserve this washing machine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room">Room Number</Label>
              <Input
                id="room"
                placeholder="101"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                max="180"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <Button
              onClick={handleOccupy}
              disabled={isSubmitting || !userName.trim() || !roomNumber.trim()}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TimeRemaining({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Time's up");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <Timer className="h-4 w-4 opacity-70" />
      <span>{remaining}</span>
    </div>
  );
}
