import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const BASE = "https://secure6.saashr.com/ta/rest";
const COMPANY = process.env.UKG_COMPANY ?? "6176876";
// Internal company ID (cid) from the JWT — used for v2 endpoints.
// This differs from the login company ID (6176876).
const INTERNAL_CID = process.env.UKG_INTERNAL_CID ?? "100695260";
const API_KEY = process.env.UKG_API_KEY!;

// Cost center ID → department name for the 6 Mainline Aviation - AA sub-departments.
// Derived by cross-referencing UKG time entries against the saved labor report.
const AA_COST_CENTER_MAP = new Map<number, string>([
  [55951086058, "Assembly"],
  [60230517464, "Food Production"],
  [60230680971, "Janitorial"],
  [55951816203, "Quality Assurance"],
  [60230716237, "Security"],
  [55951086057, "Transportation"],
]);
const AA_COST_CENTER_IDS = new Set(AA_COST_CENTER_MAP.keys());

// In-process cache keyed by weekStart. Survives across requests until the
// server restarts or the TTL expires. Makes repeat "Fetch Payroll" calls instant.
type CacheEntry = {
  entries: PayrollEntry[];
  weekEnd: string;
  count: number;
  fetchedAt: number;
};
const teCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

type PayrollEntry = {
  empCode: string;
  name: string;
  position: string;
  regHours: number;
  otHours: number;
};

async function ukgLogin(): Promise<string> {
  const res = await fetch(`${BASE}/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": API_KEY },
    body: JSON.stringify({
      credentials: {
        username: process.env.UKG_USER,
        password: process.env.UKG_PASS,
        company: COMPANY,
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    throw new Error(`UKG login failed (${res.status}): ${msg.slice(0, 200)}`);
  }
  const data = await res.json() as { token?: string };
  if (!data.token) throw new Error("UKG login did not return a token");
  return data.token;
}

function msToHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

type UKGEmployee = {
  account_id: number;
  full_name: string;
  employee_id: string;
  job_title?: string;
  position?: string;
};

type UKGTimeEntry = {
  total: number;       // raw punch duration in ms
  calc_total?: number; // payroll-calculated duration in ms (more accurate)
  type?: string;
  pay_category?: { id: number };
  cost_centers?: { index: number; value: { id: number } }[];
};

type UKGTimeEntrySet = {
  employee: { account_id: number };
  time_entries: UKGTimeEntry[];
};

export async function POST(req: Request) {
  // Admin only
  const store = await cookies();
  if (store.get("role")?.value !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json() as { weekStart: string; bust?: boolean };
  const { weekStart, bust } = body;
  if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 });

  // Build date range (Mon–Sun)
  const start = new Date(weekStart + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const endStr = end.toISOString().slice(0, 10);

  // Return cached result if fresh and not busting
  const cached = teCache.get(weekStart);
  if (cached && !bust && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      entries: cached.entries,
      weekStart,
      weekEnd: cached.weekEnd,
      count: cached.count,
      cached: true,
    });
  }

  try {
    const token = await ukgLogin();
    const headers = {
      "Content-Type": "application/json",
      "Api-Key": API_KEY,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    };

    // Fetch employees and time entries in parallel to save time
    const teUrl = `${BASE}/v2/companies/${INTERNAL_CID}/time-entries?start_date=${weekStart}&end_date=${endStr}`;
    const [empRes, teRes] = await Promise.all([
      fetch(`${BASE}/v1/employees?limit=500&status=Active`, { headers, cache: "no-store" }),
      fetch(teUrl, { headers, cache: "no-store" }),
    ]);

    if (!teRes.ok) {
      const msg = await teRes.text().catch(() => String(teRes.status));
      return NextResponse.json(
        { error: `UKG time entries failed (${teRes.status}): ${msg.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const [empData, teData] = await Promise.all([
      empRes.json() as Promise<{ employees?: UKGEmployee[] }>,
      teRes.json() as Promise<{ time_entry_sets?: UKGTimeEntrySet[] }>,
    ]);

    // Build account_id → employee details map
    const empMap = new Map<number, { name: string; employeeId: string; position: string }>();
    for (const emp of empData.employees ?? []) {
      empMap.set(emp.account_id, {
        name: emp.full_name,
        employeeId: emp.employee_id,
        position: emp.job_title ?? emp.position ?? "",
      });
    }

    // Aggregate hours — only for employees in AA cost centers
    const totals = new Map<number, number>();
    const deptMap = new Map<number, string>(); // account_id → department name
    for (const set of teData.time_entry_sets ?? []) {
      const accId = set.employee.account_id;
      let dept: string | undefined;
      for (const e of set.time_entries) {
        for (const cc of e.cost_centers ?? []) {
          const d = AA_COST_CENTER_MAP.get(cc.value?.id);
          if (d) { dept = d; break; }
        }
        if (dept) break;
      }
      if (!dept) continue;

      deptMap.set(accId, dept);
      const current = totals.get(accId) ?? 0;
      const weekTotal = set.time_entries.reduce((sum, e) => {
        const ms = e.calc_total ?? e.total;
        return sum + msToHours(ms);
      }, 0);
      totals.set(accId, current + weekTotal);
    }

    // Build response — only employees with hours
    const entries: PayrollEntry[] = Array.from(totals.entries())
      .filter(([, h]) => h > 0)
      .map(([accId, totalHours]) => {
        const emp = empMap.get(accId);
        const regHours = totalHours <= 40 ? totalHours : 40;
        const otHours = totalHours > 40 ? Math.round((totalHours - 40) * 100) / 100 : 0;
        return {
          empCode: emp?.employeeId ?? String(accId),
          name: emp?.name ?? `Employee ${accId}`,
          position: deptMap.get(accId) ?? emp?.position ?? "",
          regHours: Math.round(regHours * 100) / 100,
          otHours,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Auto-save to DB
    const ws = new Date(weekStart + "T00:00:00Z");
    for (const e of entries) {
      const emp = await prisma.employee.upsert({
        where: { employeeId: e.empCode },
        update: { name: e.name, position: e.position || null },
        create: { employeeId: e.empCode, name: e.name, position: e.position || null },
      });
      await prisma.payrollEntry.upsert({
        where: { employeeId_weekStart: { employeeId: emp.id, weekStart: ws } },
        update: { position: e.position, regHours: e.regHours, otHours: e.otHours },
        create: { employeeId: emp.id, weekStart: ws, position: e.position, regHours: e.regHours, otHours: e.otHours },
      });
    }

    // Store in cache
    teCache.set(weekStart, { entries, weekEnd: endStr, count: entries.length, fetchedAt: Date.now() });

    return NextResponse.json({ entries, weekStart, weekEnd: endStr, count: entries.length, saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
