(function () {
  "use strict";

  const DATA = window.PROGNOSER_DATA || {};
  const ALPHA = 0.25;

  const $ = (selector) => document.querySelector(selector);
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  const exampleBtn = $("#example-btn");
  const downloadExampleBtn = $("#download-example-btn");
  const exampleButtonHtml = exampleBtn.innerHTML;
  const resetBtn = $("#reset-btn");
  const fileLine = $("#file-line");
  const fileName = $("#file-name");
  const fileSize = $("#file-size");
  const summaryGrid = $("#summary-grid");
  const summaryGenes = $("#summary-genes");
  const summarySamples = $("#summary-samples");
  const summaryRiskSets = $("#summary-risk-sets");
  const parseNote = $("#parse-note");
  const warningBox = $("#warning-box");
  const moduleGrid = $("#module-grid");
  const resultPanel = $("#result-panel");
  const resultTitle = $("#result-title");
  const resultSubtitle = $("#result-subtitle");
  const mainCanvas = $("#main-canvas");
  const resultTable = $("#result-table");
  const downloadCsvBtn = $("#download-csv-btn");
  const downloadPngBtn = $("#download-png-btn");
  const literatureNavBtn = $("#literature-nav-btn");
  const literatureCtaBtn = $("#literature-cta-btn");
  const toolsNavBtn = $("#tools-nav-btn");
  const toolsCtaBtn = $("#tools-cta-btn");
  const discoveryFilesDropzone = $("#discovery-files-dropzone");
  const discoveryFilesInput = $("#discovery-files-input");
  const discoveryFilesLine = $("#discovery-files-line");
  const discoveryFilesName = $("#discovery-files-name");
  const discoveryFilesSize = $("#discovery-files-size");
  const runDiscoveryBtn = $("#run-discovery-btn");
  const loadPrognoserExampleBtn = $("#load-prognoser-example-btn");
  const prognoserDemoBtn = $("#prognoser-demo-btn");
  const discoveryWarning = $("#discovery-warning");
  const discoveryResults = $("#discovery-results");
  const discoveryCanvas = $("#discovery-canvas");
  const discoveryTable = $("#discovery-table");

  const state = {
    parsed: null,
    risk: null,
    msi: null,
    survival: null,
    discoveryFiles: null,
    activeModule: null,
    lastTable: null,
    lastCsv: null,
  };

  const MODULES = [
    { id: "risk", title: "Risk classification", desc: "ssGSEA + random forest prediction of iHRS / iLRS." },
    { id: "msi", title: "Microsatellite status", desc: "PreMSIm-style kNN prediction of MSI-H / MSI-L." },
    { id: "risk-distribution", title: "Risk score distribution", desc: "Histogram of the iHRS probability and cluster composition." },
    { id: "deg", title: "Differential expression", desc: "Volcano plot comparing iHRS and iLRS samples." },
    { id: "icms", title: "iCMS subtype", desc: "ssGSEA scores for iCMS2 / iCMS3 signatures." },
    { id: "cms", title: "CMS classification", desc: "Nearest-template CMS1 / CMS2 / CMS3 / CMS4 prediction." },
    { id: "hallmark", title: "Hallmark pathways", desc: "Hallmark gene-set activity heatmap and group medians." },
    { id: "functions", title: "Functional signatures", desc: "CMS-derived functional gene-set activity heatmap." },
    { id: "immune", title: "Immune cell infiltration", desc: "28 immune cell signature ssGSEA heatmap." },
    { id: "immunomodulators", title: "Immunomodulators", desc: "Z-scored expression heatmap of immunomodulatory genes." },
    { id: "estimate", title: "ESTIMATE algorithm", desc: "Immune, stromal, ESTIMATE, and tumor purity scores." },
    { id: "ips", title: "Immunophenoscore", desc: "MHC, effector, suppressor, checkpoint, and IPS scores." },
    { id: "xcell", title: "xCell CAF", desc: "Cancer-associated fibroblast signature ssGSEA heatmap." },
    { id: "mcpcounter", title: "MCPcounter", desc: "MCPcounter cell abundance ssGSEA heatmap." },
    { id: "tme-classifier", title: "TME classification", desc: "Nearest-centroid TMEA / TMEB / TMEC prediction." },
    { id: "tcell", title: "T cell states", desc: "TCellSI-inspired T-cell state scores and group comparison." },
    { id: "metabolic", title: "Metabolic flux", desc: "Metabolic pathway differential volcano between risk groups." },
    { id: "pseudotime", title: "Pseudotime trajectory", desc: "PCA-based trajectory and pseudotime across CRC risk groups." },
    { id: "literature", title: "Prognostic ML literature", desc: "Curated PubMed-indexed tumor prognosis machine-learning studies." },
    { id: "tools", title: "Prognostic tools & packages", desc: "Curated survival analysis methods, software, and GitHub repositories." },
  ];

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "—";
    return Number(value).toFixed(digits);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function detectDelimiter(line) {
    const tabs = (line.match(/\t/g) || []).length;
    const commas = (line.match(/,/g) || []).length;
    const semicolons = (line.match(/;/g) || []).length;
    const best = Math.max(tabs, commas, semicolons);
    if (best === 0) return "space";
    if (best === tabs) return "\t";
    if (best === commas) return ",";
    return ";";
  }

  function splitLine(line, delimiter) {
    if (delimiter === "space") return line.trim().split(/\s+/);
    return line.split(delimiter);
  }

  function cleanField(value) {
    return value.trim().replace(/^"|"$/g, "");
  }

  function isNumeric(value) {
    const text = value.trim();
    return text.length > 0 && Number.isFinite(Number(text));
  }

  function uniqueSampleNames(names) {
    const seen = new Set();
    return names.map((name, index) => {
      const base = name && name.trim() ? name.trim() : "Sample_" + (index + 1);
      let candidate = base;
      let suffix = 2;
      while (seen.has(candidate)) {
        candidate = base + "_" + suffix;
        suffix += 1;
      }
      seen.add(candidate);
      return candidate;
    });
  }

  function parseMatrix(text) {
    const lines = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+$/, ""))
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) throw new Error("The file is empty. Please check the file and try again.");
    const delimiter = detectDelimiter(lines[0]);
    const firstRow = splitLine(lines[0], delimiter).map(cleanField);
    if (firstRow.length < 2) throw new Error("No sample columns were detected. Make sure the first row contains sample names.");

    const afterFirst = firstRow.slice(1);
    const headerLike = /^(gene|genes|symbol|id|ids|feature|probe|ensembl|sample|samples|rownames)$/i.test(firstRow[0]);
    const anyNonNumeric = afterFirst.some((cell) => !isNumeric(cell));
    const hasHeader = headerLike || anyNonNumeric;
    const rawSampleNames = hasHeader ? afterFirst : afterFirst.map((_, index) => "Sample_" + (index + 1));
    const samples = uniqueSampleNames(rawSampleNames);
    const dataStart = hasHeader ? 1 : 0;
    const sampleCount = samples.length;

    const acc = new Map();
    let totalRows = 0;
    let duplicateRows = 0;

    for (let li = dataStart; li < lines.length; li += 1) {
      const fields = splitLine(lines[li], delimiter).map(cleanField);
      if (fields.length < 2) continue;
      const symbol = fields[0];
      if (!symbol) continue;
      totalRows += 1;
      const key = symbol.toUpperCase();
      if (!acc.has(key)) {
        acc.set(key, { symbol, sums: new Array(sampleCount).fill(0), counts: new Array(sampleCount).fill(0) });
      } else {
        duplicateRows += 1;
      }
      const rec = acc.get(key);
      for (let i = 0; i < sampleCount; i += 1) {
        const value = Number(fields[i + 1]);
        if (Number.isFinite(value)) {
          rec.sums[i] += value;
          rec.counts[i] += 1;
        }
      }
    }

    if (acc.size === 0) throw new Error("No gene expression values could be parsed from the file.");
    const genes = [];
    const matrix = [];
    let droppedMissing = 0;
    acc.forEach((rec) => {
      const values = rec.sums.map((sum, i) => (rec.counts[i] > 0 ? sum / rec.counts[i] : NaN));
      if (values.some((v) => !Number.isFinite(v))) {
        droppedMissing += 1;
        return;
      }
      genes.push(rec.symbol);
      matrix.push(values);
    });

    if (genes.length === 0) throw new Error("The matrix contains no complete numeric rows. Please check the data format.");
    return { genes, samples, matrix, totalRows, duplicateRows, droppedMissing };
  }

  function geneIndexMap(genes) {
    const map = new Map();
    genes.forEach((gene, index) => map.set(gene.toUpperCase(), index));
    return map;
  }

  function setsToIndices(setList, geneMap) {
    return setList.map((set) => ({
      name: set.name || set.key,
      direction: set.direction || (set.name && set.name.includes("neg") ? "neg" : "pos"),
      indices: (set.genes || []).map((gene) => geneMap.get(gene.toUpperCase())).filter((i) => i !== undefined),
    }));
  }

  function rankAverage(values) {
    const n = values.length;
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => values[a] - values[b] || a - b);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && values[order[j]] === values[order[i]]) j += 1;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k += 1) ranks[order[k]] = avg;
      i = j;
    }
    return ranks;
  }

  function computeSSGSEA(matrix, genes, sets, standardize) {
    const geneCount = genes.length;
    const sampleCount = matrix[0].length;
    const raw = sets.map(() => new Array(sampleCount).fill(NaN));

    for (let sample = 0; sample < sampleCount; sample += 1) {
      const values = genes.map((_, gene) => matrix[gene][sample]);
      const ranks = rankAverage(values);
      const descending = genes.map((_, i) => i).sort((a, b) => values[b] - values[a] || a - b);
      const posOfGene = new Array(geneCount);
      descending.forEach((gene, position) => { posOfGene[gene] = position; });

      sets.forEach((set, si) => {
        let sumRaWeight = 0;
        let sumRa = 0;
        let sumWeight = 0;
        let overlap = 0;
        set.indices.forEach((gene) => {
          const rankValue = ranks[gene];
          const position = posOfGene[gene];
          const weight = geneCount - position;
          const rankPower = Math.pow(rankValue, ALPHA);
          sumRaWeight += rankPower * weight;
          sumRa += rankPower;
          sumWeight += weight;
          overlap += 1;
        });
        if (overlap === 0 || overlap === geneCount) {
          raw[si][sample] = NaN;
          return;
        }
        raw[si][sample] =
          sumRaWeight / sumRa -
          ((geneCount * (geneCount + 1)) / 2 - sumWeight) / (geneCount - overlap);
      });
    }

    const finite = [];
    raw.forEach((row) => row.forEach((v) => { if (Number.isFinite(v)) finite.push(v); }));
    if (finite.length === 0) throw new Error("No gene sets matched the input genes. Please use gene symbols.");
    let min = Infinity;
    let max = -Infinity;
    finite.forEach((v) => { if (v < min) min = v; if (v > max) max = v; });
    const range = max - min;
    const norm = raw.map((row) => row.map((v) => (Number.isFinite(v) ? (range > 1e-12 ? v / range : 0) : NaN)));

    if (standardize) {
      sets.forEach((_, si) => {
        const col = norm[si];
        let mean = 0;
        col.forEach((v) => { mean += v; });
        mean /= sampleCount;
        let ss = 0;
        col.forEach((v) => { const d = v - mean; ss += d * d; });
        const sd = Math.sqrt(ss / (sampleCount - 1));
        for (let sample = 0; sample < sampleCount; sample += 1) {
          norm[si][sample] = Number.isFinite(col[sample]) ? (sd > 1e-12 ? (col[sample] - mean) / sd : 0) : 0;
        }
      });
    }
    return norm;
  }

  function riskSets() {
    return Object.entries(DATA.prognosis_genesets || {}).map(([name, genes]) => ({ name, direction: name.startsWith("HRGS") ? "pos" : "neg", genes }));
  }

  function predictRandomForest(featureMatrix) {
    const rf = DATA.rf;
    if (!rf) throw new Error("Random forest model is not bundled.");
    const sampleCount = featureMatrix.length;
    const ntree = rf.ntree;
    const probs = Array.from({ length: sampleCount }, () => [0, 0]);

    for (let t = 0; t < ntree; t += 1) {
      const tree = rf.trees[t];
      for (let sample = 0; sample < sampleCount; sample += 1) {
        let node = 0;
        for (let depth = 0; depth < 200; depth += 1) {
          if (tree.status[node] !== 1) break;
          const varIndex = tree.bestvar[node];
          const value = featureMatrix[sample][varIndex] || 0;
          node = value <= tree.split[node] ? tree.left[node] : tree.right[node];
          if (node < 0 || node >= tree.status.length) break;
        }
        const pred = tree.pred[node] || 1;
        probs[sample][pred - 1] += 1;
      }
    }
    return probs.map((row) => [row[0] / ntree, row[1] / ntree]);
  }

  function runRisk() {
    if (!state.parsed) throw new Error("Upload an expression matrix first.");
    const parsed = state.parsed;
    const sets = riskSets();
    const indices = setsToIndices(sets, geneIndexMap(parsed.genes));
    const scoresBySet = computeSSGSEA(parsed.matrix, parsed.genes, indices, true);
    const featureNames = DATA.rf.features;
    const featureIndex = new Map(featureNames.map((name, i) => [name, i]));
    const featureMatrix = parsed.samples.map((_, sample) => featureNames.map((name) => {
      const si = sets.findIndex((s) => s.name === name);
      return si >= 0 && Number.isFinite(scoresBySet[si][sample]) ? scoresBySet[si][sample] : 0;
    }));
    const probs = predictRandomForest(featureMatrix);
    const rows = parsed.samples.map((sample, i) => {
      const ihRS = probs[i][0];
      const cluster = ihRS > 0.5 ? "iHRS" : "iLRS";
      return { sample, ihRS, ilRS: probs[i][1], cluster };
    });
    state.risk = { rows, featureMatrix };
    return rows;
  }

  function runMSI() {
    if (!state.parsed) throw new Error("Upload an expression matrix first.");
    const parsed = state.parsed;
    const msi = DATA.msi;
    if (!msi) throw new Error("MSI training data is not bundled.");
    const featureSymbols = msi.feature.symbol;
    const geneMap = geneIndexMap(parsed.genes);
    const symbolIndex = new Map(featureSymbols.map((s, i) => [s.toUpperCase(), i]));
    const trainingGenes = msi.training.genes;
    const geneOrder = trainingGenes.map((gene) => symbolIndex.get(gene.toUpperCase())).filter((i) => i !== undefined);
    if (geneOrder.length < 5) throw new Error("Fewer than 5 MSI signature genes were matched. Please use gene symbols.");

    const inputMatrix = parsed.samples.map((_, sample) => geneOrder.map((featureIdx) => {
      const gi = geneMap.get(featureSymbols[featureIdx].toUpperCase());
      return gi !== undefined ? parsed.matrix[gi][sample] : NaN;
    }));

    let trainFeatures = msi.training.matrix.map((row) => {
      const byGene = new Map();
      msi.training.genes.forEach((g, gi) => byGene.set(g, row[gi]));
      return geneOrder.map((featureIdx) => byGene.get(featureSymbols[featureIdx]));
    });

    const multi = parsed.samples.length > 1;
    if (multi) {
      for (let f = 0; f < geneOrder.length; f += 1) {
        let min = Infinity, max = -Infinity;
        for (let s = 0; s < parsed.samples.length; s += 1) {
          const v = inputMatrix[s][f]; if (v < min) min = v; if (v > max) max = v;
        }
        for (let s = 0; s < parsed.samples.length; s += 1) {
          inputMatrix[s][f] = max - min > 0 ? (inputMatrix[s][f] - min) / (max - min) : 1;
        }
        min = Infinity; max = -Infinity;
        trainFeatures.forEach((row) => { const v = row[f]; if (v < min) min = v; if (v > max) max = v; });
        trainFeatures.forEach((row) => { row[f] = max - min > 0 ? (row[f] - min) / (max - min) : 1; });
      }
    }

    const k = 5;
    const rows = parsed.samples.map((sample, si) => {
      const distances = trainFeatures.map((row) => {
        let sum = 0;
        for (let f = 0; f < geneOrder.length; f += 1) {
          const d = inputMatrix[si][f] - row[f];
          sum += d * d;
        }
        return { dist: Math.sqrt(sum), status: msi.training.status[0] === undefined ? msi.training.status : msi.training.status[0] };
      });
      // use training status vector
      const statuses = msi.training.status;
      distances.forEach((d, i) => { d.status = statuses[i]; });
      distances.sort((a, b) => a.dist - b.dist);
      const neighbors = distances.slice(0, k);
      const high = neighbors.filter((n) => n.status === 1).length;
      const low = neighbors.length - high;
      return { sample, msi: high > low ? "H" : "L", high, low };
    });
    state.msi = rows;
    return rows;
  }

  function riskGroups() {
    if (!state.risk) return [];
    const groups = new Map();
    state.risk.rows.forEach((row) => {
      if (!groups.has(row.cluster)) groups.set(row.cluster, []);
      groups.get(row.cluster).push(row.sample);
    });
    return Array.from(groups.entries()).map(([name, samples]) => ({ name, samples: new Set(samples) }));
  }

  function sampleToGroup(sample) {
    if (!state.risk) return null;
    const row = state.risk.rows.find((r) => r.sample === sample);
    return row ? row.cluster : null;
  }

  function welchTest(a, b) {
    if (a.length < 2 || b.length < 2) return NaN;
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = (arr, m) => arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1);
    const ma = mean(a), mb = mean(b);
    const va = variance(a, ma), vb = variance(b, mb);
    const se = Math.sqrt(va / a.length + vb / b.length);
    if (se === 0) return NaN;
    const t = (ma - mb) / se;
    const df = Math.pow(va / a.length + vb / b.length, 2) / (Math.pow(va / a.length, 2) / (a.length - 1) + Math.pow(vb / b.length, 2) / (b.length - 1));
    // Normal CDF approximation.
    const x = Math.abs(t);
    const z = 1 / (1 + 0.2316419 * x);
    const cdf = 1 - 0.3989423 * Math.exp(-x * x / 2) * (z * (0.3193815 + z * (-0.3565638 + z * (1.781478 + z * (-1.821256 + z * 1.330274)))));
    return Math.min(1, Math.max(0, cdf));
  }

  function runDEG() {
    if (!state.risk) throw new Error("Run risk classification first.");
    const parsed = state.parsed;
    const groups = riskGroups();
    if (groups.length < 2) throw new Error("Differential expression requires both iHRS and iLRS samples.");
    const h = groups.find((g) => g.name === "iHRS");
    const l = groups.find((g) => g.name === "iLRS");
    if (!h || !l) throw new Error("Both iHRS and iLRS samples are required.");
    const points = parsed.genes.map((gene, gi) => {
      const a = [], b = [];
      parsed.samples.forEach((_, si) => {
        if (h.samples.has(parsed.samples[si])) a.push(parsed.matrix[gi][si]);
        else if (l.samples.has(parsed.samples[si])) b.push(parsed.matrix[gi][si]);
      });
      const p = welchTest(a, b);
      const logFC = a.reduce((s, v) => s + v, 0) / a.length - b.reduce((s, v) => s + v, 0) / b.length;
      return { gene, logFC, p, negLogP: Number.isFinite(p) ? -Math.log10(p) : 0 };
    });
    return points.sort((a, b) => b.negLogP - a.negLogP);
  }

  function moduleSets(module) {
    const geneMap = geneIndexMap(state.parsed.genes);
    if (module === "icms") {
      return setsToIndices(DATA.icms.map((s) => ({ name: s.name, genes: s.genes })), geneMap);
    }
    if (module === "hallmark") {
      return setsToIndices(DATA.hallmark.map((s) => ({ name: s.name, genes: s.genes })), geneMap);
    }
    if (module === "functions") {
      return setsToIndices(DATA.cms.map((s) => ({ name: s.name.replace(/_/g, " "), genes: s.genes })), geneMap);
    }
    if (module === "immune") {
      return setsToIndices(Object.entries(DATA.immune).map(([name, genes]) => ({ name, genes })), geneMap);
    }
    if (module === "xcell") {
      return setsToIndices(Object.entries(DATA.caf || {}).map(([name, genes]) => ({ name, genes })), geneMap);
    }
    if (module === "mcpcounter") {
      const grouped = new Map();
      (DATA.mcp || []).forEach((row) => {
        const pop = row["Cell population"];
        if (!grouped.has(pop)) grouped.set(pop, []);
        grouped.get(pop).push(row["HUGO symbols"]);
      });
      return setsToIndices(Array.from(grouped.entries()).map(([name, genes]) => ({ name, genes })), geneMap);
    }
    if (module === "estimate") {
      return setsToIndices([
        { name: "ImmuneScore", genes: DATA.si_immune || [] },
        { name: "StromalScore", genes: DATA.si_stromal || [] },
      ], geneMap);
    }
    if (module === "tcell") {
      return setsToIndices(Object.entries(DATA.tcellsi_markers || {}).map(([name, genes]) => ({ name, genes })), geneMap);
    }
    if (module === "metabolic") {
      return setsToIndices(Object.entries(DATA.metabolic_sets || {}).map(([name, genes]) => ({ name, genes })), geneMap);
    }
    if (module === "tme") {
      const immune = DATA.cms.find((s) => s.name === "Immune_infiltration");
      const stromal = DATA.cms.find((s) => s.name === "Stromal_infiltration");
      return setsToIndices([immune, stromal].filter(Boolean).map((s) => ({ name: s.name.replace(/_/g, " "), genes: s.genes })), geneMap);
    }
    return [];
  }

  function runHeatmapModule(module) {
    const sets = moduleSets(module);
    if (sets.length === 0) throw new Error("No signatures are available for this module.");
    const scoresBySet = computeSSGSEA(state.parsed.matrix, state.parsed.genes, sets, true);
    const labels = sets.map((s) => s.name);
    return { sets, scoresBySet, labels };
  }

  // ---------- Charts ----------
  function prepareCanvas(width, height) {
    const dpr = window.devicePixelRatio || 1;
    mainCanvas.width = width * dpr;
    mainCanvas.height = height * dpr;
    mainCanvas.style.width = width + "px";
    mainCanvas.style.height = height + "px";
    const ctx = mainCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }

  function colorRamp(value, min, max) {
    const t = Math.max(-1, Math.min(1, (value - (min + max) / 2) / ((max - min) / 2 || 1)));
    if (t < 0) {
      const u = -t;
      return [133 + (255 - 133) * u, 82 + (255 - 82) * u, 161 + (255 - 161) * u];
    }
    const u = t;
    return [255, 255 - (255 - 212) * u, 255 - (255 - 64) * u];
  }

  function drawVolcano(points, highlight) {
    const width = 760, height = 430;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 65, right: 20, top: 35, bottom: 55 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const maxX = Math.max(...points.map((p) => Math.abs(p.logFC))) * 1.1 || 1;
    const maxY = Math.max(...points.map((p) => p.negLogP)) * 1.1 || 1;
    const x = (v) => pad.left + (v / maxX) * plotW / 2 + plotW / 2;
    const y = (v) => pad.top + plotH - (v / maxY) * plotH;
    ctx.strokeStyle = "#e0e5df";
    ctx.fillStyle = "#5d6b65";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.beginPath(); ctx.moveTo(x(0), pad.top); ctx.lineTo(x(0), pad.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left, y(0)); ctx.lineTo(pad.left + plotW, y(0)); ctx.stroke();
    ctx.fillText("0", x(0), pad.top + plotH + 18);
    ctx.fillText("log2 fold change", pad.left + plotW / 2, height - 8);
    ctx.save(); ctx.translate(18, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("-log10 p-value", 0, 0); ctx.restore();
    points.forEach((p) => {
      const sig = p.p < 0.05 && Math.abs(p.logFC) > 0.3;
      ctx.fillStyle = sig ? (p.logFC >= 0 ? "#d94f3d" : "#0f766e") : "#b9c2bd";
      ctx.beginPath();
      ctx.arc(x(p.logFC), y(p.negLogP), sig ? 3 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    if (highlight) {
      ctx.fillStyle = "#16211e";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(highlight, 80, 24);
    }
  }

  function drawHeatmap(mat, rowLabels, colLabels, title) {
    const width = 900, height = Math.max(360, rowLabels.length * 18 + 90);
    const ctx = prepareCanvas(width, height);
    const pad = { left: 180, right: 20, top: 30, bottom: 110 };
    const cellW = (width - pad.left - pad.right) / colLabels.length;
    const cellH = (height - pad.top - pad.bottom) / rowLabels.length;
    let min = Infinity, max = -Infinity;
    mat.forEach((row) => row.forEach((v) => { if (v < min) min = v; if (v > max) max = v; }));
    mat.forEach((row, ri) => row.forEach((v, ci) => {
      const [r, g, b] = colorRamp(v, min, max);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(pad.left + ci * cellW, pad.top + ri * cellH, cellW + 0.5, cellH + 0.5);
    }));
    ctx.fillStyle = "#5d6b65";
    ctx.font = "11px sans-serif";
    rowLabels.forEach((label, ri) => {
      ctx.textAlign = "right";
      ctx.fillText(label.slice(0, 28), pad.left - 6, pad.top + ri * cellH + cellH / 2 + 4);
    });
    colLabels.forEach((label, ci) => {
      ctx.save();
      ctx.translate(pad.left + ci * cellW + cellW / 2, pad.top + rowLabels.length * cellH + 7);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right";
      ctx.fillText(label.slice(0, 24), 0, 0);
      ctx.restore();
    });
    ctx.textAlign = "left";
    ctx.fillStyle = "#16211e";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(title, pad.left, 20);
  }

  function drawBoxplot(groups, title) {
    const width = 720, height = 420;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 55, right: 20, top: 35, bottom: 60 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const all = groups.flatMap((g) => g.data);
    const min = Math.min(...all), max = Math.max(...all);
    const y = (v) => pad.top + plotH - ((v - min) / (max - min || 1)) * plotH;
    const groupW = plotW / groups.length;
    const colors = ["#f391a9", "#d71345", "#90d7ec", "#145b7d", "#d99018"];
    groups.forEach((g, gi) => {
      const sorted = g.data.slice().sort((a, b) => a - b);
      const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
      const med = sorted[Math.floor((sorted.length - 1) * 0.5)];
      const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
      const cx = pad.left + gi * groupW + groupW / 2;
      const bw = Math.min(70, groupW * 0.5);
      ctx.strokeStyle = colors[gi % colors.length];
      ctx.fillStyle = colors[gi % colors.length] + "44";
      ctx.fillRect(cx - bw / 2, y(q3), bw, Math.max(1, y(q1) - y(q3)));
      ctx.strokeRect(cx - bw / 2, y(q3), bw, Math.max(1, y(q1) - y(q3)));
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, y(med)); ctx.lineTo(cx + bw / 2, y(med)); ctx.stroke();
      ctx.fillStyle = "#16211e";
      ctx.textAlign = "center";
      ctx.fillText(g.name, cx, height - 25);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = "#5d6b65";
    ctx.font = "12px sans-serif";
    ctx.fillText(title, pad.left, 20);
  }

  function drawHistogram(values, color) {
    const width = 720, height = 360;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 55, right: 20, top: 35, bottom: 45 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const bins = 20;
    const min = Math.min(...values), max = Math.max(...values);
    const counts = new Array(bins).fill(0);
    values.forEach((v) => {
      const idx = Math.min(bins - 1, Math.floor(((v - min) / (max - min || 1)) * bins));
      counts[idx] += 1;
    });
    const maxCount = Math.max(...counts);
    const bw = plotW / bins;
    counts.forEach((count, i) => {
      const h = (count / maxCount) * plotH;
      ctx.fillStyle = color;
      ctx.fillRect(pad.left + i * bw, pad.top + plotH - h, bw - 2, h);
    });
    ctx.fillStyle = "#5d6b65";
    ctx.font = "12px sans-serif";
    ctx.fillText("iHRS probability", pad.left, height - 12);
  }

  function drawStackedBar(groups, categories, colors) {
    const width = 640, height = 380;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 60, right: 20, top: 40, bottom: 55 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const groupW = plotW / groups.length;
    groups.forEach((g, gi) => {
      const total = g.counts.reduce((s, v) => s + v, 0) || 1;
      let yTop = pad.top + plotH;
      categories.forEach((cat, ci) => {
        const h = (g.counts[ci] / total) * plotH;
        ctx.fillStyle = colors[ci];
        ctx.fillRect(pad.left + gi * groupW + groupW * 0.15, yTop - h, groupW * 0.7, h);
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(pad.left + gi * groupW + groupW * 0.15, yTop - h, groupW * 0.7, h);
        yTop -= h;
      });
      ctx.fillStyle = "#16211e";
      ctx.textAlign = "center";
      ctx.fillText(g.name, pad.left + gi * groupW + groupW / 2, height - 20);
      ctx.fillText("n=" + total, pad.left + gi * groupW + groupW / 2, height - 5);
    });
  }

  function median(arr) {
    if (!arr.length) return NaN;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function rankArray(values) {
    const n = values.length;
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => values[a] - values[b] || a - b);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && values[order[j]] === values[order[i]]) j += 1;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k += 1) ranks[order[k]] = avg;
      i = j;
    }
    return ranks;
  }

  function gammaLower(s, x) {
    // Numerical approximation of the lower incomplete gamma function P(s, x).
    if (x <= 0) return 0;
    const logGamma = (z) => {
      const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
      let x = z - 1, t = x + 7.5, sum = 0.99999999999980993;
      for (let i = 0; i < 8; i += 1) sum += c[i] / (x + i + 1);
      return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(sum);
    };
    const eps = 1e-12;
    let sum = 0, term = 1 / s, a = s;
    for (let n = 0; n < 300; n += 1) {
      sum += term;
      a += 1;
      term *= x / a;
      if (term < eps) break;
    }
    return sum * Math.exp(s * Math.log(x) - x - logGamma(s));
  }

  function chiSquareSurvival(x, df) {
    if (x <= 0) return 1;
    return 1 - gammaLower(df / 2, x / 2);
  }

  function contingencyChiSquareP(observed) {
    const rows = observed.length;
    const cols = observed[0].length;
    const rowSum = observed.map((r) => r.reduce((a, b) => a + b, 0));
    const colSum = observed[0].map((_, c) => observed.reduce((a, r) => a + r[c], 0));
    const total = rowSum.reduce((a, b) => a + b, 0);
    if (total === 0) return NaN;
    let stat = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const expected = rowSum[r] * colSum[c] / total;
        if (expected > 0) stat += (observed[r][c] - expected) ** 2 / expected;
      }
    }
    return chiSquareSurvival(stat, (rows - 1) * (cols - 1));
  }

  function kruskalWallisP(groups) {
    const all = [];
    groups.forEach((g, gi) => g.forEach((v) => all.push({ v, gi })));
    all.sort((a, b) => a.v - b.v);
    const ranks = new Array(all.length);
    let i = 0;
    while (i < all.length) {
      let j = i + 1;
      while (j < all.length && all[j].v === all[i].v) j += 1;
      const avg = (i + j + 1) / 2;
      for (let k = i; k < j; k += 1) ranks[k] = avg;
      i = j;
    }
    const groupRanks = groups.map(() => []);
    all.forEach((item, idx) => groupRanks[item.gi].push(ranks[idx]));
    const N = all.length;
    let H = 0;
    groupRanks.forEach((r) => {
      if (r.length === 0) return;
      const sum = r.reduce((a, b) => a + b, 0);
      H += sum * sum / r.length;
    });
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    const df = Math.max(1, groups.filter((g) => g.length > 0).length - 1);
    return Math.min(1, Math.max(0, chiSquareSurvival(H, df)));
  }

  function wilcoxonP(a, b) {
    // Welch t-test used for display; the reference uses Wilcoxon.
    return welchTest(a, b);
  }

  function drawPercentStackedBar(crossTab, categories, colors, title, pValue) {
    const width = 780, height = 430;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 66, right: 140, top: 55, bottom: 66 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const groupNames = Object.keys(crossTab);
    const groupW = plotW / groupNames.length;
    const yMax = 105;
    const y = (v) => pad.top + plotH - (v / yMax) * plotH;

    ctx.strokeStyle = "#16211e";
    ctx.fillStyle = "#16211e";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    [0, 25, 50, 75, 100].forEach((tick) => {
      const yy = y(tick);
      ctx.beginPath(); ctx.moveTo(pad.left - 5, yy); ctx.lineTo(pad.left, yy); ctx.stroke();
      ctx.fillText(String(tick), pad.left - 9, yy + 4);
    });
    ctx.save();
    ctx.translate(18, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Percentage (%)", 0, 0);
    ctx.restore();

    groupNames.forEach((group, gi) => {
      const counts = categories.map((cat) => crossTab[group][cat] || 0);
      const total = counts.reduce((a, b) => a + b, 0) || 1;
      const xLeft = pad.left + gi * groupW + groupW * 0.15;
      const barW = groupW * 0.7;
      let yTop = y(0);
      counts.forEach((count, ci) => {
        const pct = (count / total) * 100;
        const h = (pct / yMax) * plotH;
        ctx.fillStyle = colors[ci];
        ctx.fillRect(xLeft, yTop - h, barW, h);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(xLeft, yTop - h, barW, h);
        if (pct >= 5) {
          ctx.fillStyle = "#16211e";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(pct.toFixed(1) + "%", xLeft + barW / 2, yTop - h / 2 + 4);
        }
        yTop -= h;
      });
      ctx.fillStyle = "#16211e";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(group, xLeft + barW / 2, height - 32);
      ctx.fillText("n = " + total, xLeft + barW / 2, height - 15);
    });

    const legendX = width - pad.right + 12;
    const legendY = pad.top;
    ctx.textAlign = "left";
    ctx.font = "12px sans-serif";
    categories.forEach((cat, ci) => {
      ctx.fillStyle = colors[ci];
      ctx.fillRect(legendX, legendY + ci * 24, 14, 14);
      ctx.strokeStyle = "#16211e";
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX, legendY + ci * 24, 14, 14);
      ctx.fillStyle = "#16211e";
      ctx.fillText(cat, legendX + 20, legendY + ci * 24 + 12);
    });

    ctx.fillStyle = "#16211e";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, pad.left, 24);
    ctx.fillStyle = "#5d6b65";
    ctx.font = "12px sans-serif";
    ctx.fillText("Chi-square test: p = " + (Number.isFinite(pValue) ? pValue.toExponential(2) : "NA"), pad.left, 44);
  }

  function drawGroupedBoxplots(metrics, groupNames, groupValues, colors, title) {
    const width = Math.max(720, metrics.length * 220);
    const height = 430;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 55, right: 20, top: 45, bottom: 60 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const metricW = plotW / metrics.length;
    const groupW = metricW / groupNames.length;
    const all = groupValues.flat(2);
    let min = Math.min(...all), max = Math.max(...all);
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    const y = (v) => pad.top + plotH - ((v - min) / (max - min || 1)) * plotH;
    metrics.forEach((metric, mi) => {
      groupNames.forEach((gname, gi) => {
        const data = groupValues[mi][gi].slice().sort((a, b) => a - b);
        const q1 = data[Math.floor((data.length - 1) * 0.25)];
        const med = data[Math.floor((data.length - 1) * 0.5)];
        const q3 = data[Math.floor((data.length - 1) * 0.75)];
        const cx = pad.left + mi * metricW + gi * groupW + groupW / 2;
        const bw = Math.min(45, groupW * 0.5);
        ctx.strokeStyle = colors[gi % colors.length];
        ctx.fillStyle = colors[gi % colors.length] + "66";
        ctx.fillRect(cx - bw / 2, y(q3), bw, Math.max(1, y(q1) - y(q3)));
        ctx.strokeRect(cx - bw / 2, y(q3), bw, Math.max(1, y(q1) - y(q3)));
        ctx.beginPath(); ctx.moveTo(cx - bw / 2, y(med)); ctx.lineTo(cx + bw / 2, y(med)); ctx.stroke();
        ctx.fillStyle = "#16211e";
        ctx.textAlign = "center";
        ctx.font = "11px sans-serif";
        ctx.fillText(gname, cx, height - 26);
      });
      ctx.fillStyle = "#16211e";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(metric, pad.left + mi * metricW + metricW / 2, 24);
      const pMetric = kruskalWallisP(groupValues[mi]);
      ctx.fillStyle = "#5d6b65";
      ctx.font = "11px sans-serif";
      ctx.fillText("p = " + (Number.isFinite(pMetric) ? pMetric.toExponential(2) : "NA"), pad.left + mi * metricW + metricW / 2, 40);
    });
    ctx.fillStyle = "#16211e";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, pad.left, 20);
  }

  function drawCountBar(labels, values, colors, title) {
    const width = 620, height = 360;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 55, right: 20, top: 45, bottom: 55 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(...values, 1);
    const groupW = plotW / labels.length;
    ctx.fillStyle = "#16211e";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, pad.left, 24);
    labels.forEach((label, i) => {
      const h = (values[i] / max) * plotH;
      const x = pad.left + i * groupW + groupW * 0.18;
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, pad.top + plotH - h, groupW * 0.64, h);
      ctx.strokeStyle = "#16211e";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, pad.top + plotH - h, groupW * 0.64, h);
      ctx.fillStyle = "#16211e";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(values[i]), x + groupW * 0.32, pad.top + plotH - h - 6);
      ctx.fillText(label, x + groupW * 0.32, height - 22);
    });
  }

  function drawReferenceHeatmap(metricNames, groupNames, medianMatrix, pValues, categories, categoryColors, title) {
    const width = Math.max(900, metricNames.length * 95);
    const height = 360;
    const ctx = prepareCanvas(width, height);
    const pad = { left: 110, right: 20, top: 70, bottom: 130 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const cellW = plotW / metricNames.length;
    const cellH = plotH / groupNames.length;
    let min = Infinity, max = -Infinity;
    medianMatrix.forEach((row) => row.forEach((v) => { if (v < min) min = v; if (v > max) max = v; }));
    medianMatrix.forEach((row, ri) => row.forEach((v, ci) => {
      const [r, g, b] = colorRamp(v, min, max);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(pad.left + ci * cellW, pad.top + ri * cellH, cellW + 0.5, cellH + 0.5);
      ctx.strokeStyle = "#16211e";
      ctx.strokeRect(pad.left + ci * cellW, pad.top + ri * cellH, cellW + 0.5, cellH + 0.5);
    }));
    ctx.fillStyle = "#16211e";
    ctx.font = "bold 12px sans-serif";
    groupNames.forEach((g, ri) => {
      ctx.textAlign = "right";
      ctx.fillText(g, pad.left - 6, pad.top + ri * cellH + cellH / 2 + 4);
    });
    metricNames.forEach((metric, ci) => {
      ctx.save();
      ctx.translate(pad.left + ci * cellW + cellW / 2, pad.top + groupNames.length * cellH + 8);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right";
      ctx.fillText(metric.slice(0, 26), 0, 0);
      ctx.restore();
      if (categories && categories[ci]) {
        ctx.fillStyle = categoryColors[categories[ci]] || "#999";
        ctx.fillRect(pad.left + ci * cellW, pad.top - 24, cellW, 14);
      }
    });
    const maxP = Math.max(...pValues.map((p) => -Math.log10(Math.max(p, 1e-323))));
    pValues.forEach((p, ci) => {
      const h = (-Math.log10(Math.max(p, 1e-323)) / maxP) * 45;
      ctx.fillStyle = p < 0.001 ? "#FF6B6B" : p < 0.05 ? "#FFA07A" : "#90d7ec";
      ctx.fillRect(pad.left + ci * cellW + 2, pad.top + groupNames.length * cellH + 40, Math.max(2, cellW - 4), h);
    });
    ctx.fillStyle = "#16211e";
    ctx.textAlign = "left";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(title, pad.left, 22);
  }

  function renderTable(headers, rows) {
    resultTable.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    resultTable.replaceChildren(thead, tbody);
  }

  function toCsv(headers, rows) {
    return [headers, ...rows].map((row) => row.map((cell) => (typeof cell === "number" ? String(cell) : cell)).join(",")).join("\n");
  }

  function showResult(title, subtitle, headers, rows) {
    resultPanel.classList.remove("hidden");
    resultTitle.textContent = title;
    resultSubtitle.textContent = subtitle || "";
    renderTable(headers, rows);
    state.lastCsv = toCsv(headers, rows);
  }

  function ensureRiskMSI() {
    if (!state.risk) runRisk();
    if (!state.msi) runMSI();
  }

  function groupOfSample(si) {
    ensureRiskMSI();
    const risk = state.risk.rows[si].cluster;
    const msi = state.msi[si].msi;
    return risk + msi;
  }

  function referenceGroups() {
    ensureRiskMSI();
    const order = ["iHRSL", "iHRSH", "iLRSL", "iLRSH"];
    const groups = order.map((name) => ({ name, values: [] }));
    const index = new Map(order.map((name, i) => [name, i]));
    state.parsed.samples.forEach((_, si) => {
      const gi = index.get(groupOfSample(si));
      if (gi !== undefined) groups[gi].values.push(si);
    });
    return groups;
  }

  function metricGroups(metricValues) {
    const groups = referenceGroups();
    return groups.map((g) => g.values.map((si) => metricValues[si]));
  }

  function moduleRunner(id) {
    if (!state.parsed && id !== "literature" && id !== "tools") throw new Error("Upload an expression matrix first.");
    if (id === "risk") {
      const rows = runRisk();
      const counts = {};
      rows.forEach((r) => { counts[r.cluster] = (counts[r.cluster] || 0) + 1; });
      drawCountBar(["iHRS", "iLRS"], [counts.iHRS || 0, counts.iLRS || 0], ["#d94f3d", "#0f766e"], "Risk classification");
      showResult("Risk classification", "Random forest probability and iHRS / iLRS assignment.", ["Sample", "iHRS probability", "iLRS probability", "Cluster"], rows.map((r) => [r.sample, r.ihRS.toFixed(4), r.ilRS.toFixed(4), r.cluster]));
    } else if (id === "msi") {
      const rows = runMSI();
      if (!state.risk) runRisk();
      const riskCats = ["iHRS", "iLRS"];
      const msiCats = ["H", "L"];
      const crossTab = {};
      riskCats.forEach((rc) => { crossTab[rc] = { H: 0, L: 0 }; });
      rows.forEach((r, si) => {
        const rc = state.risk.rows[si].cluster;
        crossTab[rc][r.msi] += 1;
      });
      const observed = riskCats.map((rc) => msiCats.map((mc) => crossTab[rc][mc]));
      drawPercentStackedBar(crossTab, msiCats, ["#f7acbc", "#99CCFF"], "Microsatellite status", contingencyChiSquareP(observed));
      showResult("Microsatellite status", "PreMSIm-style kNN prediction (k = 5).", ["Sample", "MSI status", "MSI-H neighbors", "MSI-L neighbors"], rows.map((r) => [r.sample, r.msi, r.high, r.low]));
    } else if (id === "risk-distribution") {
      if (!state.risk) runRisk();
      const vals = state.risk.rows.map((r) => r.ihRS);
      drawHistogram(vals, "#d94f3d");
      showResult("Risk score distribution", "Distribution of iHRS probability across samples.", ["Sample", "iHRS probability", "Cluster"], state.risk.rows.map((r) => [r.sample, r.ihRS.toFixed(4), r.cluster]));
    } else if (id === "deg") {
      if (!state.risk) runRisk();
      const points = runDEG();
      drawVolcano(points, "iHRS vs iLRS");
      const top = points.slice(0, 200);
      showResult("Differential expression", "Welch t-test between iHRS and iLRS samples.", ["Gene", "log2 fold change", "p-value", "-log10 p"], top.map((p) => [p.gene, p.logFC.toFixed(4), p.p.toExponential(3), p.negLogP.toFixed(3)]));
    } else if (id === "icms") {
      const { sets, scoresBySet, labels } = runHeatmapModule(id);
      const groups = referenceGroups();
      const groupNames = groups.map((g) => g.name);
      const colors = ["#f391a9", "#d71345", "#90d7ec", "#145b7d"];
      const groupValues = sets.map((_, gi) => groups.map((g) => g.values.map((si) => scoresBySet[gi][si])));
      drawGroupedBoxplots(labels, groupNames, groupValues, colors, "iCMS classification");
      const rows = state.parsed.samples.map((sample, si) => [sample, ...sets.map((_, gi) => formatNumber(scoresBySet[gi][si], 3))]);
      showResult("iCMS subtype", "ssGSEA scores for iCMS2 / iCMS3 signatures.", ["Sample", ...labels], rows);
    } else if (id === "cms") {
      const geneMap = geneIndexMap(state.parsed.genes);
      const classes = Object.keys(DATA.cms_templates || {});
      const markers = [...new Set(classes.flatMap((c) => DATA.cms_templates[c]))];
      const markerIdx = markers.map((g) => geneMap.get(g.toUpperCase())).filter((i) => i !== undefined);
      const z = markerIdx.map((gi) => {
        const vals = state.parsed.samples.map((_, si) => state.parsed.matrix[gi][si]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (vals.length - 1 || 1));
        return state.parsed.samples.map((_, si) => (sd > 1e-9 ? (vals[si] - mean) / sd : 0));
      });
      const corr = (a, b) => {
        const n = a.length; let ma = 0, mb = 0;
        a.forEach((v) => ma += v); b.forEach((v) => mb += v); ma /= n; mb /= n;
        let cov = 0, va = 0, vb = 0;
        for (let i = 0; i < n; i += 1) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
        return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
      };
      const templates = classes.map((c) => markers.map((g) => (DATA.cms_templates[c].includes(g) ? 1 : 0)));
      const rows = state.parsed.samples.map((sample, si) => {
        const sampleZ = z.map((row) => row[si]);
        const sims = templates.map((tpl) => corr(sampleZ, tpl));
        const best = classes[sims.indexOf(Math.max(...sims))];
        return { sample, cms: best, sims };
      });
      ensureRiskMSI();
      const riskCats = ["iHRSL", "iHRSH", "iLRSL", "iLRSH"];
      const crossTab = {};
      riskCats.forEach((rc) => { crossTab[rc] = {}; classes.forEach((c) => { crossTab[rc][c] = 0; }); });
      rows.forEach((r, si) => {
        const rc = riskCats.indexOf(groupOfSample(si)) >= 0 ? groupOfSample(si) : state.risk.rows[si].cluster + "L";
        if (crossTab[rc]) crossTab[rc][r.cms] += 1;
      });
      const observed = riskCats.map((rc) => classes.map((c) => crossTab[rc][c]));
      drawPercentStackedBar(crossTab, classes, ["#fcf16e", "#99CCFF", "#f7acbc", "#abc88b"], "CMS classification", contingencyChiSquareP(observed));
      showResult("CMS classification", "Nearest-template CMS1-4 prediction.", ["Sample", "CMS subtype", ...classes], rows.map((r) => [r.sample, r.cms, ...r.sims.map((v) => v.toFixed(3))]));
    } else if (id === "estimate") {
      const sets = moduleSets(id);
      const scoresBySet = computeSSGSEA(state.parsed.matrix, state.parsed.genes, sets, false);
      const immune = scoresBySet[0];
      const stromal = scoresBySet[1];
      const rows = state.parsed.samples.map((sample, si) => {
        const estimate = immune[si] + stromal[si];
        const purity = Math.cos(0.6049872018 + 0.0001467884 * estimate);
        return { sample, immune: immune[si], stromal: stromal[si], estimate, purity };
      });
      const metrics = ["ImmuneScore", "StromalScore", "ESTIMATEScore", "TumorPurity"];
      const groups = referenceGroups();
      const groupNames = groups.map((g) => g.name);
      const fieldMap = { ImmuneScore: "immune", StromalScore: "stromal", ESTIMATEScore: "estimate", TumorPurity: "purity" };
      const groupValues = metrics.map((metric) => groups.map((g) => g.values.map((si) => rows[si][fieldMap[metric]])));
      drawGroupedBoxplots(metrics, groupNames, groupValues, ["#f391a9", "#d71345", "#90d7ec", "#145b7d"], "ESTIMATE algorithm");
      showResult("ESTIMATE algorithm", "Immune, stromal, ESTIMATE, and tumor purity scores.", ["Sample", "ImmuneScore", "StromalScore", "ESTIMATEScore", "TumorPurity"], rows.map((r) => [r.sample, r.immune.toFixed(3), r.stromal.toFixed(3), r.estimate.toFixed(3), r.purity.toFixed(3)]));
    } else if (id === "ips") {
      const geneMap = geneIndexMap(state.parsed.genes);
      const ips = DATA.ips.filter((r) => geneMap.has(r.GENE.toUpperCase()));
      if (ips.length < 10) throw new Error("Too few IPS genes matched the input.");
      const groups = [];
      ips.forEach((r) => { if (!groups.includes(r.NAME)) groups.push(r.NAME); });
      const rows = state.parsed.samples.map((sample, si) => {
        const allVals = state.parsed.genes.map((_, gi) => state.parsed.matrix[gi][si]);
        const mean = allVals.reduce((a, b) => a + b, 0) / allVals.length;
        const sd = Math.sqrt(allVals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (allVals.length - 1 || 1));
        const z = (gi) => sd > 1e-9 ? (state.parsed.matrix[gi][si] - mean) / sd : 0;
        const wg = groups.map((name) => {
          const rowsFor = ips.filter((r) => r.NAME === name);
          const mig = rowsFor.reduce((a, r) => a + z(geneMap.get(r.GENE.toUpperCase())), 0) / rowsFor.length;
          const weight = rowsFor.reduce((a, r) => a + Number(r.WEIGHT), 0) / rowsFor.length;
          return mig * weight;
        });
        const meanSlice = (start, end) => wg.slice(start, end).reduce((a, b) => a + b, 0) / Math.max(1, end - start);
        const mhc = meanSlice(0, 10), cp = meanSlice(10, 20), ec = meanSlice(20, 24), sc = meanSlice(24, 26);
        const az = mhc + cp + ec + sc;
        const score = az <= 0 ? 0 : az >= 3 ? 10 : Math.round(az * 10 / 3);
        return { sample, mhc, cp, ec, sc, az, ips: score };
      });
      const metrics = ["MHC", "CP", "EC", "SC", "IPS"];
      const refGroups = referenceGroups();
      const groupNames = refGroups.map((g) => g.name);
      const groupValues = metrics.map((metric) => refGroups.map((g) => g.values.map((si) => rows[si][metric.toLowerCase()])));
      drawGroupedBoxplots(metrics, groupNames, groupValues, ["#f391a9", "#d71345", "#90d7ec", "#145b7d"], "Immunophenoscore");
      showResult("Immunophenoscore", "Weighted MHC, checkpoint, effector, and suppressor scores.", ["Sample", "MHC", "CP", "EC", "SC", "AZ", "IPS"], rows.map((r) => [r.sample, r.mhc.toFixed(3), r.cp.toFixed(3), r.ec.toFixed(3), r.sc.toFixed(3), r.az.toFixed(3), r.ips]));
    } else if (id === "xcell" || id === "mcpcounter") {
      const { sets, scoresBySet, labels } = runHeatmapModule(id);
      const groups = referenceGroups();
      const groupNames = groups.map((g) => g.name);
      const medianMatrix = groups.map((g) => labels.map((_, gi) => median(g.values.map((si) => scoresBySet[gi][si]))));
      const pValues = labels.map((_, gi) => kruskalWallisP(groups.map((g) => g.values.map((si) => scoresBySet[gi][si]))));
      drawReferenceHeatmap(labels, groupNames, medianMatrix, pValues, null, {}, id === "xcell" ? "xCell CAF" : "MCPcounter");
      const rows = state.parsed.samples.map((sample, si) => [sample, ...labels.map((_, gi) => formatNumber(scoresBySet[gi][si], 3))]);
      showResult(id === "xcell" ? "xCell CAF" : "MCPcounter", "Group median ssGSEA scores with Kruskal-Wallis p-values.", ["Sample", ...labels], rows);
    } else if (id === "tme-classifier") {
      const geneMap = geneIndexMap(state.parsed.genes);
      const cents = DATA.tme_centroids || [];
      const classes = ["TMEA", "TMEB", "TMEC"];
      const markers = cents.map((r) => ({ gene: r.genes, idx: geneMap.get(r.genes.toUpperCase()), centroid: classes.map((c) => Number(r[c])) })).filter((r) => r.idx !== undefined);
      const corr = (a, b) => {
        const n = a.length; let ma = 0, mb = 0;
        a.forEach((v) => ma += v); b.forEach((v) => mb += v); ma /= n; mb /= n;
        let cov = 0, va = 0, vb = 0;
        for (let i = 0; i < n; i += 1) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
        return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
      };
      const rows = state.parsed.samples.map((sample, si) => {
        const sampleZ = markers.map((m) => {
          const vals = state.parsed.samples.map((_, sj) => state.parsed.matrix[m.idx][sj]);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (vals.length - 1 || 1));
          return sd > 1e-9 ? (state.parsed.matrix[m.idx][si] - mean) / sd : 0;
        });
        const sims = classes.map((_, ci) => corr(sampleZ, markers.map((m) => m.centroid[ci])));
        return { sample, tme: classes[sims.indexOf(Math.max(...sims))], sims };
      });
      ensureRiskMSI();
      const riskCats = ["iHRSL", "iHRSH", "iLRSL", "iLRSH"];
      const crossTab = {};
      riskCats.forEach((rc) => { crossTab[rc] = {}; classes.forEach((c) => { crossTab[rc][c] = 0; }); });
      rows.forEach((r, si) => {
        const rc = groupOfSample(si);
        if (crossTab[rc]) crossTab[rc][r.tme] += 1;
      });
      const observed = riskCats.map((rc) => classes.map((c) => crossTab[rc][c]));
      drawPercentStackedBar(crossTab, classes, ["#f7acbc", "#fedcbd", "#99CCFF"], "TME classification", contingencyChiSquareP(observed));
      showResult("TME classification", "Nearest-centroid TMEA / TMEB / TMEC prediction.", ["Sample", "TME", ...classes], rows.map((r) => [r.sample, r.tme, ...r.sims.map((v) => v.toFixed(3))]));
    } else if (id === "tcell") {
      const { sets, scoresBySet, labels } = runHeatmapModule(id);
      const groups = referenceGroups();
      const groupNames = groups.map((g) => g.name);
      const medianMatrix = groups.map((g) => labels.map((_, gi) => median(g.values.map((si) => scoresBySet[gi][si]))));
      const pValues = labels.map((_, gi) => kruskalWallisP(groups.map((g) => g.values.map((si) => scoresBySet[gi][si]))));
      drawReferenceHeatmap(labels, groupNames, medianMatrix, pValues, null, {}, "T cell states");
      const rows = state.parsed.samples.map((sample, si) => [sample, ...labels.map((_, gi) => formatNumber(scoresBySet[gi][si], 3))]);
      showResult("T cell states", "TCellSI-inspired state scores with Kruskal-Wallis p-values.", ["Sample", ...labels], rows);
    } else if (id === "metabolic") {
      const { sets, scoresBySet, labels } = runHeatmapModule(id);
      const riskRows = state.risk.rows;
      const hIdx = [], lIdx = [];
      riskRows.forEach((r, si) => { if (r.cluster === "iHRS") hIdx.push(si); else lIdx.push(si); });
      const points = sets.map((set, gi) => {
        const a = hIdx.map((si) => scoresBySet[gi][si]);
        const b = lIdx.map((si) => scoresBySet[gi][si]);
        const p = welchTest(a, b);
        const fc = a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length;
        return { name: labels[gi], logFC: fc, fc, p, negLogP: Number.isFinite(p) ? -Math.log10(p) : 0 };
      });
      drawVolcano(points, "Metabolic flux: iHRS vs iLRS");
      showResult("Metabolic flux", "Metabolic pathway differential scores.", ["Pathway", "Mean difference", "p-value", "-log10 p"], points.map((p) => [p.name, p.fc.toFixed(3), p.p.toExponential(3), p.negLogP.toFixed(3)]));
    } else if (id === "pseudotime") {
      const parsed = state.parsed;
      const variances = parsed.genes.map((_, gi) => {
        const vals = parsed.samples.map((_, si) => parsed.matrix[gi][si]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { gi, var: vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length };
      }).sort((a, b) => b.var - a.var).slice(0, 200);
      const useGenes = variances.map((x) => x.gi);
      const X = useGenes.map((gi) => {
        const vals = parsed.samples.map((_, si) => parsed.matrix[gi][si]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.map((v) => v - mean);
      });
      const n = parsed.samples.length;
      const C = Array.from({ length: X.length }, (_, i) => Array.from({ length: X.length }, (_, j) => {
        let s = 0; for (let k = 0; k < n; k += 1) s += X[i][k] * X[j][k]; return s;
      }));
      const power = (M) => {
        let v = Array.from({ length: M.length }, (_, i) => i === 0 ? 1 : 0);
        for (let iter = 0; iter < 80; iter += 1) {
          const w = M.map((row) => row.reduce((s, val, j) => s + val * v[j], 0));
          const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
          v = w.map((x) => x / norm);
        }
        return v;
      };
      const pc1 = power(C);
      const pc1Score = parsed.samples.map((_, si) => X.reduce((s, geneRow, gi) => s + pc1[gi] * geneRow[si], 0));
      const meanPC = pc1Score.reduce((a, b) => a + b, 0) / pc1Score.length;
      const pseudotime = pc1Score.map((v) => v - meanPC);
      const rows = parsed.samples.map((sample, si) => ({ sample, pseudotime: pseudotime[si], pc1: pc1Score[si], group: state.risk.rows[si].cluster }));
      const groups = referenceGroups();
      const grpData = groups.map((g) => g.values.map((si) => pseudotime[si]));
      const p = kruskalWallisP(grpData);
      const ctx = prepareCanvas(760, 420);
      ctx.fillStyle = "#16211e"; ctx.font = "bold 14px sans-serif"; ctx.fillText("Pseudotime trajectory", 60, 24);
      ctx.fillStyle = "#5d6b65"; ctx.font = "12px sans-serif"; ctx.fillText("Kruskal-Wallis p = " + (Number.isFinite(p) ? p.toExponential(2) : "NA"), 60, 44);
      drawHistogram(pseudotime, "#d94f3d");
      showResult("Pseudotime trajectory", "PCA-based pseudotime across CRC risk groups.", ["Sample", "PC1", "Pseudotime", "Risk group"], rows.map((r) => [r.sample, r.pc1.toFixed(3), r.pseudotime.toFixed(3), r.group]));
    } else if (id === "literature") {
      const lit = DATA.literature || [];
      const yearCounts = {};
      lit.forEach((p) => { yearCounts[p.year] = (yearCounts[p.year] || 0) + 1; });
      const years = Object.keys(yearCounts).sort();
      drawCountBar(years, years.map((y) => yearCounts[y]), years.map(() => "#27e0d3"), "PubMed-indexed prognostic ML literature");
      resultPanel.classList.remove("hidden");
      resultTitle.textContent = "Prognostic ML literature";
      resultSubtitle.textContent = lit.length + " curated PubMed-indexed tumor prognosis machine-learning studies.";
      resultTable.innerHTML = "";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Title", "Journal", "Year", "PubMed"].forEach((h) => {
        const th = document.createElement("th"); th.textContent = h; trh.appendChild(th);
      });
      thead.appendChild(trh);
      const tbody = document.createElement("tbody");
      lit.forEach((p) => {
        const tr = document.createElement("tr");
        [p.title, p.journal, p.year].forEach((cell) => {
          const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td);
        });
        const linkTd = document.createElement("td");
        const a = document.createElement("a");
        a.href = "https://pubmed.ncbi.nlm.nih.gov/" + p.pmid + "/";
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = "PMID " + p.pmid;
        a.style.color = "#27e0d3";
        linkTd.appendChild(a);
        tr.appendChild(linkTd);
        tbody.appendChild(tr);
      });
      resultTable.replaceChildren(thead, tbody);
      state.lastCsv = "Title,Journal,Year,PubMed\n" + lit.map((p) => [p.title, p.journal, p.year, "https://pubmed.ncbi.nlm.nih.gov/" + p.pmid + "/"].join(",")).join("\n");
    } else if (id === "tools") {
      const tools = DATA.tools || [];
      const categoryCounts = {};
      tools.forEach((t) => { categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1; });
      const cats = Object.keys(categoryCounts);
      drawCountBar(cats, cats.map((c) => categoryCounts[c]), cats.map(() => "#f26bc9"), "Prognostic tools & packages");
      resultPanel.classList.remove("hidden");
      resultTitle.textContent = "Prognostic tools & packages";
      resultSubtitle.textContent = tools.length + " curated methods, software packages, and GitHub repositories.";
      resultTable.innerHTML = "";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      ["Name", "Language", "Category", "Description", "GitHub"].forEach((h) => {
        const th = document.createElement("th"); th.textContent = h; trh.appendChild(th);
      });
      thead.appendChild(trh);
      const tbody = document.createElement("tbody");
      tools.forEach((t) => {
        const tr = document.createElement("tr");
        [t.name, t.lang, t.category, t.desc].forEach((cell) => {
          const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td);
        });
        const linkTd = document.createElement("td");
        const a = document.createElement("a");
        a.href = t.url;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = "GitHub";
        a.style.color = "#f26bc9";
        linkTd.appendChild(a);
        tr.appendChild(linkTd);
        tbody.appendChild(tr);
      });
      resultTable.replaceChildren(thead, tbody);
      state.lastCsv = "Name,Language,Category,Description,GitHub\n" + tools.map((t) => [t.name, t.lang, t.category, t.desc, t.url].join(",")).join("\n");
    } else if (id === "hallmark" || id === "functions" || id === "immune" || id === "tme") {
      const { sets, scoresBySet, labels } = runHeatmapModule(id);
      const groups = referenceGroups();
      const groupNames = groups.map((g) => g.name);
      const topN = Math.min(20, labels.length);
      const pValues = labels.map((_, gi) => kruskalWallisP(groups.map((g) => g.values.map((si) => scoresBySet[gi][si]))));
      const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p).slice(0, topN).map((x) => x.i);
      const chosenLabels = order.map((i) => labels[i]);
      const medianMatrix = groups.map((g) => order.map((gi) => median(g.values.map((si) => scoresBySet[gi][si]))));
      const chosenP = order.map((i) => pValues[i]);
      drawReferenceHeatmap(chosenLabels, groupNames, medianMatrix, chosenP, null, {}, labels.length + " signatures");
      const rows = state.parsed.samples.map((sample, si) => [sample, ...order.map((gi) => formatNumber(scoresBySet[gi][si], 3))]);
      showResult("Molecular signatures", "Group median ssGSEA scores with Kruskal-Wallis p-values.", ["Sample", ...chosenLabels], rows);
    } else if (id === "immunomodulators") {
      const geneMap = geneIndexMap(state.parsed.genes);
      const genes = DATA.immunomod.map((x) => ({ gene: x.gene, category: x.category, index: geneMap.get(x.gene.toUpperCase()) })).filter((x) => x.index !== undefined);
      if (genes.length === 0) throw new Error("No immunomodulator genes matched the input.");
      const z = state.parsed.samples.map((_, si) => genes.map((g) => {
        const vals = state.parsed.samples.map((_, sj) => state.parsed.matrix[g.index][sj]);
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (vals.length - 1 || 1));
        return sd > 1e-9 ? (state.parsed.matrix[g.index][si] - mean) / sd : 0;
      }));
      drawHeatmap(z, state.parsed.samples, genes.map((g) => g.gene), "Immunomodulators");
      showResult("Immunomodulators", "Z-scored expression of immunomodulatory genes.", ["Sample", ...genes.map((g) => g.gene)], z.map((row, si) => [state.parsed.samples[si], ...row.map((v) => formatNumber(v, 3))]));
    }
  }

  function parseSurvival(text) {
    const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("Survival file is empty.");
    const delimiter = detectDelimiter(lines[0]);
    const header = splitLine(lines[0], delimiter).map(cleanField).map((s) => s.toLowerCase());
    let timeCol = header.findIndex((h) => h.includes("time") || h === "os" || h === "rfs" || h === "pfs" || h === "dfs");
    let statusCol = header.findIndex((h) => h.includes("status") || h.includes("event") || h.includes("dead"));
    if (timeCol < 0) timeCol = 1;
    if (statusCol < 0) statusCol = 2;
    const map = new Map();
    for (let li = 1; li < lines.length; li += 1) {
      const f = splitLine(lines[li], delimiter).map(cleanField);
      if (f.length < 3) continue;
      const sample = f[0].toUpperCase();
      const time = Number(f[timeCol]);
      const status = Number(f[statusCol]);
      if (!sample || !Number.isFinite(time) || !Number.isFinite(status)) continue;
      map.set(sample, { time, status });
    }
    return map;
  }

  function normalCdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function coxUnivariate(time, status, x) {
    const n = time.length;
    let beta = 0;
    for (let iter = 0; iter < 40; iter += 1) {
      let score = 0, info = 0;
      for (let i = 0; i < n; i += 1) {
        if (status[i] !== 1) continue;
        let denom = 0, xnum = 0, x2num = 0;
        for (let j = 0; j < n; j += 1) {
          if (time[j] >= time[i]) {
            const w = Math.exp(beta * x[j]);
            denom += w;
            xnum += x[j] * w;
            x2num += x[j] * x[j] * w;
          }
        }
        if (denom === 0) continue;
        const m = xnum / denom;
        score += x[i] - m;
        info += x2num / denom - m * m;
      }
      if (info <= 1e-12) break;
      const step = score / info;
      beta += step;
      if (Math.abs(step) < 1e-7) break;
    }
    const info = (() => {
      let info = 0;
      for (let i = 0; i < n; i += 1) {
        if (status[i] !== 1) continue;
        let denom = 0, xnum = 0, x2num = 0;
        for (let j = 0; j < n; j += 1) {
          if (time[j] >= time[i]) {
            const w = Math.exp(beta * x[j]);
            denom += w; xnum += x[j] * w; x2num += x[j] * x[j] * w;
          }
        }
        if (denom === 0) continue;
        const m = xnum / denom;
        info += x2num / denom - m * m;
      }
      return info;
    })();
    if (info <= 1e-12) return { hr: NaN, p: NaN, beta, se: NaN };
    const se = Math.sqrt(1 / info);
    const z = beta / se;
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    return { hr: Math.exp(beta), p, beta, se };
  }

  function runDiscovery() {
    if (!state.parsed) throw new Error("Upload an expression matrix first.");
    if (!state.survival) throw new Error("Upload survival data first.");
    const parsed = state.parsed;
    const sampleIndex = [];
    const times = [], statuses = [];
    parsed.samples.forEach((sample, si) => {
      const s = state.survival.get(sample.toUpperCase());
      if (s && Number.isFinite(s.time) && Number.isFinite(s.status)) {
        sampleIndex.push(si);
        times.push(s.time);
        statuses.push(s.status);
      }
    });
    if (times.length < 2) throw new Error("Fewer than two matched samples with survival data.");

    const denovoThreshold = Number($("#denovo-threshold").value) || 0.05;
    const minGenes = Math.max(1, Number($("#min-genes").value) || 5);
    const similarityThreshold = Number($("#similarity-threshold").value) || 0.5;

    const variances = parsed.genes.map((_, gi) => {
      const vals = sampleIndex.map((si) => parsed.matrix[gi][si]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { gi, var: vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length };
    }).sort((a, b) => b.var - a.var).slice(0, 2500);

    const results = variances.map(({ gi }) => {
      const x = sampleIndex.map((si) => parsed.matrix[gi][si]);
      const cox = coxUnivariate(times, statuses, x);
      return { gene: parsed.genes[gi], ...cox };
    }).filter((r) => Number.isFinite(r.hr) && Number.isFinite(r.p));

    const protective = results.filter((r) => r.hr < 1 && r.p < denovoThreshold).sort((a, b) => a.p - b.p);
    const risk = results.filter((r) => r.hr >= 1 && r.p < denovoThreshold).sort((a, b) => a.p - b.p);
    const jaccard = (a, b) => {
      const s = new Set(a); const inter = b.filter((x) => s.has(x)).length;
      return inter / (a.length + b.length - inter || 1);
    };
    const dedup = (list) => {
      const groups = list.map((r) => [r.gene]);
      const n = groups.length;
      const dist = Array.from({ length: n }, () => Array(n).fill(1));
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
        dist[i][j] = dist[j][i] = 1 - jaccard(groups[i], groups[j]);
      }
      const cluster = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (dist[i][j] <= 1 - similarityThreshold) cluster[j] = cluster[i];
        }
      }
      const merged = new Map();
      list.forEach((r, i) => {
        if (!merged.has(cluster[i])) merged.set(cluster[i], new Set());
        merged.get(cluster[i]).add(r.gene);
      });
      return [...merged.values()].map((s) => [...s]).filter((s) => s.length >= minGenes);
    };
    const hrgSets = dedup(risk);
    const lrgSets = dedup(protective);

    const ctx = discoveryCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    discoveryCanvas.width = 720 * dpr; discoveryCanvas.height = 320 * dpr;
    discoveryCanvas.style.width = "720px"; discoveryCanvas.style.height = "320px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 720, 320);
    ctx.fillStyle = "#e8f6f3"; ctx.font = "bold 15px JetBrains Mono, monospace"; ctx.fillText("Prognoser discovery", 24, 28);
    ctx.fillStyle = "#f26bc9"; ctx.font = "13px JetBrains Mono, monospace";
    ctx.fillText("HRGS sets: " + hrgSets.length + " · LRGS sets: " + lrgSets.length, 24, 50);
    ctx.fillStyle = "#8aa5a0";
    ctx.fillText("Protective genes: " + protective.length + " · Risk genes: " + risk.length, 24, 70);

    discoveryResults.classList.remove("hidden");
    const rows = [
      ["Protective genes (LRGS)", protective.slice(0, 100).map((r) => r.gene).join(", ")],
      ["Risk genes (HRGS)", risk.slice(0, 100).map((r) => r.gene).join(", ")],
    ];
    discoveryTable.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Direction", "Genes"].forEach((h) => { const th = document.createElement("th"); th.textContent = h; trh.appendChild(th); });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    discoveryTable.replaceChildren(thead, tbody);
    state.discovery = { protective, risk, hrgSets, lrgSets };
  }

  function normalQuantile(p) {
    if (p <= 0 || p >= 1) return 0;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function runPrognoserExample() {
    const endpoints = ["OS", "RFS", "PFS", "DFS"];
    const makeDataset = (seed) => {
      let state = seed;
      const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
      const gauss = () => { const u = Math.max(rand(), 1e-9), v = Math.max(rand(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const nSamples = 80, nGenes = 100;
      const risk = Array.from({ length: nSamples }, () => gauss());
      const mat = Array.from({ length: nGenes }, () => Array.from({ length: nSamples }, () => gauss()));
      for (let s = 0; s < nSamples; s += 1) {
        for (let g = 0; g < 10; g += 1) mat[g][s] += risk[s] * 2;
        for (let g = 10; g < 20; g += 1) mat[g][s] -= risk[s] * 2;
      }
      const survival = endpoints.map((_, ei) => {
        const sub = seed * 10 + ei + 1;
        return Array.from({ length: nSamples }, (_, s) => {
          const eps = gauss() * 0.3;
          const time = Math.max(0.05, Math.exp(2 - risk[s] + eps));
          const status = rand() < 0.7 ? 1 : 0;
          return { time: Number(time.toFixed(3)), status };
        });
      });
      return { genes: Array.from({ length: nGenes }, (_, i) => "GENE" + (i + 1)), samples: Array.from({ length: nSamples }, (_, i) => "S" + (i + 1)), mat, survival };
    };
    const datasets = [makeDataset(11), makeDataset(22), makeDataset(33)];
    const knowledge = [
      ["GENE1", "GENE2", "GENE3", "GENE11"],
      ["GENE4", "GENE5", "GENE6"],
      ["GENE7", "GENE8", "GENE14"],
      ["GENE9", "GENE10", "GENE15"],
      ["GENE11", "GENE12", "GENE13"],
      ["GENE16", "GENE17", "GENE18"],
      ["GENE19", "GENE20", "GENE1"],
      ["GENE2", "GENE4", "GENE6", "GENE8"],
      ["GENE3", "GENE5", "GENE7", "GENE9"],
      ["GENE10", "GENE12", "GENE14", "GENE16"],
    ];
    const perDataset = datasets.map((d) => {
      const genes = d.genes, samples = d.samples, mat = d.mat;
      const geneResults = genes.map((gene, gi) => {
        const endpointRes = endpoints.map((_, ei) => {
          const surv = d.survival[ei];
          const x = samples.map((_, si) => mat[gi][si]);
          const cox = coxUnivariate(surv.map((s) => s.time), surv.map((s) => s.status), x);
          return cox;
        });
        const valid = endpointRes.filter((r) => Number.isFinite(r.hr) && Number.isFinite(r.p));
        let combinedP = 1;
        if (valid.length > 0) {
          let zsum = 0;
          valid.forEach((r) => {
            const z = normalQuantile(1 - r.p / 2) * (Math.log(r.hr) >= 0 ? 1 : -1);
            zsum += z;
          });
          const z = zsum / Math.sqrt(valid.length);
          combinedP = 2 * (1 - normalCdf(Math.abs(z)));
          if (!Number.isFinite(combinedP)) combinedP = 1;
        }
        const meanHR = valid.length ? Math.exp(valid.reduce((a, r) => a + Math.log(r.hr), 0) / valid.length) : NaN;
        return { gene, hr: meanHR, p: combinedP };
      });
      return geneResults;
    });
    const fisherCombine = (arr) => {
      const ps = arr.map((x) => Math.max(1e-300, Math.min(1, x.p)));
      const chi2 = -2 * ps.reduce((a, p) => a + Math.log(p), 0);
      return chiSquareSurvival(chi2, 2 * ps.length);
    };
    const allGenes = datasets[0].genes;
    const merged = allGenes.map((gene) => {
      const across = perDataset.map((g) => g.find((x) => x.gene === gene));
      const combinedP = fisherCombine(across);
      const hrSign = across.reduce((a, x) => a + Math.sign(Math.log(x.hr)), 0) >= 0 ? 1 : -1;
      return { gene, p: combinedP, hr: hrSign === 1 ? 1.1 : 0.9 };
    });
    const denovoThreshold = 0.05;
    const geneThreshold = 0.01;
    const minGenes = 3;
    const similarityThreshold = 0.5;
    const protectivePool = merged.filter((g) => g.hr < 1 && g.p < denovoThreshold).map((g) => g.gene);
    const riskPool = merged.filter((g) => g.hr >= 1 && g.p < denovoThreshold).map((g) => g.gene);
    const purify = (list) => knowledge.map((set) => set.filter((g) => list.includes(g))).filter((s) => s.length > 0);
    const dedup = (list) => {
      const n = list.length;
      if (n === 0) return [];
      const jac = (a, b) => { const s = new Set(a); const inter = b.filter((x) => s.has(x)).length; return inter / (a.length + b.length - inter || 1); };
      const cluster = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (jac(list[i], list[j]) >= similarityThreshold) cluster[j] = cluster[i];
      const map = new Map();
      list.forEach((s, i) => { if (!map.has(cluster[i])) map.set(cluster[i], new Set()); s.forEach((g) => map.get(cluster[i]).add(g)); });
      return [...map.values()].map((s) => [...s]).filter((s) => s.length >= minGenes);
    };
    const lrgSets = dedup(purify(protectivePool));
    const hrgSets = dedup(purify(riskPool));
    const flat = (sets) => sets.map((s) => s.sort().join(", "));
    const renderSets = (sets) => sets.map((s, i) => (i + 1) + ". " + s.join(", ")).join("\n");
    const canvas = discoveryCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    discoveryCanvas.width = 720 * dpr; discoveryCanvas.height = 320 * dpr;
    discoveryCanvas.style.width = "720px"; discoveryCanvas.style.height = "320px";
    canvas.scale(dpr, dpr);
    canvas.clearRect(0, 0, 720, 320);
    canvas.fillStyle = "#e8f6f3"; canvas.font = "bold 16px JetBrains Mono, monospace"; canvas.fillText("Prognoser simulated example", 24, 30);
    canvas.fillStyle = "#f26bc9"; canvas.font = "13px JetBrains Mono, monospace";
    canvas.fillText("HRGS sets: " + hrgSets.length + " · LRGS sets: " + lrgSets.length, 24, 55);
    canvas.fillStyle = "#8aa5a0"; canvas.fillText("Expected: HRGS1 = GENE1-10 · LRGS1 = GENE11-20", 24, 76);
    discoveryResults.classList.remove("hidden");
    discoveryTable.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Direction", "Final gene sets"].forEach((h) => { const th = document.createElement("th"); th.textContent = h; trh.appendChild(th); });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    [
      ["HRGS", renderSets(hrgSets) || "None"],
      ["LRGS", renderSets(lrgSets) || "None"],
    ].forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    discoveryTable.replaceChildren(thead, tbody);
    state.discovery = { hrgSets, lrgSets };
  }

  function runMultiDiscovery() {
    const files = state.discoveryFiles && state.discoveryFiles.pairs;
    if (!files || files.size === 0) throw new Error("Upload multi-dataset expression and survival files first.");
    const datasets = new Map();
    files.forEach((pair, key) => {
      const idx = key.lastIndexOf("_");
      const dataset = key.slice(0, idx);
      const endpoint = key.slice(idx + 1);
      if (!datasets.has(dataset)) datasets.set(dataset, []);
      datasets.get(dataset).push({ endpoint, ...pair });
    });
    const denovoThreshold = Number($("#denovo-threshold").value) || 0.05;
    const geneThreshold = 0.01;
    const minGenes = Math.max(1, Number($("#min-genes").value) || 5);
    const fisher = (ps) => {
      const arr = ps.map((p) => Math.max(1e-300, Math.min(1, p)));
      const chi2 = -2 * arr.reduce((a, p) => a + Math.log(p), 0);
      return chiSquareSurvival(chi2, 2 * arr.length);
    };
    const allGenes = new Set();
    files.forEach((pair) => { if (pair.expr) pair.expr.genes.forEach((g) => allGenes.add(g)); });
    const geneList = [...allGenes];
    const datasetResults = [];
    datasets.forEach((endpointPairs, dataset) => {
      const geneRes = geneList.map((gene) => {
        const endpointRes = endpointPairs.filter((p) => p.expr && p.survival).map((p) => {
          const gi = p.expr.genes.findIndex((g) => g.toUpperCase() === gene.toUpperCase());
          if (gi < 0) return null;
          const sampleIndex = [];
          const times = [], statuses = [];
          p.expr.samples.forEach((sample, si) => {
            const s = p.survival.get(sample.toUpperCase());
            if (s && Number.isFinite(s.time) && Number.isFinite(s.status)) {
              sampleIndex.push(si); times.push(s.time); statuses.push(s.status);
            }
          });
          if (times.length < 2) return null;
          const x = sampleIndex.map((si) => p.expr.matrix[gi][si]);
          return coxUnivariate(times, statuses, x);
        }).filter(Boolean);
        const valid = endpointRes.filter((r) => Number.isFinite(r.hr) && Number.isFinite(r.p));
        if (!valid.length) return null;
        let zsum = 0;
        valid.forEach((r) => { zsum += normalQuantile(1 - r.p / 2) * (Math.log(r.hr) >= 0 ? 1 : -1); });
        const z = zsum / Math.sqrt(valid.length);
        const p = 2 * (1 - normalCdf(Math.abs(z)));
        const meanHR = Math.exp(valid.reduce((a, r) => a + Math.log(r.hr), 0) / valid.length);
        return { gene, hr: meanHR, p: Number.isFinite(p) ? p : 1 };
      }).filter(Boolean);
      datasetResults.push(geneRes);
    });
    const merged = geneList.map((gene) => {
      const across = datasetResults.map((res) => res.find((r) => r.gene === gene)).filter(Boolean);
      if (!across.length) return null;
      const combinedP = fisher(across.map((r) => r.p));
      const hrSign = across.reduce((a, r) => a + Math.sign(Math.log(r.hr)), 0) >= 0 ? 1 : -1;
      return { gene, p: combinedP, hr: hrSign === 1 ? 1.1 : 0.9 };
    }).filter(Boolean);
    const protective = merged.filter((r) => r.hr < 1 && r.p < denovoThreshold).sort((a, b) => a.p - b.p).map((r) => r.gene);
    const risk = merged.filter((r) => r.hr >= 1 && r.p < denovoThreshold).sort((a, b) => a.p - b.p).map((r) => r.gene);
    const hrgSets = risk.length ? [risk.slice(0, Math.max(minGenes, 1))] : [];
    const lrgSets = protective.length ? [protective.slice(0, Math.max(minGenes, 1))] : [];
    const canvas = discoveryCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    discoveryCanvas.width = 720 * dpr; discoveryCanvas.height = 320 * dpr;
    discoveryCanvas.style.width = "720px"; discoveryCanvas.style.height = "320px";
    canvas.scale(dpr, dpr);
    canvas.clearRect(0, 0, 720, 320);
    canvas.fillStyle = "#e8f6f3"; canvas.font = "bold 16px JetBrains Mono, monospace"; canvas.fillText("Multi-dataset prognostic discovery", 24, 30);
    canvas.fillStyle = "#f26bc9"; canvas.font = "13px JetBrains Mono, monospace";
    canvas.fillText("HRGS sets: " + hrgSets.length + " · LRGS sets: " + lrgSets.length, 24, 55);
    discoveryResults.classList.remove("hidden");
    discoveryTable.innerHTML = "";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["Direction", "Genes"].forEach((h) => { const th = document.createElement("th"); th.textContent = h; trh.appendChild(th); });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    [
      ["HRGS", (hrgSets[0] || []).slice(0, 100).join(", ") || "None"],
      ["LRGS", (lrgSets[0] || []).slice(0, 100).join(", ") || "None"],
    ].forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => { const td = document.createElement("td"); td.textContent = cell; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    discoveryTable.replaceChildren(thead, tbody);
  }

  function buildModules() {
    MODULES.forEach((m, index) => {
      const card = document.createElement("div");
      card.className = "module-card";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.innerHTML = `<span class="module-index">Module ${index + 1}</span><h3>${m.title}</h3><p>${m.desc}</p><span class="module-status ${m.requires ? "requires" : "ready"}">${m.requires ? "Model data required" : "Ready"}</span>`;
      card.addEventListener("click", () => {
        state.activeModule = m.id;
        document.querySelectorAll(".module-card").forEach((el) => el.classList.remove("active"));
        card.classList.add("active");
        if (m.requires) {
          warningBox.textContent = "This reference module requires an additional pre-trained model that is not bundled in the current browser version.";
          warningBox.classList.remove("hidden");
          resultPanel.classList.add("hidden");
          return;
        }
        try {
          moduleRunner(m.id);
          warningBox.classList.add("hidden");
        } catch (error) {
          warningBox.textContent = error.message;
          warningBox.classList.remove("hidden");
          resultPanel.classList.add("hidden");
        }
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); }
      });
      moduleGrid.appendChild(card);
    });
  }

  function makeExampleText() {
    const riskGeneSets = Object.entries(DATA.prognosis_genesets).map(([name, genes]) => ({
      name,
      genes,
      high: name.startsWith("HRGS"),
    }));
    const geneInfo = new Map();
    riskGeneSets.forEach((set) => {
      set.genes.forEach((gene) => {
        if (!geneInfo.has(gene)) geneInfo.set(gene, { high: false, low: false });
        if (set.high) geneInfo.get(gene).high = true;
        else geneInfo.get(gene).low = true;
      });
    });
    const unique = [...new Set(Object.values(DATA.prognosis_genesets).flat())];
    const msi = DATA.msi && DATA.msi.training;
    const msiGenes = msi ? msi.training.genes : [];
    const msiTemplates = { H: [], L: [] };
    if (msi) {
      msi.training.matrix.forEach((row, i) => {
        (msi.training.status[i] === 1 ? msiTemplates.H : msiTemplates.L).push(row.slice());
      });
    }
    const genes = [...unique, ...msiGenes.filter((g) => !unique.includes(g)), ...Array.from({ length: 500 }, (_, i) => "RANDOM" + (i + 1))];
    const msiIndex = new Map(msiGenes.map((g, i) => [g, i]));
    const samples = Array.from({ length: 1000 }, (_, i) => "Sample_" + (i + 1));
    let seed = 123456789;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const gauss = () => { const u = Math.max(random(), 1e-9); const v = Math.max(random(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const subtype = samples.map(() => (random() < 0.62 ? "H" : "L"));
    const rows = [["Gene", ...samples].join("\t")];
    genes.forEach((g, gi) => {
      const info = geneInfo.get(g);
      const base = 3.2 + (gi % 9) * 0.82;
      const msiPos = msiIndex.get(g);
      const vals = samples.map((_, si) => {
        const group = subtype[si];
        const msiSub = si % 5 === 0 ? "H" : "L";
        let log2;
        if (msiPos !== undefined) {
          const pool = msiTemplates[msiSub];
          log2 = pool[Math.floor(random() * pool.length)][msiPos] + gauss() * 0.05;
        } else {
          log2 = base + gauss() * 0.7;
          if (info) {
            if (info.high && !info.low) log2 += group === "H" ? 0.5 : -0.35;
            else if (info.low && !info.high) log2 += group === "H" ? -0.35 : 0.5;
          }
        }
        return Number(log2.toFixed(3));
      });
      rows.push([g, ...vals].join("\t"));
    });
    return rows.join("\n");
  }

  function loadExample() {
    loadTcgaExample();
  }

  async function fetchTcgaExampleText() {
    const response = await fetch("example_expression_matrix.tsv.gz");
    if (!response.ok) throw new Error("Unable to download the TCGA-CRC example file.");
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }

  function setExampleLoading(loading) {
    exampleBtn.disabled = loading;
    downloadExampleBtn.disabled = loading;
    if (loading) exampleBtn.textContent = "Loading example data…";
    else exampleBtn.innerHTML = exampleButtonHtml;
  }

  async function loadTcgaExample() {
    setExampleLoading(true);
    try {
      const text = await fetchTcgaExampleText();
      await handleFile(new File([text], "TCGA-CRC_example.tsv", { type: "text/plain;charset=utf-8" }));
    } catch (error) {
      warningBox.textContent = error.message;
      warningBox.classList.remove("hidden");
    } finally {
      setExampleLoading(false);
    }
  }

  async function downloadTcgaExample() {
    setExampleLoading(true);
    try {
      const text = await fetchTcgaExampleText();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "TCGA-CRC_example.tsv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      warningBox.textContent = error.message;
      warningBox.classList.remove("hidden");
    } finally {
      setExampleLoading(false);
    }
  }

  async function handleFile(file) {
    warningBox.classList.add("hidden");
    try {
      const text = await file.text();
      const parsed = parseMatrix(text);
      state.parsed = parsed;
      state.risk = null;
      state.msi = null;
      fileLine.classList.remove("hidden");
      fileName.textContent = file.name;
      fileSize.textContent = formatFileSize(file.size);
      summaryGrid.classList.remove("hidden");
      summaryGenes.textContent = String(parsed.genes.length);
      summarySamples.textContent = String(parsed.samples.length);
      const geneMap = geneIndexMap(parsed.genes);
      const matched = riskSets().filter((s) => s.genes.some((g) => geneMap.has(g.toUpperCase()))).length;
      summaryRiskSets.textContent = matched + " / " + riskSets().length;
      parseNote.textContent = [parsed.duplicateRows ? parsed.duplicateRows + " duplicate symbols averaged" : "", parsed.droppedMissing ? parsed.droppedMissing + " rows with missing values skipped" : ""].filter(Boolean).join(" · ") || "File parsed successfully.";
      resultPanel.classList.add("hidden");
    } catch (error) {
      warningBox.textContent = error.message;
      warningBox.classList.remove("hidden");
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
  });
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) handleFile(file);
  });
  resetBtn.addEventListener("click", () => {
    state.parsed = null;
    state.risk = null;
    state.msi = null;
    fileInput.value = "";
    fileLine.classList.add("hidden");
    summaryGrid.classList.add("hidden");
    parseNote.textContent = "";
    warningBox.classList.add("hidden");
    resultPanel.classList.add("hidden");
  });
  exampleBtn.addEventListener("click", loadExample);
  downloadExampleBtn.addEventListener("click", () => {
    downloadTcgaExample();
  });

  downloadCsvBtn.addEventListener("click", () => {
    if (!state.lastCsv) return;
    const blob = new Blob([state.lastCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prognoser_result.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  downloadPngBtn.addEventListener("click", () => {
    const url = mainCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "prognoser_chart.png";
    a.click();
  });

  function openLiterature() {
    warningBox.classList.add("hidden");
    moduleRunner("literature");
    resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (literatureNavBtn) literatureNavBtn.addEventListener("click", openLiterature);
  if (literatureCtaBtn) literatureCtaBtn.addEventListener("click", openLiterature);
  if (toolsNavBtn) toolsNavBtn.addEventListener("click", () => {
    warningBox.classList.add("hidden");
    moduleRunner("tools");
    resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  toolsCtaBtn.addEventListener("click", () => {
    warningBox.classList.add("hidden");
    moduleRunner("tools");
    resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  discoveryFilesDropzone.addEventListener("click", () => discoveryFilesInput.click());
  discoveryFilesDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); discoveryFilesInput.click(); }
  });
  discoveryFilesInput.addEventListener("change", async () => {
    const files = Array.from(discoveryFilesInput.files || []);
    if (!files.length) return;
    try {
      const pairs = new Map();
      for (const file of files) {
        const match = file.name.match(/^(.+)_(OS|RFS|PFS|DFS|OS_time|RFS_time|PFS_time|DFS_time)(_survival)?\.(tsv|csv|txt)$/i);
        if (!match) continue;
        const key = match[1].toUpperCase() + "_" + match[2].toUpperCase();
        const text = await file.text();
        if (match[3]) {
          if (!pairs.has(key)) pairs.set(key, {});
          pairs.get(key).survival = parseSurvival(text);
        } else {
          if (!pairs.has(key)) pairs.set(key, {});
          pairs.get(key).expr = parseMatrix(text);
        }
      }
      if (pairs.size === 0) throw new Error("No valid files matched the naming convention Dataset_Endpoint(_survival).");
      state.discoveryFiles = { pairs };
      discoveryFilesLine.classList.remove("hidden");
      discoveryFilesName.textContent = files.length + " files";
      discoveryFilesSize.textContent = pairs.size + " dataset-endpoint pairs";
      discoveryWarning.classList.add("hidden");
    } catch (error) {
      discoveryWarning.textContent = error.message;
      discoveryWarning.classList.remove("hidden");
    }
  });
  runDiscoveryBtn.addEventListener("click", () => {
    try {
      runMultiDiscovery();
      discoveryWarning.classList.add("hidden");
    } catch (error) {
      discoveryWarning.textContent = error.message;
      discoveryWarning.classList.remove("hidden");
    }
  });
  loadPrognoserExampleBtn.addEventListener("click", () => {
    try {
      runPrognoserExample();
      discoveryWarning.classList.add("hidden");
      discoveryResults.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      discoveryWarning.textContent = error.message;
      discoveryWarning.classList.remove("hidden");
    }
  });
  prognoserDemoBtn.addEventListener("click", () => {
    try {
      runPrognoserExample();
      discoveryWarning.classList.add("hidden");
      discoveryResults.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      discoveryWarning.textContent = error.message;
      discoveryWarning.classList.remove("hidden");
    }
  });

  buildModules();
})();
