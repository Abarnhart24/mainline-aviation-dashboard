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

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const store = await cookies();
  if (store.get("role")?.value !== "admin") redirect("/");

  const { view = "week", date } = await searchParams;
  const anchor = date ? new Date(date + "T00:00:00Z") : new Date();

  let rangeStart: Date, rangeEnd: Date, prevDate: string, nextDate: string, periodLabel: string;

  if (view === "month") {
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
    const monday = getMonday(anchor);
    const sunday = addDays(monday, 6);
    sunday.setUTCHours(23, 59, 59, 999);
    rangeStart = monday;
    rangeEnd = sunday;
    prevDate = isoDate(addDays(monday, -7));
    nextDate = isoDate(addDays(monday, 7));
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    periodLabel = `Week of ${fmt(monday)} – ${fmt(sunday)}`;
  }

  const rawEntries = await prisma.payrollEntry.findMany({
    where: { weekStart: { gte: rangeStart, lte: rangeEnd } },
    include: { employee: true },
    orderBy: { employee: { name: "asc" } },
  });

  let entries: EntryRow[];
  if (view === "week") {
    entries = rawEntries.map(e => ({
      id: e.id,
      empCode: e.employee.employeeId,
      name: e.employee.name,
      position: e.position,
      regHours: e.regHours,
      otHours: e.otHours,
      notes: e.notes ?? "",
    }));
  } else {
    const empMap = new Map<string, EntryRow>();
    for (const e of rawEntries) {
      const key = e.employee.employeeId;
      if (empMap.has(key)) {
        const ex = empMap.get(key)!;
        ex.regHours = Math.round((ex.regHours + e.regHours) * 100) / 100;
        ex.otHours = Math.round((ex.otHours + e.otHours) * 100) / 100;
      } else {
        empMap.set(key, {
          id: e.id,
          empCode: e.employee.employeeId,
          name: e.employee.name,
          position: e.position,
          regHours: e.regHours,
          otHours: e.otHours,
          notes: "",
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

  const currentWeekStart = isoDate(getMonday(new Date()));

  return (
    <PayrollClient
      view={view as "week" | "month" | "year"}
      periodLabel={periodLabel}
      prevDate={prevDate}
      nextDate={nextDate}
      currentDate={date ?? isoDate(anchor)}
      currentWeekStart={currentWeekStart}
      entries={entries}
      employees={employees}
      isAggregated={view !== "week"}
    />
  );
}
