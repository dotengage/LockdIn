import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppData } from '../types';
import type { GoalMetrics } from '../finance/goals';
import { HEALTH_LABEL, checkInIncome } from '../finance/goals';
import type { LedgerSnapshot } from '../finance/ledger';
import { UNASSIGNED } from '../finance/ledger';
import { savingsSeries, goalPathSeries, incomeSeries } from '../finance/series';
import { typeInfo, txReasonLabel } from '../categories';
import { fmtDate, fmtMonthYear } from '../finance/dates';
import { formatINR, formatINRShort, formatPct } from '../finance/format';
import { summarizePlanner, itemCost, rateItemPerUnit } from '../finance/planner';
import { APP_NAME } from '../../config';
import { rawMonthsBetween } from '../finance/dates';

export interface ReportInput { data: AppData; metrics: Record<string, GoalMetrics>; snap: LedgerSnapshot; today: Date }

// The built-in PDF fonts have no ₹ glyph, so the PDF uses "Rs".
const rs = (n: number) => formatINR(n).replace('₹', 'Rs ');
const rsS = (n: number) => formatINRShort(n).replace('₹', 'Rs ');

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const ACCENT: [number, number, number] = [36, 158, 72];
const LINE: [number, number, number] = [228, 228, 231];

export function buildPdf({ data, metrics, snap, today }: ReportInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;

  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const h1 = (t: string) => { ensure(40); doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK).text(t, M, y + 14); y += 30; };
  const small = (t: string, x = M, color = MUTED) => { doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...color).text(t, x, y); };

  // ---- Cover
  doc.setFillColor(...ACCENT).roundedRect(M, y, 28, 28, 6, 6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK).text(`${APP_NAME} report`, M + 40, y + 20);
  y += 44;
  small(`${data.profile?.name ? `${data.profile.name} · ` : ''}Generated ${fmtDate(today)} · all amounts in Indian Rupees (Rs)`);
  y += 24;

  const goalsValue = data.goals.reduce((s, g) => s + (snap.goalValue[g.id] ?? 0), 0);
  const kpis: [string, string][] = [
    ['Saved towards goals', rs(goalsValue)],
    ['Total value', rs(snap.totalValue)],
    ['Total invested', rs(snap.totalInvested)],
    ['Gain / loss', `${snap.totalValue - snap.totalInvested >= 0 ? '+' : ''}${rs(snap.totalValue - snap.totalInvested)}`],
  ];
  const kw = (W - M * 2 - 30) / 4;
  kpis.forEach(([k, v], i) => {
    const x = M + i * (kw + 10);
    doc.setDrawColor(...LINE).setFillColor(250, 250, 250).roundedRect(x, y, kw, 54, 8, 8, 'FD');
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED).text(k, x + 10, y + 18);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(v, x + 10, y + 38);
  });
  y += 76;

  // ---- Savings chart (last 12 months)
  h1('Savings, last 12 months');
  const series = savingsSeries({ goals: data.goals, holdings: data.holdings, txs: data.transactions, vals: data.valuations, goalId: null, tf: 'monthly', today });
  drawBarLine(doc, M, y, W - M * 2, 170, series.map((p) => ({ label: p.label, stacks: data.goals.map((g) => ({ v: p.saved[g.id] ?? 0, color: g.color })), line: p.value })));
  y += 186;
  small('Bars: amount saved each month (by goal colour). Line: total value of goal money.');
  y += 22;

  // ---- Allocation
  h1('Where your money is');
  const cats = data.profile?.categories;
  const typeIds = [...new Set(data.holdings.map((h) => h.type))];
  const byType = typeIds.map((t) => ({ t, info: typeInfo(t, cats), v: data.holdings.filter((h) => h.type === t).reduce((s, h) => s + (snap.holdings[h.id]?.value ?? 0), 0) })).filter((x) => x.v > 0.5);
  const total = byType.reduce((s, x) => s + x.v, 0) || 1;
  byType.forEach((x) => {
    ensure(20);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK).text(x.info.label, M, y + 9);
    const bw = (W - M * 2 - 200) * (x.v / total);
    doc.setFillColor(...hex(x.info.color)).roundedRect(M + 110, y, Math.max(2, bw), 11, 3, 3, 'F');
    doc.setTextColor(...MUTED).text(`${formatPct((x.v / total) * 100, 1)} · ${rsS(x.v)}`, M + 116 + bw, y + 9);
    y += 18;
  });
  y += 12;

  // ---- Goals
  h1('Goals');
  for (const g of data.goals.filter((x) => x.status !== 'archived')) {
    const m = metrics[g.id];
    if (!m) continue;
    ensure(250);
    doc.setFillColor(...hex(g.color)).circle(M + 5, y + 5, 5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(g.name, M + 16, y + 9);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(`${HEALTH_LABEL[m.health]} · due ${fmtMonthYear(g.savingEndDate)} · ${g.priority} priority`, W - M, y + 9, { align: 'right' });
    y += 20;
    doc.setFillColor(...LINE).roundedRect(M, y, W - M * 2, 8, 4, 4, 'F');
    doc.setFillColor(...hex(g.color)).roundedRect(M, y, Math.max(4, (W - M * 2) * m.progress), 8, 4, 4, 'F');
    y += 22;
    const cells: [string, string][] = [
      ['Current value', rs(m.currentValue)], ['Target', rs(m.target)], ['Progress', formatPct(m.progress * 100)],
      ['Needed / month', rs(m.required)], ['Average saved / month', m.pacePeriods ? rs(m.pace) : '-'], ['Expected return', formatPct(m.expectedReturn)],
      ['Projected at deadline', rs(m.projectedAtDeadline)], ['Projected completion', m.projectedCompletion ? fmtMonthYear(m.projectedCompletion) : 'Not reachable yet'], ['Invested', rs(m.invested)],
    ];
    const cw = (W - M * 2) / 3;
    cells.forEach(([k, v], i) => {
      const x = M + (i % 3) * cw;
      const yy = y + Math.floor(i / 3) * 30;
      doc.setFontSize(8).setTextColor(...MUTED).text(k, x, yy);
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(v, x, yy + 13);
      doc.setFont('helvetica', 'normal');
    });
    y += 96;
    const path = goalPathSeries({ goal: g, holdings: data.holdings, txs: data.transactions, vals: data.valuations, today, target: m.target, expectedReturn: m.expectedReturn, projectionPace: m.projectionPace });
    drawLines(doc, M, y, W - M * 2, 110, path.map((p) => p.label), [
      { values: path.map((p) => p.actual ?? null), color: hex(g.color), width: 1.8 },
      { values: path.map((p) => p.required), color: MUTED, width: 1, dash: true },
      { values: path.map((p) => p.projected ?? null), color: hex(g.color), width: 1, dash: true },
    ]);
    y += 128;
    small('Solid: actual value · grey dashed: required path · coloured dashed: projection at current pace');
    y += 24;
  }

  // ---- Income chart
  ensure(220);
  h1('Income, spending and saving');
  const inc = incomeSeries(data.checkIns, data.transactions, data.goals, today, 12);
  drawGrouped(doc, M, y, W - M * 2, 150, inc.map((p) => ({ label: p.label, values: [p.income, p.spending, p.saved] })), [[212, 212, 216], [161, 161, 170], ACCENT]);
  y += 166;
  small('Light grey: income · grey: spending · green: saved');
  y += 20;

  // ---- Tables
  const tableOpts = { styles: { fontSize: 8, cellPadding: 4, textColor: INK }, headStyles: { fillColor: [244, 244, 245] as [number, number, number], textColor: INK, fontStyle: 'bold' as const }, margin: { left: M, right: M } };
  doc.addPage(); y = M;
  h1('Holdings');
  autoTable(doc, {
    ...tableOpts, startY: y,
    head: [['Holding', 'Type', 'Invested', 'Value', 'Gain', 'Funds goals']],
    body: data.holdings.map((h) => {
      const st = snap.holdings[h.id];
      const owners = Object.entries(st?.owners ?? {}).filter(([, p]) => p.value > 0.5).map(([id]) => (id === UNASSIGNED ? 'General' : data.goals.find((g) => g.id === id)?.name ?? '?'));
      return [h.name, typeInfo(h.type, cats).label, rs(st?.invested ?? 0), rs(st?.value ?? 0), rs((st?.value ?? 0) - (st?.invested ?? 0)), owners.join(', ')];
    }),
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 30;
  h1('Check-ins');
  autoTable(doc, {
    ...tableOpts, startY: y,
    head: [['Period', 'Income', 'Spending', 'Saved', 'Note']],
    body: [...data.checkIns].sort((a, b) => b.periodStart.localeCompare(a.periodStart)).map((c) => [
      `${fmtDate(c.periodStart)} - ${fmtDate(c.periodEnd)}`, rs(checkInIncome(c)), rs(c.spending ?? 0),
      rs(data.transactions.filter((t) => t.checkInId === c.id).reduce((s, t) => s + t.amount, 0)), c.note ?? '',
    ]),
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 30;
  h1('All transactions');
  autoTable(doc, {
    ...tableOpts, startY: y,
    head: [['Date', 'Type', 'Goal', 'Holding', 'Amount', 'Note']],
    body: [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => [
      fmtDate(t.date), `${t.kind === 'contribution' ? 'In' : 'Out'} · ${txReasonLabel(t)}`,
      t.goalId ? data.goals.find((g) => g.id === t.goalId)?.name ?? '?' : 'General', data.holdings.find((h) => h.id === t.holdingId)?.name ?? '?',
      `${t.kind === 'withdrawal' ? '-' : ''}${rs(t.amount)}`, t.note ?? '',
    ]),
  });

  // footer page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    doc.text(`${APP_NAME} · projections use assumed returns, not guarantees`, M, H - 20);
    doc.text(`${p} / ${pages}`, W - M, H - 20, { align: 'right' });
  }
  return doc;
}

function scaleMax(vals: number[]) {
  const max = Math.max(1, ...vals);
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / pow) * pow;
}

function axes(doc: jsPDF, x: number, y: number, w: number, h: number, max: number, labels: string[]) {
  doc.setDrawColor(...LINE).setLineWidth(0.5);
  for (let i = 0; i <= 4; i++) {
    const yy = y + h - (h * i) / 4;
    doc.line(x + 40, yy, x + w, yy);
    doc.setFontSize(7).setTextColor(...MUTED).text(rsS((max * i) / 4).replace('Rs ', ''), x + 34, yy + 2, { align: 'right' });
  }
  const step = Math.ceil(labels.length / 12);
  const bw = (w - 40) / labels.length;
  labels.forEach((l, i) => { if (i % step === 0) doc.text(l, x + 40 + bw * i + bw / 2, y + h + 12, { align: 'center' }); });
}

function drawBarLine(doc: jsPDF, x: number, y: number, w: number, h: number, pts: { label: string; stacks: { v: number; color: string }[]; line: number }[]) {
  if (!pts.length) return;
  const barMax = scaleMax(pts.map((p) => p.stacks.reduce((s, b) => s + b.v, 0)));
  const lineMax = scaleMax(pts.map((p) => p.line));
  axes(doc, x, y, w, h, barMax, pts.map((p) => p.label));
  const bw = (w - 40) / pts.length;
  pts.forEach((p, i) => {
    let yy = y + h;
    for (const s of p.stacks) {
      if (s.v <= 0) continue;
      const bh = (h * s.v) / barMax;
      doc.setFillColor(...hex(s.color)).rect(x + 40 + bw * i + bw * 0.2, yy - bh, bw * 0.6, bh, 'F');
      yy -= bh;
    }
  });
  doc.setDrawColor(...ACCENT).setLineWidth(1.6);
  for (let i = 1; i < pts.length; i++) {
    const x1 = x + 40 + bw * (i - 1) + bw / 2; const x2 = x + 40 + bw * i + bw / 2;
    doc.line(x1, y + h - (h * pts[i - 1].line) / lineMax, x2, y + h - (h * pts[i].line) / lineMax);
  }
  doc.setFontSize(7).setTextColor(...ACCENT).text(`Value scale up to ${rsS(lineMax)}`, x + w, y - 4, { align: 'right' });
}

function drawLines(doc: jsPDF, x: number, y: number, w: number, h: number, labels: string[], lines: { values: (number | null)[]; color: [number, number, number]; width: number; dash?: boolean }[]) {
  if (labels.length < 2) return;
  const max = scaleMax(lines.flatMap((l) => l.values.filter((v): v is number => v != null)));
  axes(doc, x, y, w, h, max, labels);
  const step = (w - 40) / (labels.length - 1);
  for (const l of lines) {
    doc.setDrawColor(...l.color).setLineWidth(l.width);
    doc.setLineDashPattern(l.dash ? [3, 2] : [], 0);
    for (let i = 1; i < l.values.length; i++) {
      const a = l.values[i - 1]; const b = l.values[i];
      if (a == null || b == null) continue;
      doc.line(x + 40 + step * (i - 1), y + h - (h * a) / max, x + 40 + step * i, y + h - (h * b) / max);
    }
  }
  doc.setLineDashPattern([], 0);
}

function drawGrouped(doc: jsPDF, x: number, y: number, w: number, h: number, pts: { label: string; values: number[] }[], colors: [number, number, number][]) {
  const max = scaleMax(pts.flatMap((p) => p.values));
  axes(doc, x, y, w, h, max, pts.map((p) => p.label));
  const bw = (w - 40) / pts.length;
  pts.forEach((p, i) => {
    const each = (bw * 0.7) / p.values.length;
    p.values.forEach((v, j) => {
      const bh = (h * v) / max;
      doc.setFillColor(...colors[j]).rect(x + 40 + bw * i + bw * 0.15 + each * j, y + h - bh, each * 0.9, bh, 'F');
    });
  });
}

/* ------------------------------------------------------------------ Excel */

export async function buildExcel({ data, metrics, snap, today }: ReportInput): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = today;
  const money = '"₹"#,##,##0';
  const header = (ws: import('exceljs').Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 22 }];
  const goalsValue = data.goals.reduce((s, g) => s + (snap.goalValue[g.id] ?? 0), 0);
  sum.addRows([
    { k: 'Report date', v: fmtDate(today) }, { k: 'Saved towards goals', v: goalsValue }, { k: 'General savings', v: snap.goalValue[UNASSIGNED] ?? 0 },
    { k: 'Total value', v: snap.totalValue }, { k: 'Total invested', v: snap.totalInvested }, { k: 'Gain / loss', v: snap.totalValue - snap.totalInvested },
    { k: 'Monthly saving capacity', v: data.profile?.monthlySavingCapacity ?? 0 }, { k: 'Average monthly spending', v: data.profile?.avgMonthlySpending ?? 0 },
  ]);
  sum.getColumn('v').numFmt = money;
  header(sum);

  const gs = wb.addWorksheet('Goals');
  gs.columns = [
    { header: 'Goal', key: 'name', width: 28 }, { header: 'Status', key: 'status', width: 16 }, { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Target', key: 'target', width: 16 }, { header: 'Current value', key: 'value', width: 16 }, { header: 'Invested', key: 'invested', width: 16 },
    { header: 'Progress %', key: 'progress', width: 12 }, { header: 'Deadline', key: 'deadline', width: 12 }, { header: 'Needed / month', key: 'required', width: 16 },
    { header: 'Avg saved / month', key: 'pace', width: 16 }, { header: 'Expected return %', key: 'ret', width: 16 }, { header: 'Projected completion', key: 'proj', width: 18 },
  ];
  for (const g of data.goals) {
    const m = metrics[g.id];
    if (!m) continue;
    gs.addRow({ name: g.name, status: HEALTH_LABEL[m.health], priority: g.priority, target: Math.round(m.target), value: Math.round(m.currentValue), invested: Math.round(m.invested), progress: +(m.progress * 100).toFixed(1), deadline: fmtMonthYear(g.savingEndDate), required: Math.round(m.required), pace: Math.round(m.pace), ret: +m.expectedReturn.toFixed(2), proj: m.projectedCompletion ? fmtMonthYear(m.projectedCompletion) : 'Not reachable' });
  }
  ['target', 'value', 'invested', 'required', 'pace'].forEach((k) => (gs.getColumn(k).numFmt = money));
  header(gs);

  const hs = wb.addWorksheet('Holdings');
  hs.columns = [{ header: 'Holding', key: 'name', width: 26 }, { header: 'Type', key: 'type', width: 16 }, { header: 'Platform', key: 'platform', width: 14 }, { header: 'Invested', key: 'inv', width: 16 }, { header: 'Value', key: 'val', width: 16 }, { header: 'Gain', key: 'gain', width: 14 }, { header: 'Grams', key: 'grams', width: 10 }, { header: 'Archived', key: 'arch', width: 10 }];
  for (const h of data.holdings) {
    const st = snap.holdings[h.id];
    hs.addRow({ name: h.name, type: typeInfo(h.type, data.profile?.categories).label, platform: h.platform ?? '', inv: Math.round(st?.invested ?? 0), val: Math.round(st?.value ?? 0), gain: Math.round((st?.value ?? 0) - (st?.invested ?? 0)), grams: st?.grams ? +st.grams.toFixed(3) : '', arch: h.archived ? 'Yes' : '' });
  }
  ['inv', 'val', 'gain'].forEach((k) => (hs.getColumn(k).numFmt = money));
  header(hs);

  const ts = wb.addWorksheet('Transactions');
  ts.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'kind', width: 13 }, { header: 'Reason', key: 'reason', width: 18 }, { header: 'Goal', key: 'goal', width: 26 }, { header: 'Holding', key: 'holding', width: 24 }, { header: 'Amount', key: 'amount', width: 14 }, { header: 'Grams', key: 'grams', width: 10 }, { header: 'Note', key: 'note', width: 30 }];
  for (const t of [...data.transactions].sort((a, b) => b.date.localeCompare(a.date))) {
    ts.addRow({ date: t.date, kind: t.kind === 'contribution' ? 'Contribution' : 'Withdrawal', reason: txReasonLabel(t), goal: t.goalId ? data.goals.find((g) => g.id === t.goalId)?.name ?? '?' : 'General savings', holding: data.holdings.find((h) => h.id === t.holdingId)?.name ?? '?', amount: t.kind === 'withdrawal' ? -t.amount : t.amount, grams: t.quantityGrams ?? '', note: t.note ?? '' });
  }
  ts.getColumn('amount').numFmt = money;
  header(ts);

  const vs = wb.addWorksheet('Valuations');
  vs.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Holding', key: 'holding', width: 26 }, { header: 'Value', key: 'value', width: 16 }, { header: 'Price / gram', key: 'ppg', width: 14 }];
  for (const v of [...data.valuations].sort((a, b) => b.date.localeCompare(a.date))) vs.addRow({ date: v.date, holding: data.holdings.find((h) => h.id === v.holdingId)?.name ?? '?', value: v.value, ppg: v.pricePerGram ?? '' });
  vs.getColumn('value').numFmt = money;
  header(vs);

  const cs = wb.addWorksheet('Check-ins');
  cs.columns = [{ header: 'Period start', key: 's', width: 13 }, { header: 'Period end', key: 'e', width: 13 }, { header: 'Income', key: 'inc', width: 14 }, { header: 'Sources', key: 'src', width: 36 }, { header: 'Spending', key: 'sp', width: 14 }, { header: 'Saved', key: 'sv', width: 14 }, { header: 'Note', key: 'note', width: 28 }];
  for (const c of [...data.checkIns].sort((a, b) => b.periodStart.localeCompare(a.periodStart))) {
    cs.addRow({ s: c.periodStart, e: c.periodEnd, inc: checkInIncome(c), src: c.incomes.map((i) => `${i.source}: ${i.amount}`).join('; '), sp: c.spending ?? '', sv: data.transactions.filter((t) => t.checkInId === c.id).reduce((s, t) => s + t.amount, 0), note: c.note ?? '' });
  }
  ['inc', 'sp', 'sv'].forEach((k) => (cs.getColumn(k).numFmt = money));
  header(cs);

  const planners = data.goals.filter((g) => g.planner);
  if (planners.length) {
    const ps = wb.addWorksheet('Planner items');
    ps.columns = [{ header: 'Goal', key: 'goal', width: 26 }, { header: 'Section', key: 'section', width: 18 }, { header: 'Item', key: 'item', width: 36 }, { header: 'Kind', key: 'kind', width: 12 }, { header: 'Detail', key: 'detail', width: 30 }, { header: 'Cost today', key: 'cost', width: 16 }, { header: 'Included', key: 'on', width: 10 }];
    for (const g of planners) {
      const p = g.planner!;
      for (const s of p.sections) for (const it of s.items) {
        ps.addRow({ goal: g.name, section: s.name, item: it.name, kind: it.kind, detail: it.kind === 'rate' ? `${it.quantity} ${it.unit} × ${rateItemPerUnit(it)}` : it.kind === 'percent' ? `${it.percent}%` : it.note ?? '', cost: Math.round(itemCost({ ...it, enabled: true }, p.sections)), on: it.enabled ? 'Yes' : 'No' });
      }
      const sm = summarizePlanner(p, Math.max(0, rawMonthsBetween(today, p.spendStartDate)));
      ps.addRow({ goal: g.name, item: 'Final target (inflated, with contingency and cushion)', cost: Math.round(sm.finalTarget) });
    }
    ps.getColumn('cost').numFmt = money;
    header(ps);
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
