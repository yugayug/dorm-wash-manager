import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { getMyHistory } from "@/lib/laundry.functions";
import { History, Timer, Calendar, WashingMachine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const fetchHistory = useServerFn(getMyHistory);

  const { data, isLoading } = useQuery({
    queryKey: ["my-history"],
    queryFn: () => fetchHistory(),
  });

  const history = data?.history ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My History</h1>
          <p className="text-sm text-muted-foreground">Your laundry usage records</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <WashingMachine className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No history yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your laundry usage records will appear here once you start using machines.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((row, index) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-4 rounded-xl border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <WashingMachine className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Machine {row.machine_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.released_by === "auto"
                      ? "bg-info/10 text-info"
                      : row.released_by === "admin"
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                  }`}>
                    {row.released_by}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(row.start_time).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    {row.duration_minutes} min
                  </span>
                  <span>Room {row.room_number}</span>
                </div>
              </div>
              <div className="hidden sm:block text-right text-xs text-muted-foreground">
                <div>{new Date(row.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="mt-0.5">{new Date(row.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
