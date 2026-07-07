#!/usr/bin/env node
/**
 * sync-payroll-daily.mjs
 *
 * Fetches yesterday's UKG time entries for Mainline Aviation AA employees
 * and saves them to the database. Run this via EC2 cron each morning.
 *
 * Setup on EC2:
 *   crontab -e
 *   0 6 * * * cd /home/ubuntu/sullivan-billing-app && node scripts/sync-payroll-daily.mjs >> /home/ubuntu/logs/payroll-sync.log 2>&1
 *
 * To back-fill a specific date:
 *   node scripts/sync-payroll-daily.mjs 2026-07-01
 */

import { createRequire } from "module";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const require = createRequire(import.meta.url);

const BASE = "https://secure6.saashr.com/ta/rest";
const COMPANY = process.env.UKG_COMPANY ?? "6176876";
const INTERNAL_CID = process.env.UKG_INTERNAL_CID ?? "100695260";
const API_KEY = process.env.UKG_API_KEY;

const AA_COST_CENTER_MAP = new Map([
  [55951086058, "Assembly"],
  [60230517464, "Food Production"],
  [60230680971, "Janitorial"],
  [55951816203, "Quality Assurance"],
  [60230716237, "Security"],
  [55951086057, "Transportation"],
]);

// Target date: yesterday by default, or first CLI arg
const targetArg = process.argv[2];
const targetDate = targetArg ?? (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

console.log(`[${new Date().toISOString()}] Syncing payroll for ${targetDate}...`);

async function ukgLogin() {
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
  });
  if (!res.ok) throw new Error(`UKG login failed: ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error("No token returned");
  return data.token;
}

function msToHours(ms) {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

async function run() {
  // Dynamic import of Prisma (compiled output)
  const { PrismaClient } = await import("../app/generated/prisma/index.js");
  const prisma = new PrismaClient();

  try {
    const token = await ukgLogin();
    const headers = {
      "Content-Type": "application/json",
      "Api-Key": API_KEY,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    };

    const teUrl = `${BASE}/v2/companies/${INTERNAL_CID}/time-entries?start_date=${targetDate}&end_date=${targetDate}`;
    const [empRes, teRes] = await Promise.all([
      fetch(`${BASE}/v1/employees?limit=500&status=Active`, { headers }),
      fetch(teUrl, { headers }),
    ]);

    if (!teRes.ok) throw new Error(`Time entries failed: ${teRes.status}`);

    const [empData, teData] = await Promise.all([empRes.json(), teRes.json()]);

    const empMap = new Map();
    for (const emp of empData.employees ?? []) {
      empMap.set(emp.account_id, {
        name: emp.full_name,
        employeeId: emp.employee_id,
        position: emp.job_title ?? emp.position ?? "",
      });
    }

    const totals = new Map();
    const deptMap = new Map();
    for (const set of teData.time_entry_sets ?? []) {
      const accId = set.employee.account_id;
      let dept;
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

    const d = new Date(targetDate + "T00:00:00Z");
    let saved = 0;
    for (const [accId, hours] of totals.entries()) {
      if (hours <= 0) continue;
      const empInfo = empMap.get(accId);
      const position = deptMap.get(accId) ?? empInfo?.position ?? "";
      const empCode = empInfo?.employeeId ?? String(accId);
      const name = empInfo?.name ?? `Employee ${accId}`;

      const emp = await prisma.employee.upsert({
        where: { employeeId: empCode },
        update: { name, position: position || null },
        create: { employeeId: empCode, name, position: position || null },
      });

      await prisma.payrollEntry.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: d } },
        update: { position, regHours: Math.round(hours * 100) / 100, otHours: 0 },
        create: { employeeId: emp.id, date: d, position, regHours: Math.round(hours * 100) / 100, otHours: 0 },
      });
      saved++;
    }

    console.log(`[${new Date().toISOString()}] Done — saved ${saved} employee records for ${targetDate}.`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch(err => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  process.exit(1);
});
