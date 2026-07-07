import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const BASE = "https://secure6.saashr.com/ta/rest";
const COMPANY = process.env.UKG_COMPANY ?? "6176876";
const INTERNAL_CID = process.env.UKG_INTERNAL_CID ?? "100695260";
const API_KEY = process.env.UKG_API_KEY!;

// Cost center ID → department name for the 6 Mainline Aviation - AA sub-departments.
const AA_COST_CENTER_MAP = new Map<number, string>([
  [55951086058, "Assembly"],
  [60230517464, "Food Production"],
  [60230680971, "Janitorial"],
  [55951816203, "Quality Assurance"],
  [60230716237, "Security"],
  [55951086057, "Transportation"],
]);

// In-process cache keyed by date string. 20-min TTL.
type CacheEntry = { entries: PayrollEntry[]; count: number; fetchedAt: number };
const teCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20 * 60 * 1000;

type PayrollEntry = {
  empCode: string;
  name: string;
  position: string;
  hours: number; // total hours for the day (OT calculated at week-aggregate level)
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
  total: number;
  calc_total?: number;
  cost_centers?: { index: number; value: { id: number } }[];
};

type UKGTimeEntrySet = {
  employee: { account_id: number };
  time_entries: UKGTimeEntry[];
};

// Core fetch+save logic — shared by the HTTP route and the cron script
export async function fetchAndSaveDay(
  date: string,
  bust = false
): Promise<{ entries: PayrollEntry[]; count: number; cached: boolean }> {
  const cached = teCache.get(date);
  if (cached && !bust && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { entries: cached.entries, count: cached.count, cached: true };
  }

  const token = await ukgLogin();
  const headers = {
    "Content-Type": "application/json",
    "Api-Key": API_KEY,
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  };

  // Single-day range: start_date = end_date = date
  const teUrl = `${BASE}/v2/companies/${INTERNAL_CID}/time-entries?start_date=${date}&end_date=${date}`;
  const [empRes, teRes] = await Promise.all([
    fetch(`${BASE}/v1/employees?limit=500&status=Active`, { headers, cache: "no-store" }),
    fetch(teUrl, { headers, cache: "no-store" }),
  ]);

  if (!teRes.ok) {
    const msg = await teRes.text().catch(() => String(teRes.status));
    throw new Error(`UKG time entries failed (${teRes.status}): ${msg.slice(0, 300)}`);
  }

  const [empData, teData] = await Promise.all([
    empRes.json() as Promise<{ employees?: UKGEmployee[] }>,
    teRes.json() as Promise<{ time_entry_sets?: UKGTimeEntrySet[] }>,
  ]);

  // Build account_id → employee map
  const empMap = new Map<number, { name: string; employeeId: string; position: string }>();
  for (const emp of empData.employees ?? []) {
    empMap.set(emp.account_id, {
      name: emp.full_name,
      employeeId: emp.employee_id,
      position: emp.job_title ?? emp.position ?? "",
    });
  }

  // Aggregate hours — AA cost center employees only
  const totals = new Map<number, number>();
  const deptMap = new Map<number, string>();
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
    const dayTotal = set.time_entries.reduce((sum, e) => sum + msToHours(e.calc_total ?? e.total), 0);
    totals.set(accId, (totals.get(accId) ?? 0) + dayTotal);
  }

  const entries: PayrollEntry[] = Array.from(totals.entries())
    .filter(([, h]) => h > 0)
    .map(([accId, hours]) => {
      const emp = empMap.get(accId);
      return {
        empCode: emp?.employeeId ?? String(accId),
        name: emp?.name ?? `Employee ${accId}`,
        position: deptMap.get(accId) ?? emp?.position ?? "",
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Save one record per employee per day
  const d = new Date(date + "T00:00:00Z");
  for (const e of entries) {
    const emp = await prisma.employee.upsert({
      where: { employeeId: e.empCode },
      update: { name: e.name, position: e.position || null },
      create: { employeeId: e.empCode, name: e.name, position: e.position || null },
    });
    await prisma.payrollEntry.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: d } },
      update: { position: e.position, regHours: e.hours, otHours: 0 },
      create: { employeeId: emp.id, date: d, position: e.position, regHours: e.hours, otHours: 0 },
    });
  }

  teCache.set(date, { entries, count: entries.length, fetchedAt: Date.now() });
  return { entries, count: entries.length, cached: false };
}

export async function POST(req: Request) {
  const store = await cookies();
  if (store.get("role")?.value !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json() as { date?: string; bust?: boolean };
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const bust = body.bust ?? false;

  try {
    const result = await fetchAndSaveDay(date, bust);
    return NextResponse.json({ ...result, date, saved: !result.cached });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
