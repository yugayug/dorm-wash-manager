import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type Machine = Database["public"]["Tables"]["machines"]["Row"];
type Occupancy = Database["public"]["Tables"]["occupancies"]["Row"];
type UsageHistory = Database["public"]["Tables"]["usage_history"]["Row"];

// ── Public / unauthenticated ──

export const getMachines = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("machines")
      .select("*, occupancies(*)")
      .order("number");
    if (error) throw new Error(error.message);
    return { machines: (data ?? []) as (Machine & { occupancies: Occupancy | null })[] };
  }
);

export const getAppSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("*");
    if (error) throw new Error(error.message);
    const settings: Record<string, string | number | boolean | null> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }
    return { settings };
  }
);

// ── Authenticated ──

export const occupyMachine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { machineId: string; userName: string; roomNumber: string; durationMinutes: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { machineId, userName, roomNumber, durationMinutes } = data;

    const { data: result, error } = await supabase.rpc("occupy_machine", {
      _machine_id: machineId,
      _user_name: userName,
      _room_number: roomNumber,
      _duration_minutes: durationMinutes,
    });

    if (error) throw new Error(error.message);
    return { occupancy: result };
  });

export const releaseMachine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { machineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { machineId } = data;

    const { data: result, error } = await supabase.rpc("release_machine", {
      _machine_id: machineId,
    });

    if (error) throw new Error(error.message);
    return { success: result };
  });

export const getMyHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("usage_history")
      .select("*")
      .eq("user_id", userId)
      .order("end_time", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { history: (data ?? []) as UsageHistory[] };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: !!data };
  });

// ── Admin only ──

export const getAllHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { data, error } = await supabase
      .from("usage_history")
      .select("*")
      .order("end_time", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { history: (data ?? []) as UsageHistory[] };
  });

export const forceReleaseMachine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { machineId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { data: result, error } = await supabase.rpc("release_machine", {
      _machine_id: data.machineId,
      _force: true,
    });

    if (error) throw new Error(error.message);
    return { success: result };
  });

export const sweepExpiredMachines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { data: count, error } = await supabase.rpc("sweep_expired_machines");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const updateMachineStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { machineId: string; outOfService: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { error } = await supabase
      .from("machines")
      .update({ out_of_service: data.outOfService, updated_at: new Date().toISOString() })
      .eq("id", data.machineId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const updateGracePeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { minutes: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized: Admin access required");

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "grace_period_minutes", value: data.minutes });

    if (error) throw new Error(error.message);
    return { success: true };
  });
