import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PayrollClient, { type EntryRow, type KnownEmployee } from "./PayrollClient";

export const dynamic = "force-dynamic";

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtShort(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const store = await cookies();
  if (store.get("role")?.value !== "admin") redirect("/");

  const { view = "day", date } = await searchParams;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const anchor = date ? new Date(date + "T00:00:00Z") : today;

  let rangeStart: Date, rangeEnd: Date, prevDate: string, nextDate: string, periodLabel: string;

  if (view === "week") {
    const monday = getMonday(anchor);
    const sunday = addDays(monday, 6);
    sunday.setUTCHours(23, 59, 59, 999);
    rangeStart = monday;
    rangeEnd = sunday;
    prevDate = isoDate(addDays(monday, -7));
    nextDate = isoDate(addDays(monday, 7));
    periodLabel = `Week of ${fmtShort(monday)} – ${fmtShort(addDays(monday, 6))}`;
  } else if (view === "month") {
    const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth();
    rangeStart = new Date(Date.UTC(y, m, 1));
    rangeEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    prevDate = isoDate(new Date(Date.UTC(y, m - 1, 1)));
    nextDate = isoDate(new Date(Date.UTC(y, m + 1, 1)));
    periodLabel = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  } else if (view === "year") {
    const y = anchor.getUTCFullYear();
    rangeStart = new Date(Date.UTC(y, 0, 1));
    rangeEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    prevDate = isoDate(new Date(Date.UTC(y - 1, 0, 1)));
    nextDate = isoDate(new Date(Date.UTC(y + 1, 0, 1)));
    periodLabel = String(y);
  } else {
    // day view (default)
    rangeStart = new Date(anchor);
    rangeEnd = new Date(anchor);
    rangeEnd.setUTCHours(23, 59, 59, 999);
    prevDate = isoDate(addDays(anchor, -1));
    nextDate = isoDate(addDays(anchor, 1));
    periodLabel = anchor.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });
  }

  const rawEntries = await prisma.payrollEntry.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    include: { employee: true },
    orderBy: [{ employee: { name: "asc" } }, { date: "asc" }],
  });

  let entries: EntryRow[];

  if (view === "day") {
    entries = rawEntries.map(e => ({
      id: e.id,
      empCode: e.employee.employeeId,
      name: e.employee.name,
      position: e.position,
      regHours: e.regHours,
      otHours: 0,
      notes: e.notes ?? "",
    }));
  } else if (view === "week") {
    // Aggregate daily records per employee, apply 40-hr OT threshold
    const empMap = new Map<string, { id: number; empCode: string; name: string; position: string; totalHours: number }>();
    for (const e of rawEntries) {
      const key = e.employee.employeeId;
      if (empMap.has(key)) {
        empMap.get(key)!.totalHours = Math.round((empMap.get(key)!.totalHours + e.regHours) * 100) / 100;
      } else {
        empMap.set(key, { id: e.id, empCode: key, name: e.employee.name, position: e.position, totalHours: e.regHours });
      }
    }
    entries = Array.from(empMap.values())
      .map(r => ({
        id: r.id,
        empCode: r.empCode,
        name: r.name,
        position: r.position,
        regHours: Math.min(r.totalHours, 40),
        otHours: Math.max(0, Math.round((r.totalHours - 40) * 100) / 100),
        notes: "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Month / Year — total hours only, no OT split
    const empMap = new Map<string, EntryRow>();
    for (const e of rawEntries) {
      const key = e.employee.employeeId;
      if (empMap.has(key)) {
        empMap.get(key)!.regHours = Math.round((empMap.get(key)!.regHours + e.regHours) * 100) / 100;
      } else {
        empMap.set(key, {
          id: e.id, empCode: key, name: e.employee.name,
          position: e.position, regHours: e.regHours, otHours: 0, notes: "",
        });
      }
    }
    entries = Array.from(empMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  const rawEmployees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const employees: KnownEmployee[] = rawEmployees.map(e => ({
    employeeId: e.employeeId,
    name: e.name,
    position: e.position ?? "",
  }));

  const todayStr = isoDate(today);

  return (
    <PayrollClient
      view={view as "day" | "week" | "month" | "year"}
      periodLabel={periodLabel}
      prevDate={prevDate}
      nextDate={nextDate}
      currentDate={date ?? todayStr}
      todayDate={todayStr}
      entries={entries}
      employees={employees}
      isAggregated={view !== "day"}
      showOT={view === "week"}
    />
  );
}
