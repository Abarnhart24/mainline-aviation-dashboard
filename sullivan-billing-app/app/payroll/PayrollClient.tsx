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
  view: "week" | "month" | "year";
  periodLabel: string;
  prevDate: string;
  nextDate: string;
  currentDate: string;
  currentWeekStart: string;
  entries: EntryRow[];
  employees: KnownEmployee[];
  isAggregated: boolean;
};

const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);

const BLANK = { empCode: "", name: "", position: "", regHours: 0, otHours: 0, notes: "" };
type FormState = typeof BLANK;

const VIEW_LABELS: Record<string, string> = { week: "Week", month: "Month", year: "Year" };

export default function PayrollClient({
  view, periodLabel, prevDate, nextDate, currentDate, currentWeekStart,
  entries, employees, isAggregated,
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

  const totalReg = entries.reduce((s, r) => s + r.regHours, 0);
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
      await saveEntry({ ...form, weekStart: currentWeekStart });
      setAdding(false); setForm(BLANK); router.refresh();
    });
  }

  function commitEdit() {
    if (editId === null) return;
    startTransition(async () => {
      await saveEntry({ ...editForm, entryId: editId, weekStart: currentWeekStart });
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

  async function fetchFromUKG() {
    setUkgFetching(true);
    setUkgError(null);
    setUkgSuccess(null);
    try {
      const res = await fetch("/api/payroll/fetch-ukg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: currentWeekStart, bust: true }),
      });
      const data = await res.json() as { count?: number; error?: string; cached?: boolean };
      if (!res.ok || data.error) {
        setUkgError(data.error ?? "Unknown error from UKG");
      } else {
        setUkgSuccess(`Saved ${data.count} employee${data.count !== 1 ? "s" : ""} for current week.`);
        router.push(`/payroll?view=week&date=${currentWeekStart}`);
        router.refresh();
      }
    } catch (err) {
      setUkgError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUkgFetching(false);
    }
  }

  function navUrl(v: string, d: string) { return `/payroll?view=${v}&date=${d}`; }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">Hours by employee.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchFromUKG} disabled={ukgFetching || pending}>
            <RefreshCw className={`size-4 mr-1 ${ukgFetching ? "animate-spin" : ""}`} />
            {ukgFetching ? "Fetching… (may take 2 min)" : "Fetch This Week"}
          </Button>
          {!isAggregated && (
            <Button onClick={startAdd} disabled={adding || pending}>
              <Plus className="size-4 mr-1" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* UKG error */}
      {ukgError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive flex items-start justify-between gap-2">
          <span><strong>UKG error:</strong> {ukgError}</span>
          <button onClick={() => setUkgError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {/* UKG success */}
      {ukgSuccess && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-start justify-between gap-2">
          <span>{ukgSuccess}</span>
          <button onClick={() => setUkgSuccess(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {/* View mode tabs + period navigation */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* View tabs */}
            <div className="flex gap-1 rounded-lg border p-1 bg-muted/30">
              {(["week", "month", "year"] as const).map(v => (
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

            {/* Period label + navigation */}
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{periodLabel}</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => router.push(navUrl(view, prevDate))}>
                  <ChevronLeft className="size-4" />
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
                <TableHead>Position</TableHead>
                <TableHead className="text-right w-24">Reg Hrs</TableHead>
                <TableHead className="text-right w-24">OT Hrs</TableHead>
                <TableHead className="text-right w-24">Total</TableHead>
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
                    <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" value={editForm.otHours} onChange={e => setEditForm(f => ({ ...f, otHours: parseFloat(e.target.value) || 0 }))} /></TableCell>
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
                    <TableCell className="text-right tabular-nums">
                      {row.otHours > 0 ? <span className="text-amber-600 font-medium">{fmt(row.otHours)}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(row.regHours + row.otHours)}</TableCell>
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

              {!isAggregated && adding && (
                <TableRow className="bg-muted/30">
                  <TableCell>
                    <Input className="h-7 w-24 font-mono text-sm" placeholder="EMP-001" list="emp-list" value={form.empCode} onChange={e => onEmpCodeChange(e.target.value)} autoFocus />
                    <datalist id="emp-list">{employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}</datalist>
                  </TableCell>
                  <TableCell><Input className="h-7 w-40" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-7 w-28" placeholder="Position" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" placeholder="0" value={form.regHours || ""} onChange={e => setForm(f => ({ ...f, regHours: parseFloat(e.target.value) || 0 }))} /></TableCell>
                  <TableCell><Input className="h-7 w-20 text-right" type="number" step="0.25" min="0" placeholder="0" value={form.otHours || ""} onChange={e => setForm(f => ({ ...f, otHours: parseFloat(e.target.value) || 0 }))} /></TableCell>
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

              {entries.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={isAggregated ? 6 : 8} className="text-center text-muted-foreground py-8">
                    No payroll data for this period. Click &quot;Fetch This Week&quot; to pull from UKG.
                  </TableCell>
                </TableRow>
              )}

              {entries.length > 0 && (
                <TableRow className="font-semibold border-t-2 bg-muted/20">
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {entries.length} employee{entries.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totalReg)}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600">{totalOt > 0 ? fmt(totalOt) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totalReg + totalOt)}</TableCell>
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
