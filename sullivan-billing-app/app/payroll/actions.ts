"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function saveEntry(data: {
  entryId?: number;
  empCode: string;
  name: string;
  position: string;
  date: string; // ISO date string "YYYY-MM-DD"
  regHours: number;
  otHours: number;
  notes?: string;
}) {
  const date = new Date(data.date + "T00:00:00Z");

  const emp = await prisma.employee.upsert({
    where: { employeeId: data.empCode },
    update: { name: data.name, position: data.position || null },
    create: { employeeId: data.empCode, name: data.name, position: data.position || null },
  });

  if (data.entryId) {
    await prisma.payrollEntry.update({
      where: { id: data.entryId },
      data: {
        position: data.position,
        regHours: data.regHours,
        otHours: data.otHours,
        notes: data.notes || null,
      },
    });
  } else {
    await prisma.payrollEntry.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      update: { position: data.position, regHours: data.regHours, otHours: data.otHours, notes: data.notes || null },
      create: {
        employeeId: emp.id,
        date,
        position: data.position,
        regHours: data.regHours,
        otHours: data.otHours,
        notes: data.notes || null,
      },
    });
  }

  revalidatePath("/payroll");
}

export async function deleteEntry(id: number) {
  await prisma.payrollEntry.delete({ where: { id } });
  revalidatePath("/payroll");
}
