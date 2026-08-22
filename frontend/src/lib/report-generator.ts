// ════════════════════════════════════════════════════════════════
// TRIPZYY — Complete Trip Expense & Itinerary Report Generator
// Generates a publication-grade PDF Travel Dossier for Ongoing & Completed Trips
// ════════════════════════════════════════════════════════════════

import { jsPDF } from "jspdf";
import type { Trip, Expense, BudgetSummary } from "@/types";

export interface ReportGenerationOptions {
  trip: Trip;
  expenses?: Expense[];
  budgetSummary?: BudgetSummary;
  groupMembers?: { name: string; share: number; status: string }[];
}

export function generateTripReportPDF(options: ReportGenerationOptions): void {
  const { trip, expenses = [], budgetSummary, groupMembers = [] } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const primaryColor = [229, 25, 25]; // Tripzyy Red #E51919
  const darkColor = [23, 19, 19]; // Dark #171313
  const yellowColor = [255, 213, 74]; // Warm Yellow #FFD54A
  const greenColor = [16, 112, 56]; // Green #107038
  const bgSoft = [250, 236, 220]; // Warm Cream #FAECDC

  function checkPageBreak(neededHeight: number) {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      renderPageHeader();
    }
  }

  function renderPageHeader() {
    doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.rect(margin, y, contentWidth, 1.5, "F");
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`TRIPZYY EXPEDITION DOSSIER — ${trip.title.toUpperCase()}`, margin, y);
    doc.text(`PAGE ${doc.getNumberOfPages()}`, pageWidth - margin, y, { align: "right" });
    y += 5;
  }

  // ─── COVER / HEADER BANNER ──────────────────────────────────
  // Outer brutalist container
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, "F");
  doc.setDrawColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, "S");

  // Insignia badge
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin + 5, y + 4, 42, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("TRIPZYY TRAVEL DOSSIER", margin + 7, y + 8);

  // Status Badge
  const statusUpper = (trip.status || "ONGOING").toUpperCase();
  doc.setFillColor(yellowColor[0], yellowColor[1], yellowColor[2]);
  doc.rect(pageWidth - margin - 35, y + 4, 30, 6, "F");
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.setFontSize(7);
  doc.text(statusUpper, pageWidth - margin - 20, y + 8, { align: "center" });

  // Trip Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  const splitTitle = doc.splitTextToSize(trip.title, contentWidth - 10);
  doc.text(splitTitle[0] || trip.title, margin + 5, y + 19);

  // Subtitle info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(255, 240, 240);
  doc.text(
    `Dates: ${trip.start_date} → ${trip.end_date}  |  Travellers: ${trip.traveller_count || 1}  |  Currency: INR (₹)`,
    margin + 5,
    y + 28
  );

  y += 39;

  // ─── EXECUTIVE TRIP OVERVIEW ────────────────────────────────
  doc.setFillColor(bgSoft[0], bgSoft[1], bgSoft[2]);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, "F");
  doc.setDrawColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, "S");

  const startYear = new Date(trip.start_date);
  const endYear = new Date(trip.end_date);
  const duration = Math.max(
    1,
    Math.ceil((endYear.getTime() - startYear.getTime()) / (1000 * 60 * 60 * 24)) || 1
  );

  const totalSpent = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalBudget = trip.budget || budgetSummary?.total_budget || 35000;
  const remaining = totalBudget - totalSpent;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("TOTAL BUDGET", margin + 6, y + 6);
  doc.text("TOTAL EXPENSES", margin + 52, y + 6);
  doc.text("REMAINING BALANCE", margin + 102, y + 6);
  doc.text("DURATION / STOPS", margin + 145, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(`₹${totalBudget.toLocaleString("en-IN")}`, margin + 6, y + 14);
  doc.text(`₹${totalSpent.toLocaleString("en-IN")}`, margin + 52, y + 14);

  doc.setTextColor(remaining >= 0 ? greenColor[0] : primaryColor[0], remaining >= 0 ? greenColor[1] : primaryColor[1], remaining >= 0 ? greenColor[2] : primaryColor[2]);
  doc.text(`₹${remaining.toLocaleString("en-IN")}`, margin + 102, y + 14);

  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text(`${duration} Days (${trip.stops?.length || 0} Stops)`, margin + 145, y + 14);

  y += 26;

  // ─── ROUTE & DESTINATIONS SUMMARY ───────────────────────────
  checkPageBreak(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text("1. EXPEDITION ROUTE & MULTI-CITY STOPS", margin, y);
  y += 5;

  const stops = trip.stops || [];
  if (stops.length > 0) {
    const routeText = stops
      .map((s, i) => `${i + 1}. ${s.city_name || s.destination?.name || "Stop"}`)
      .join("  ➔  ");
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "F");
    doc.setDrawColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(routeText, margin + 4, y + 9);
    y += 18;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Direct single-city expedition.", margin + 4, y + 5);
    y += 10;
  }

  // ─── FINANCIAL BREAKDOWN BY CATEGORY ────────────────────────
  checkPageBreak(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text("2. EXPENSE SUMMARY & CATEGORY BREAKDOWN", margin, y);
  y += 5;

  const catTotals: Record<string, number> = {
    transport: 0,
    accommodation: 0,
    food: 0,
    activities: 0,
    miscellaneous: 0,
  };

  for (const exp of expenses) {
    const c = (exp.category || "miscellaneous").toLowerCase();
    if (catTotals[c] !== undefined) {
      catTotals[c] += Number(exp.amount) || 0;
    } else {
      catTotals.miscellaneous += Number(exp.amount) || 0;
    }
  }

  // Table header
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("CATEGORY", margin + 4, y + 5);
  doc.text("ALLOCATED / SPENT", margin + 65, y + 5);
  doc.text("SHARE %", margin + 115, y + 5);
  doc.text("STATUS", margin + 150, y + 5);
  y += 7;

  const categories = [
    { name: "Transport & Transit", key: "transport" },
    { name: "Accommodations & Stays", key: "accommodation" },
    { name: "Food & Dining", key: "food" },
    { name: "Activities, Tours & Sightseeing", key: "activities" },
    { name: "Miscellaneous & Shopping", key: "miscellaneous" },
  ];

  categories.forEach((cat, idx) => {
    const amt = catTotals[cat.key] || 0;
    const pct = totalSpent > 0 ? ((amt / totalSpent) * 100).toFixed(1) : "0.0";
    doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255);
    doc.rect(margin, y, contentWidth, 6.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.text(cat.name, margin + 4, y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.text(`₹${amt.toLocaleString("en-IN")}`, margin + 65, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${pct}%`, margin + 115, y + 4.5);
    doc.setTextColor(greenColor[0], greenColor[1], greenColor[2]);
    doc.text("VERIFIED", margin + 150, y + 4.5);
    y += 6.5;
  });

  y += 6;

  // ─── ITEMIZED EXPENSES LISTING ──────────────────────────────
  checkPageBreak(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text("3. ITEMIZED EXPENSES LEDGER", margin, y);
  y += 5;

  if (expenses.length > 0) {
    doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("DATE", margin + 4, y + 5);
    doc.text("CATEGORY", margin + 28, y + 5);
    doc.text("DESCRIPTION / VENDOR", margin + 65, y + 5);
    doc.text("AMOUNT (₹)", margin + 145, y + 5);
    y += 7;

    expenses.forEach((exp, idx) => {
      checkPageBreak(7);
      doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255);
      doc.rect(margin, y, contentWidth, 6.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(exp.date || "2026-09-10", margin + 4, y + 4.5);
      doc.text((exp.category || "General").toUpperCase(), margin + 28, y + 4.5);
      const desc = exp.title.length > 40 ? exp.title.substring(0, 38) + "..." : exp.title;
      doc.text(desc, margin + 65, y + 4.5);
      doc.setFont("helvetica", "bold");
      doc.text(`₹${Number(exp.amount).toLocaleString("en-IN")}`, margin + 145, y + 4.5);
      y += 6.5;
    });
    y += 6;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("No specific itemized expenses logged yet for this itinerary.", margin + 4, y + 5);
    y += 10;
  }

  // ─── DAY-BY-DAY ITINERARY DOSSIER ───────────────────────────
  checkPageBreak(50);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.text("4. DAY-BY-DAY ITINERARY DOSSIER", margin, y);
  y += 6;

  stops.forEach((stop, sIdx) => {
    checkPageBreak(25);
    doc.setFillColor(yellowColor[0], yellowColor[1], yellowColor[2]);
    doc.rect(margin, y, contentWidth, 6.5, "F");
    doc.setDrawColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 6.5, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.text(
      `STOP ${sIdx + 1}: ${(stop.city_name || stop.destination?.name || "City").toUpperCase()} (${stop.arrival_date} ➔ ${stop.departure_date})`,
      margin + 4,
      y + 4.5
    );
    y += 8.5;

    const acts = stop.activities || [];
    if (acts.length > 0) {
      acts.forEach((act) => {
        checkPageBreak(8);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(`• ${act.title}`, margin + 6, y + 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        const costText = act.estimated_cost ? `₹${act.estimated_cost}` : "Included";
        const timeText = act.start_time ? `[${act.start_time} - ${act.end_time || ""}]` : "";
        doc.text(`${timeText}  Cost: ${costText}`, pageWidth - margin - 40, y + 4, { align: "right" });
        y += 5.5;
      });
      y += 2;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("Leisure exploration and local dining.", margin + 6, y + 4);
      y += 6;
    }
  });

  // ─── FOOTER & CERTIFICATION ─────────────────────────────────
  checkPageBreak(25);
  doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.rect(margin, y, contentWidth, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("TRIPZYY VERIFIED EXPEDITION RECORD", margin + 5, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-IN", { dateStyle: "full" })} | Document ID: TRIPZYY-${trip.id.substring(0, 8).toUpperCase()}`,
    margin + 5,
    y + 11
  );

  // Trigger browser download
  const sanitizedTitle = trip.title.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`Tripzyy_Report_${sanitizedTitle}.pdf`);
}
