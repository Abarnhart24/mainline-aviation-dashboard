"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, RefreshCw,
} from "lucide-react";
import { saveEntry, deleteEntry } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/app/components/ui/table";

export type EntryRow = {
  id: number;
  empCode: string;
  name: string;
  position: string;
  regHours: number;
  otHours: number;
  notes: string;
};

export type KnownEmployee = {
  employeeId: string;
  name: string;
  position: string;
};

type Props = {
  view: "day" | "week" | "month" | "year";
  periodLabel: string;
  prevDate: string;
  nextDate: string;
  currentDate: string;
  todayDate: string;
  entries: EntryRow[];
  employees: KnownEmployee[];
  isAggregated: boolean;
  showOT: boolean;
};

const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
const VIEW_LABELS: Record<string, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };
const BLANK = { empCode: "", name: "", position: "", regHours: 0, otHours: 0, notes: "" };
type FormState = typeof BLANK;

export default function PayrollClient({
  view, periodLabel, prevDate, nextDate, currentDate, todayDate,
  entries, employees, isAggregated, showOT,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [editForm, setEditForm] = useState<FormState>(BLANK);
  const [pending, startTransition] = useTransition();
  const [ukgFetching, setUkgFetching] = useState(false);
  const [ukgError, setUkgError] = useState<string | null>(null);
  const [ukgSuccess, setUkgSuccess] = useState<string | null>(null);

  const totalHours = entries.reduce((s, r) => s + r.regHours + r.otHours, 0);
  const totalOt = entries.reduce((s, r) => s + r.otHours, 0);

  function startAdd() { setEditId(null); setForm(BLANK); setAdding(true); }

  function startEdit(row: EntryRow) {
    setAdding(false);
    setEditId(row.id);
    setEditForm({ empCode: row.empCode, name: row.name, position: row.position, regHours: row.regHours, otHours: row.otHours, notes: row.notes });
  }

  function commitAdd() {
    if (!form.empCode || !form.name) return;
    startTransition(async () => {
      await saveEntry({ ...form, date: currentDate });
      setAdding(false); setForm(BLANK); router.refresh();
    });
  }

  function commitEdit() {
    if (editId === null) return;
    startTransition(async () => {
      await saveEntry({ ...editForm, entryId: editId, date: currentDate });
      setEditId(null); router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("Delete this entry?")) return;
    startTransition(async () => { await deleteEntry(id); router.refresh(); });
  }

  function onEmpCodeChange(val: string) {
    const emp = employees.find(e => e.employeeId === val);
    setForm(f => ({ ...f, empCode: val, ...(emp ? { name: emp.name, position: emp.position || f.position } : {}) }));
  }

  async function fetchToday() {
    setUkgFetching(true);
    setUkgError(null);
    setUkgSuccess(null);
    try {
      const res = await fetch("/api/payroll/fetch-ukg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayDate, bust: true }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok || data.error) {
        setUkgError(data.error ?? "Unknown error from UKG");
      } else {
        setUkgSuccess(`Synced ${data.count} employees for today.`);
        router.push(`/payroll?view=day&date=${todayDate}`);
        router.refresh();
      }
    } catch (err) {
      setUkgError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUkgFetching(false);
    }
  }

  function navUrl(v: string, d: string) { return `/payroll?view=${v}&date=${d}`; }

  // Column count for colSpan calculations
  const colCount = isAggregated
    ? (showOT ? 6 : 5)  // emp id, name, position, reg, (ot), total
    : 8;                 // + notes, actions

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">Hours by employee — synced nightly from UKG.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={fetchToday} disabled={ukgFetching || pending}>
            <RefreshCw className={`size-4 mr-1.5 ${ukgFetching ? "animate-spin" : ""}`} />
            {ukgFetching ? "Syncing… (may take 2 min)" : "Sync Today"}
          </Button>
          {!isAggregated && (
            <Button onClick={startAdd} disabled={adding || pending}>
              <Plus className="size-4 mr-1" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {ukgError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive flex items-start justify-between gap-2">
          <span><strong>Sync error:</strong> {ukgError}</span>
          <button onClick={() => setUkgError(null)}><X className="size-4 opacity-60 hover:opacity-100" /></button>
        </div>
      )}
      {ukgSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-start justify-between gap-2">
          <span>{ukgSuccess}</span>
          <button onClick={() => setUkgSuccess(null)}><X className="size-4 opacity-60 hover:opacity-100" /></button>
        </div>
      )}

      {/* View tabs + period nav */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* View tabs */}
            <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
              {(["day", "week", "month", "year"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => router.push(navUrl(v, currentDate))}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    view === v
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>

            {/* Period label + nav */}
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-medium">{periodLabel}</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => router.push(navUrl(view, prevDate))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => router.push(navUrl(view, todayDate))}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => router.push(navUrl(view, nextDate))}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right w-24">
                  {view === "day" ? "Hours" : "Reg Hrs"}
                </TableHead>
                {showOT && <TableHead className="text-right w-24">OT Hrs</TableHead>}
                {(showOT || !isAggregated) && <TableHead className="text-right w-24">Total</TableHead>}
                {!isAggregated && !showOT && <TableHead className="text-right w-24">Total</TableHead>}
                {!isAggregated && <TableHead>Notes</TableHead>}
                {!isAggregated && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(row =>
                !isAggregated && editId === row.id ? (
                  <TableRow key={row.id} className="bg-muted/30">
                    <TableCell><Input className="h-7 w-24 font-mono text-sm" value={editForm.empCode} onChange={e => setEditForm(f => ({ ...f, empCode: e.target.value }))} /></TableCell>
                    <TableCell><Input className="h-7 w-40" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></TableCell>
                    <TableCell><Input className="h-7 w-28" value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} /></TableCell>
                    <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" value={editForm.regHours} onChange={e => setEditForm(f => ({ ...f, regHours: parseFloat(e.target.value) || 0 }))} /></TableCell>
                    {showOT && <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" value={editForm.otHours} onChange={e => setEditForm(f => ({ ...f, otHours: parseFloat(e.target.value) || 0 }))} /></TableCell>}
                    <TableCell className="text-right tabular-nums">{fmt(editForm.regHours + editForm.otHours)}</TableCell>
                    <TableCell><Input className="h-7" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={commitEdit} disabled={pending}><Check className="size-4 text-green-600" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.empCode}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.position}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(row.regHours)}</TableCell>
                    {showOT && (
                      <TableCell className="text-right tabular-nums">
                        {row.otHours > 0
                          ? <span className="text-amber-600 font-medium">{fmt(row.otHours)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {(showOT || !isAggregated) && (
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmt(row.regHours + row.otHours)}
                      </TableCell>
                    )}
                    {!isAggregated && !showOT && (
                      <TableCell className="text-right tabular-nums font-semibold">
                        {fmt(row.regHours)}
                      </TableCell>
                    )}
                    {!isAggregated && <TableCell className="text-muted-foreground text-sm">{row.notes}</TableCell>}
                    {!isAggregated && (
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(row)}><Pencil className="size-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(row.id)} disabled={pending}><Trash2 className="size-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              )}

              {/* Add row */}
              {!isAggregated && adding && (
                <TableRow className="bg-muted/30">
                  <TableCell>
                    <Input className="h-7 w-24 font-mono text-sm" placeholder="EMP-001" list="emp-list" value={form.empCode} onChange={e => onEmpCodeChange(e.target.value)} autoFocus />
                    <datalist id="emp-list">{employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}</datalist>
                  </TableCell>
                  <TableCell><Input className="h-7 w-40" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-7 w-28" placeholder="Department" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" placeholder="0" value={form.regHours || ""} onChange={e => setForm(f => ({ ...f, regHours: parseFloat(e.target.value) || 0 }))} /></TableCell>
                  {showOT && <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" placeholder="0" value={form.otHours || ""} onChange={e => setForm(f => ({ ...f, otHours: parseFloat(e.target.value) || 0 }))} /></TableCell>}
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(form.regHours + form.otHours)}</TableCell>
                  <TableCell><Input className="h-7" placeholder="Optional" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={commitAdd} disabled={pending || !form.empCode || !form.name}><Check className="size-4 text-green-600" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdding(false)}><X className="size-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* Empty state */}
              {entries.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-10">
                    No data for this period.
                    {view === "day" && " Data syncs automatically each night — or click \"Sync Today\" to pull now."}
                  </TableCell>
                </TableRow>
              )}

              {/* Totals row */}
              {entries.length > 0 && (
                <TableRow className="font-semibold border-t-2 bg-muted/20">
                  <TableCell colSpan={3} className="text-muted-foreground text-sm">
                    {entries.length} employee{entries.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(entries.reduce((s, r) => s + r.regHours, 0))}
                  </TableCell>
                  {showOT && (
                    <TableCell className="text-right tabular-nums text-amber-600">
                      {totalOt > 0 ? fmt(totalOt) : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {fmt(totalHours)}
                  </TableCell>
                  {!isAggregated && <TableCell colSpan={2} />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
