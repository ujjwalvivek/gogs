import { Chart } from "chart.js/auto";
import {
  BenchmarkProfile,
  BenchmarkRun,
  BenchFrame,
  BenchCondition,
} from "../../shared/schema";
import { FAVICON_DATA, FONT_DATA } from "./assets";

interface State {
  journeyRun: BenchmarkRun | null;
  tinytsRun: BenchmarkRun | null;
  activeTab: string;
  particles: {
    collision: "none" | "grid";
    entityCount: number;
  };
  bytes: any | null;
}

const state: State = {
  journeyRun: null,
  tinytsRun: null,
  activeTab: "particles",
  particles: {
    collision: "none",
    entityCount: 32768,
  },
  bytes: {
    journey: {
      wasmRawBytes: 3062088,
      wasmGzipBytes: 1460045,
      wasmBrotliBytes: 1201288,
      jsGlueRawBytes: 98780,
      jsGlueGzipBytes: 17607,
      jsGlueBrotliBytes: 14822,
      totalTransferGzipBytes: 1477652,
      totalTransferBrotliBytes: 1216110,
    },
    tinyts: {
      bundleRawBytes: 129414,
      bundleGzipBytes: 37240,
      bundleBrotliBytes: 32001,
    },
  },
};

const chartInstances: { [key: string]: Chart | null } = {};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeStats(frames: BenchFrame[]) {
  if (!frames || frames.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, fps: 0, min: 0, max: 0 };
  }
  const times = frames.map((f) => f.frameTimeMs).sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    mean,
    fps: 1000 / mean,
    min: times[0],
    max: times[times.length - 1],
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getCondition(
  run: BenchmarkRun | null | undefined,
  name: string,
): BenchCondition | undefined {
  return run?.conditions.find((c) => c.conditionName === name);
}

function meanFor(
  run: BenchmarkRun | null | undefined,
  name: string,
): number | null {
  const condition = getCondition(run, name);
  return condition ? computeStats(condition.frames).mean : null;
}

function hasCondition(name: string): boolean {
  return Boolean(
    getCondition(state.journeyRun, name) || getCondition(state.tinytsRun, name),
  );
}

function conditionCountsFor(prefix: string, counts: number[]): number[] {
  return counts.filter((count) => hasCondition(`${prefix}_${count}`));
}

function getRunWarnings(data: BenchmarkRun): string[] {
  const warnings: string[] = [];
  if ((data as any).benchmarkVersion !== "v1") {
    warnings.push("Legacy JSON: lacks v1 metadata.");
  }
  if (!data.conditions || data.conditions.length === 0) {
    warnings.push("No conditions recorded.");
    return warnings;
  }
  for (const condition of data.conditions) {
    if (!condition.frames || condition.frames.length === 0) {
      warnings.push(`${condition.conditionName}: no frames.`);
      continue;
    }
    if (
      condition.suiteId === "particles" ||
      condition.conditionName.startsWith("render_")
    ) {
      const maxEntities = Math.max(
        ...condition.frames.map((frame) => frame.entityCount || 0),
      );
      if (
        condition.entityTarget > 0 &&
        maxEntities < condition.entityTarget * 0.9
      ) {
        warnings.push(
          `${condition.conditionName}: reached ${maxEntities}/${condition.entityTarget} entities.`,
        );
      }
    }
  }
  return warnings.slice(0, 5);
}

function renderCanvasChart(canvasId: string, config: any) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId]?.destroy();
    chartInstances[canvasId] = null;
  }
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  chartInstances[canvasId] = new Chart(ctx, config);
}

const chartTheme = {
  textColor: "#c0caf5",
  mutedColor: "#9aa5ce",
  gridColor: "rgba(192, 202, 245, 0.12)",
  journeyColor: "#7aa2f7",
  journeyFill: "rgba(122, 162, 247, 0.22)",
  tinytsColor: "#e0af68",
  tinytsFill: "rgba(224, 175, 104, 0.24)",
  warningColor: "#e0af68",
  dangerColor: "#f7768e",
  skyColor: "#7dcfff",
  sapphireColor: "#2ac3de",
  mauveColor: "#bb9af7",
  pinkColor: "#ff9e64",
  surfaceColor: "rgba(192, 202, 245, 0.16)",
};

Chart.defaults.font.family = '"TinyTS", Consolas, monospace';
Chart.defaults.font.size = 7.5;
Chart.defaults.color = chartTheme.textColor;
const legendLabelDefaults = Chart.defaults.plugins.legend.labels as any;
legendLabelDefaults.boxWidth = 12;
legendLabelDefaults.boxHeight = 6;
legendLabelDefaults.padding = 8;

const benchmarkWindowFeatures = "width=800,height=450";

function waitForMessage(
  _win: Window | null,
  type: string,
  timeoutMs = 0,
  filter?: (data: any) => boolean,
): Promise<any | null> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function handler(e: MessageEvent) {
      if (e.data?.type === type && (!filter || filter(e.data))) {
        if (timer) clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(e.data);
      }
    }
    window.addEventListener("message", handler);

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, timeoutMs);
    }
  });
}

async function runAutomation(
  forceWebGL2 = false,
  profile: BenchmarkProfile = "standard",
) {
  const shouldShare = new URLSearchParams(window.location.search).has("share");
  const statusBanner = document.getElementById("status-banner");
  const statusText = document.getElementById("status-title-text");
  const progressBar = document.getElementById("status-progress");
  const pctLabel = document.getElementById("status-pct");

  const params = new URLSearchParams();
  params.set("profile", profile);
  if (forceWebGL2) params.set("renderer", "webgl2");
  const urlSuffix = `?${params.toString()}`;

  const journeyWin = window.open(
    `/journey-bench/index.html${urlSuffix}`,
    "_blank",
    benchmarkWindowFeatures,
  );

  const tinytsWin = window.open(
    `/tinyts-bench/index.html${urlSuffix}`,
    "_blank",
    `${benchmarkWindowFeatures},left=820`,
  );

  if (statusBanner) statusBanner.style.display = "flex";
  if (statusText)
    statusText.textContent = "Launching Journey benchmark window...";
  if (progressBar) progressBar.style.width = "2%";
  if (pctLabel) pctLabel.innerText = "2%";

  const tinytsLoadedPromise = waitForMessage(
    tinytsWin,
    "BENCH_LOADED",
    300000,
    (d) => d.engine === "tinyts",
  );

  const journeyErrorCleanup = () => {
    window.removeEventListener("message", journeyErrorHandler);
  };
  const journeyErrorHandler = (e: MessageEvent) => {
    if (e.data?.type === "BENCH_ERROR" && e.data?.engine === "journey") {
      if (statusText) statusText.textContent = `Journey error: ${e.data.error}`;
    }
  };
  window.addEventListener("message", journeyErrorHandler);

  const journeyLoaded = await waitForMessage(
    journeyWin,
    "BENCH_LOADED",
    30000,
    (d) => d.engine === "journey",
  );
  if (!journeyLoaded) {
    journeyErrorCleanup();
    if (statusText) statusText.textContent = "Journey window failed to load.";
    tinytsWin?.close();
    if (statusBanner)
      setTimeout(() => {
        statusBanner.style.display = "none";
      }, 3000);
    return;
  }
  journeyErrorCleanup();

  if (statusText)
    statusText.textContent = `Running Journey ${profile} benchmark...`;
  journeyWin?.postMessage({ type: "BENCH_START" }, "*");

  let journeyData: BenchmarkRun | null = null;

  const progressHandler = (e: MessageEvent) => {
    if (e.data?.type === "BENCH_PROGRESS") {
      const pct = Math.round(
        (e.data.conditionIndex / e.data.totalConditions) * 100,
      );
      const halfPct = Math.round(pct / 2);
      if (progressBar) progressBar.style.width = `${halfPct}%`;
      if (pctLabel) pctLabel.innerText = `${halfPct}%`;
      if (statusText) {
        statusText.textContent = `[Journey] Condition ${e.data.conditionIndex}/${e.data.totalConditions}: ${e.data.currentCondition}`;
      }
    }
  };
  window.addEventListener("message", progressHandler);

  const completeMsg = await waitForMessage(journeyWin, "BENCH_COMPLETE", 0);
  if (!completeMsg) {
    if (statusText) statusText.textContent = "Journey benchmark timed out.";
    window.removeEventListener("message", progressHandler);
    journeyWin?.close();
    tinytsWin?.close();
    if (journeyData) loadRunData("journey", journeyData);
    return;
  }
  journeyErrorCleanup();
  journeyData = completeMsg.payload;
  window.removeEventListener("message", progressHandler);
  journeyWin?.close();

  if (statusText) statusText.textContent = "Waiting for TinyTS to load...";
  if (progressBar) progressBar.style.width = "52%";
  if (pctLabel) pctLabel.innerText = "52%";

  const tinytsLoaded = await tinytsLoadedPromise;

  if (!tinytsLoaded) {
    if (statusText)
      statusText.textContent = "TinyTS window failed to load — skipping.";
    if (progressBar) progressBar.style.width = "100%";
    if (pctLabel) pctLabel.innerText = "100%";
    tinytsWin?.close();
    setTimeout(() => {
      if (statusBanner) statusBanner.style.display = "none";
    }, 3000);
    if (journeyData) loadRunData("journey", journeyData);
    return;
  }

  if (statusText)
    statusText.textContent = `Running TinyTS ${profile} benchmark...`;
  tinytsWin?.postMessage({ type: "BENCH_START" }, "*");

  const tProgressHandler = (e: MessageEvent) => {
    if (e.data?.type === "BENCH_PROGRESS") {
      const pct = Math.round(
        (e.data.conditionIndex / e.data.totalConditions) * 100,
      );
      const nextHalfPct = 50 + Math.round(pct / 2);
      if (progressBar) progressBar.style.width = `${nextHalfPct}%`;
      if (pctLabel) pctLabel.innerText = `${nextHalfPct}%`;
      if (statusText) {
        statusText.textContent = `[TinyTS] Condition ${e.data.conditionIndex}/${e.data.totalConditions}: ${e.data.currentCondition}`;
      }
    }
  };
  window.addEventListener("message", tProgressHandler);

  const tCompleteMsg = await waitForMessage(tinytsWin, "BENCH_COMPLETE", 0);
  if (!tCompleteMsg) {
    if (statusText) statusText.textContent = "TinyTS benchmark timed out.";
    window.removeEventListener("message", tProgressHandler);
    tinytsWin?.close();
    if (journeyData) loadRunData("journey", journeyData);
    return;
  }
  const tinytsData = tCompleteMsg.payload;
  window.removeEventListener("message", tProgressHandler);
  tinytsWin?.close();

  if (statusText)
    statusText.innerText = "Automation complete! Rendering results...";
  if (progressBar) progressBar.style.width = "100%";
  if (pctLabel) pctLabel.innerText = "100%";

  if (shouldShare) {
    const merged = { journey: journeyData, tinyts: tinytsData };
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        const { id } = await res.json();
        console.log("📎 Share link: https://gogs.ujjwalvivek.com/?id=" + id);
        if (statusText) statusText.innerText = `Shared as ?id=${id}`;
      }
    } catch (err) {
      console.error("Share upload failed:", err);
    }
  }

  setTimeout(() => {
    if (statusBanner) statusBanner.style.display = "none";
  }, 3000);

  loadRunData("journey", journeyData!);
  loadRunData("tinyts", tinytsData);
}

function browserSummary(userAgent: string): string {
  const chrome = userAgent.match(/Chrome\/([\d.]+)/);
  const firefox = userAgent.match(/Firefox\/([\d.]+)/);
  const safari = !chrome && userAgent.match(/Version\/([\d.]+).*Safari/);
  if (chrome) return `Chrome ${chrome[1].split(".")[0]}`;
  if (firefox) return `Firefox ${firefox[1].split(".")[0]}`;
  if (safari) return `Safari ${safari[1].split(".")[0]}`;
  return "Browser unknown";
}

function updateSidebarMeta(
  engine: "journey" | "tinyts",
  data: BenchmarkRun | null,
) {
  const container = document.getElementById(`meta-${engine}`);
  if (!container) return;

  if (!data) {
    container.innerHTML = `<div class="empty-state" style="padding: 10px; border: none;">No data loaded</div>`;
    return;
  }

  const rendererBadge = data.rendererForced
    ? `<span class="badge badge-warn">Forced ${data.renderer}</span>`
    : `<span class="badge badge-info">Auto ${data.renderer}</span>`;
  const warnings = getRunWarnings(data);
  const warningHtml =
    warnings.length > 0
      ? `<div class="meta-item meta-wide">
            <div class="meta-value meta-warning">${warnings.map((w) => `- ${w}`).join("<br/>")}</div>
        </div>`
      : `<div class="meta-item meta-wide">
            <div class="meta-value meta-ok">Basic checks passed</div>
        </div>`;

  container.innerHTML = `
        <div class="meta-badges">
            <span class="badge badge-${engine}">${engine}</span>
            <span class="badge badge-info">${(data as any).profile || "unknown"}</span>
            <span class="badge badge-info">${data.conditions?.length || 0} conditions</span>
            <span class="badge badge-info">${data.platform || "platform unknown"}</span>
            <span class="badge badge-info">${browserSummary(data.userAgent || "")}</span>
            ${rendererBadge}
        </div>
        <div class="meta-row">
            <span>Version</span>
            <strong>${(data as any).benchmarkVersion || "legacy"}</strong>
        </div>
        <div class="meta-row">
            <span>Renderer</span>
            <strong>${data.gpuRenderer || "unknown"}</strong>
        </div>
        <div class="meta-row">
            <span>Recorded</span>
            <strong>${new Date(data.recordedAt).toLocaleString()}</strong>
        </div>
        <div class="meta-row">
            <span>First frame</span>
            <strong>${(data.loadProfile?.timeToFirstFrameMs || 0).toFixed(1)}ms</strong>
        </div>
        <div class="meta-row">
            <span>Interactive</span>
            <strong>${(data.loadProfile?.timeToInteractiveMs || 0).toFixed(1)}ms</strong>
        </div>
        ${warningHtml}
    `;
}

function loadRunData(engine: "journey" | "tinyts", data: BenchmarkRun) {
  if (engine === "journey") {
    state.journeyRun = data;
  } else {
    state.tinytsRun = data;
  }

  updateSidebarMeta(engine, data);

  if (state.journeyRun && state.tinytsRun) {
    document.getElementById("btn-export")?.removeAttribute("disabled");
    document.getElementById("btn-export-json")?.removeAttribute("disabled");
  }

  updateDashboard();
}

function loadJsonPayload(payload: unknown) {
  const data = payload as any;
  if (data?.journey && data?.tinyts) {
    loadRunData("journey", data.journey as BenchmarkRun);
    loadRunData("tinyts", data.tinyts as BenchmarkRun);
    return;
  }
  if (data?.engine === "journey" || data?.engine === "tinyts") {
    loadRunData(data.engine, data as BenchmarkRun);
    return;
  }
  throw new Error(
    "Expected a combined raw export or a single Journey/TinyTS BenchmarkRun JSON.",
  );
}

function updateDashboard() {
  const hasData = state.journeyRun || state.tinytsRun;
  const landingPanel = document.getElementById("landing-panel");
  const dashboardTabs = document.getElementById("dashboard-tabs");
  if (landingPanel) landingPanel.style.display = hasData ? "none" : "grid";
  if (dashboardTabs) dashboardTabs.style.display = hasData ? "flex" : "none";
  document.querySelectorAll<HTMLElement>(".tab-panel").forEach((panel) => {
    panel.style.display = hasData ? "" : "none";
  });

  const suites = ["particles", "rendering", "audio", "ecs-verlet"];
  suites.forEach((suite) => {
    const emptyEl = document.getElementById(`empty-${suite}`);
    const contentEl = document.getElementById(`content-${suite}`);

    if (hasData) {
      if (emptyEl) emptyEl.style.display = "none";
      if (contentEl) contentEl.style.display = "flex";
    } else {
      if (emptyEl) emptyEl.style.display = "block";
      if (contentEl) contentEl.style.display = "none";
    }
  });

  if (!hasData) return;

  if (state.activeTab === "particles") {
    renderParticlesTab();
  } else if (state.activeTab === "rendering") {
    renderRenderingTab();
  } else if (state.activeTab === "audio") {
    renderAudioTab();
  } else if (state.activeTab === "ecs-verlet") {
    renderEcsVerletTab();
  } else if (state.activeTab === "bundle") {
    renderBundleTab();
  }
}

function renderParticlesTab() {
  const colMode = state.particles.collision;
  const sizeFilter = state.particles.entityCount;

  const jConds =
    state.journeyRun?.conditions.filter(
      (c) => c.suiteId === "particles" && c.collisionMode === colMode,
    ) || [];
  const tConds =
    state.tinytsRun?.conditions.filter(
      (c) => c.suiteId === "particles" && c.collisionMode === colMode,
    ) || [];

  const counts = [1024, 8192, 16384, 32768, 65536].filter((count) => {
    return Boolean(
      jConds.find((c) => c.entityTarget === count) ||
      tConds.find((c) => c.entityTarget === count),
    );
  });
  const jFpsData = counts.map((count) => {
    const cond = jConds.find((c) => c.entityTarget === count);
    return cond ? computeStats(cond.frames).fps : null;
  });
  const tFpsData = counts.map((count) => {
    const cond = tConds.find((c) => c.entityTarget === count);
    return cond ? computeStats(cond.frames).fps : null;
  });

  renderCanvasChart("chart-particles-fps", {
    type: "line",
    data: {
      labels: counts.map((c) => c.toLocaleString()),
      datasets: [
        {
          label: "Journey (Rust/WASM)",
          data: jFpsData,
          borderColor: chartTheme.journeyColor,
          backgroundColor: chartTheme.journeyFill,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
        {
          label: "TinyTS (TypeScript)",
          data: tFpsData,
          borderColor: chartTheme.tinytsColor,
          backgroundColor: chartTheme.tinytsFill,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Frames per Second",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jP50 = counts.map((count) => {
    const c = jConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p50 : null;
  });
  const jP95 = counts.map((count) => {
    const c = jConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p95 : null;
  });
  const jP99 = counts.map((count) => {
    const c = jConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p99 : null;
  });
  const tP50 = counts.map((count) => {
    const c = tConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p50 : null;
  });
  const tP95 = counts.map((count) => {
    const c = tConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p95 : null;
  });
  const tP99 = counts.map((count) => {
    const c = tConds.find((cond) => cond.entityTarget === count);
    return c ? computeStats(c.frames).p99 : null;
  });

  renderCanvasChart("chart-particles-percentiles", {
    type: "line",
    data: {
      labels: counts.map((c) => c.toLocaleString()),
      datasets: [
        {
          label: "Journey P50",
          data: jP50,
          borderColor: chartTheme.pinkColor,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
        },
        {
          label: "Journey P95",
          data: jP95,
          borderColor: chartTheme.dangerColor,
          borderDash: [2, 2],
          fill: false,
          tension: 0.1,
        },
        {
          label: "Journey P99",
          data: jP99,
          borderColor: chartTheme.journeyColor,
          borderWidth: 3,
          fill: false,
          tension: 0.1,
        },
        {
          label: "TinyTS P50",
          data: tP50,
          borderColor: chartTheme.skyColor,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
        },
        {
          label: "TinyTS P95",
          data: tP95,
          borderColor: chartTheme.sapphireColor,
          borderDash: [2, 2],
          fill: false,
          tension: 0.1,
        },
        {
          label: "TinyTS P99",
          data: tP99,
          borderColor: chartTheme.tinytsColor,
          borderWidth: 3,
          fill: false,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Frame Latency (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: {
        legend: { labels: { color: chartTheme.textColor, boxWidth: 15 } },
      },
    },
  });

  const activeJCond = jConds.find((c) => c.entityTarget === sizeFilter);
  const activeTCond = tConds.find((c) => c.entityTarget === sizeFilter);
  const jStats = computeStats(activeJCond?.frames || []);
  const tStats = computeStats(activeTCond?.frames || []);

  document.getElementById("stat-j-fps")!.innerText =
    jStats.fps > 0 ? `${jStats.fps.toFixed(1)}` : "N/A";
  document.getElementById("stat-t-fps")!.innerText =
    tStats.fps > 0 ? `${tStats.fps.toFixed(1)}` : "N/A";
  document.getElementById("stat-j-p99")!.innerText =
    jStats.p99 > 0 ? `${jStats.p99.toFixed(1)} ms` : "N/A";
  document.getElementById("stat-t-p99")!.innerText =
    tStats.p99 > 0 ? `${tStats.p99.toFixed(1)} ms` : "N/A";

  const jRolling =
    activeJCond?.frames.slice(-120).map((f) => f.frameTimeMs) || [];
  const tRolling =
    activeTCond?.frames.slice(-120).map((f) => f.frameTimeMs) || [];
  const maxLen = Math.max(jRolling.length, tRolling.length);
  const rollingLabels = Array.from({ length: maxLen }, (_, i) => i.toString());

  renderCanvasChart("chart-particles-rolling", {
    type: "line",
    data: {
      labels: rollingLabels,
      datasets: [
        {
          label: "Journey",
          data: jRolling,
          borderColor: chartTheme.journeyColor,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
        },
        {
          label: "TinyTS",
          data: tRolling,
          borderColor: chartTheme.tinytsColor,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Frame Delta (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jRawTimes = activeJCond?.frames.map((f) => f.frameTimeMs) || [];
  const tRawTimes = activeTCond?.frames.map((f) => f.frameTimeMs) || [];

  const buckets = ["0-4ms", "4-8ms", "8-12ms", "12-16ms", "16ms+"];
  const computeBuckets = (times: number[]) => {
    const counts = [0, 0, 0, 0, 0];
    times.forEach((t) => {
      if (t <= 4) counts[0]++;
      else if (t <= 8) counts[1]++;
      else if (t <= 12) counts[2]++;
      else if (t <= 16) counts[3]++;
      else counts[4]++;
    });
    return counts;
  };

  renderCanvasChart("chart-particles-histogram", {
    type: "bar",
    data: {
      labels: buckets,
      datasets: [
        {
          label: "Journey",
          data: computeBuckets(jRawTimes),
          backgroundColor: chartTheme.journeyColor,
        },
        {
          label: "TinyTS",
          data: computeBuckets(tRawTimes),
          backgroundColor: chartTheme.tinytsColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Frame Count",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jMem =
    activeJCond?.frames.map((f) =>
      f.jsHeapBytes ? f.jsHeapBytes / 1024 / 1024 : 0,
    ) || [];
  const tMem =
    activeTCond?.frames.map((f) =>
      f.jsHeapBytes ? f.jsHeapBytes / 1024 / 1024 : 0,
    ) || [];
  const memLen = Math.max(jMem.length, tMem.length);
  const memLabels = Array.from({ length: memLen }, (_, i) => i.toString());

  renderCanvasChart("chart-particles-memory", {
    type: "line",
    data: {
      labels: memLabels,
      datasets: [
        {
          label: "Journey (JS Host Heap)",
          data: jMem.filter((x) => x > 0),
          borderColor: chartTheme.journeyColor,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
        },
        {
          label: "TinyTS (JS Heap)",
          data: tMem.filter((x) => x > 0),
          borderColor: chartTheme.tinytsColor,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { display: false } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "JS Heap Allocation (MB)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });
}

function renderRenderingTab() {
  const workloads = [
    { label: "Rect Flood (32k)", name: "render_rect_flood_32768" },
    { label: "Mixed Shapes (32k)", name: "render_mixed_shapes_32768" },
    { label: "Textured Sprites (16k)", name: "render_texture_sprites_16384" },
    { label: "Bloom Load (16k)", name: "render_bloom_16384" },
    { label: "TinyTS Post-FX Stack (16k)", name: "render_post_fx_stack_16384" },
  ].filter((w) => hasCondition(w.name));

  const jTimes = workloads.map((w) => {
    return meanFor(state.journeyRun, w.name);
  });

  const tTimes = workloads.map((w) => {
    return meanFor(state.tinytsRun, w.name);
  });

  renderCanvasChart("chart-rendering-workloads", {
    type: "bar",
    data: {
      labels: workloads.map((w) => w.label),
      datasets: [
        {
          label: "Journey",
          data: jTimes,
          backgroundColor: chartTheme.journeyColor,
        },
        {
          label: "TinyTS",
          data: tTimes,
          backgroundColor: chartTheme.tinytsColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Latency (ms) - Lower is Better",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const rectCounts = conditionCountsFor(
    "render_rect_flood",
    [1024, 4096, 8192, 16384, 32768],
  );
  const drawCalls = rectCounts.map((count) => {
    const cond = state.tinytsRun?.conditions.find(
      (c) => c.conditionName === `render_rect_flood_${count}`,
    );
    if (!cond || cond.frames.length === 0) return 0;
    return (
      cond.frames.reduce((sum, f) => sum + (f.drawCalls || 0), 0) /
      cond.frames.length
    );
  });
  const batchFlushes = rectCounts.map((count) => {
    const cond = state.tinytsRun?.conditions.find(
      (c) => c.conditionName === `render_rect_flood_${count}`,
    );
    if (!cond || cond.frames.length === 0) return 0;
    return (
      cond.frames.reduce((sum, f) => sum + (f.batchFlushes || 0), 0) /
      cond.frames.length
    );
  });

  renderCanvasChart("chart-rendering-drawcalls", {
    type: "line",
    data: {
      labels: rectCounts.map((c) => c.toLocaleString()),
      datasets: [
        {
          label: "Draw Calls",
          data: drawCalls,
          borderColor: chartTheme.warningColor,
          backgroundColor: "rgba(224,175,104,0.14)",
          fill: true,
          tension: 0.1,
        },
        {
          label: "Batch Flushes",
          data: batchFlushes,
          borderColor: chartTheme.tinytsColor,
          backgroundColor: chartTheme.tinytsFill,
          fill: true,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Count per Frame",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jBaseline = meanFor(state.journeyRun, "render_rect_flood_16384");
  const jBloom = meanFor(state.journeyRun, "render_bloom_16384");
  const tBaseline = meanFor(state.tinytsRun, "render_rect_flood_16384");
  const tBloom = meanFor(state.tinytsRun, "render_bloom_16384");

  renderCanvasChart("chart-rendering-bloom-cost", {
    type: "bar",
    data: {
      labels: ["Journey", "TinyTS"],
      datasets: [
        {
          label: "Baseline (16k Rects, No Bloom)",
          data: [jBaseline, tBaseline],
          backgroundColor: chartTheme.surfaceColor,
        },
        {
          label: "With Bloom Shader Enabled",
          data: [jBloom, tBloom],
          backgroundColor: [chartTheme.journeyColor, chartTheme.tinytsColor],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Time (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });
}

function renderAudioTab() {
  const polyphonyCounts = conditionCountsFor(
    "audio_polyphony",
    [4, 8, 16, 32, 64],
  );
  const jPoly = polyphonyCounts.map((count) => {
    const c = state.journeyRun?.conditions.find(
      (cond) => cond.conditionName === `audio_polyphony_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });
  const tPoly = polyphonyCounts.map((count) => {
    const c = state.tinytsRun?.conditions.find(
      (cond) => cond.conditionName === `audio_polyphony_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });

  renderCanvasChart("chart-audio-polyphony", {
    type: "line",
    data: {
      labels: polyphonyCounts.map((c) => `${c} Voices`),
      datasets: [
        {
          label: "Journey Synthesizer (WASM synth)",
          data: jPoly,
          borderColor: chartTheme.journeyColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
        {
          label: "TinyTS (Web Audio API osc)",
          data: tPoly,
          borderColor: chartTheme.tinytsColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Time (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const bpms = conditionCountsFor("audio_sequencer", [120, 180, 240]);
  const jBpm = bpms.map((bpm) => {
    const c = state.journeyRun?.conditions.find(
      (cond) => cond.conditionName === `audio_sequencer_${bpm}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });
  const tBpm = bpms.map((bpm) => {
    const c = state.tinytsRun?.conditions.find(
      (cond) => cond.conditionName === `audio_sequencer_${bpm}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });

  renderCanvasChart("chart-audio-sequencer", {
    type: "bar",
    data: {
      labels: bpms.map((b) => `${b} BPM`),
      datasets: [
        {
          label: "Journey (+ 8k particles)",
          data: jBpm,
          backgroundColor: chartTheme.journeyColor,
        },
        {
          label: "TinyTS (+ 8k particles)",
          data: tBpm,
          backgroundColor: chartTheme.tinytsColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Time (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });
}

function renderEcsVerletTab() {
  const ropeCounts = conditionCountsFor("verlet_ropes", [10, 50, 100, 200]);
  const jRopes = ropeCounts.map((count) => {
    const c = state.journeyRun?.conditions.find(
      (cond) => cond.conditionName === `verlet_ropes_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });
  const tRopes = ropeCounts.map((count) => {
    const c = state.tinytsRun?.conditions.find(
      (cond) => cond.conditionName === `verlet_ropes_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });

  renderCanvasChart("chart-verlet-ropes", {
    type: "line",
    data: {
      labels: ropeCounts.map((c) => `${c} Ropes`),
      datasets: [
        {
          label: "Journey Verlet Ropes",
          data: jRopes,
          borderColor: chartTheme.journeyColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
        {
          label: "TinyTS Verlet Ropes",
          data: tRopes,
          borderColor: chartTheme.tinytsColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Time (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const pointCounts = conditionCountsFor(
    "verlet_points",
    [1024, 4096, 8192, 16384],
  );
  const jPoints = pointCounts.map((count) => {
    const c = state.journeyRun?.conditions.find(
      (cond) => cond.conditionName === `verlet_points_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });
  const tPoints = pointCounts.map((count) => {
    const c = state.tinytsRun?.conditions.find(
      (cond) => cond.conditionName === `verlet_points_${count}`,
    );
    return c ? computeStats(c.frames).mean : null;
  });

  renderCanvasChart("chart-verlet-points", {
    type: "line",
    data: {
      labels: pointCounts.map((c) => `${c} Points`),
      datasets: [
        {
          label: "Journey Points",
          data: jPoints,
          borderColor: chartTheme.journeyColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
        {
          label: "TinyTS Points",
          data: tPoints,
          borderColor: chartTheme.tinytsColor,
          fill: false,
          tension: 0.1,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
        },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Mean Frame Time (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const churnTime = meanFor(state.tinytsRun, "ecs_churn_1000");
  const viewCounts = conditionCountsFor(
    "ecs_view_query",
    [10000, 30000, 60000],
  );
  const viewTimes = viewCounts.map((count) => {
    return meanFor(state.tinytsRun, `ecs_view_query_${count}`);
  });
  const hierarchyTime = meanFor(state.tinytsRun, "ecs_hierarchy_10000");
  const ecsLabels = [
    "Entity Churn (1000/F)",
    ...viewCounts.map(
      (count) => `View Query (${(count / 1000).toFixed(0)}k Ent)`,
    ),
    "Hierarchy Bind (10k Ent)",
  ];
  const ecsData = [churnTime, ...viewTimes, hierarchyTime];

  renderCanvasChart("chart-ecs-tinyts", {
    type: "bar",
    data: {
      labels: ecsLabels,
      datasets: [
        {
          label: "TinyTS ECS Workloads (Frame Time ms)",
          data: ecsData,
          backgroundColor: [
            "rgba(122, 162, 247, 0.42)",
            "rgba(125, 207, 255, 0.54)",
            "rgba(42, 195, 222, 0.66)",
            "rgba(187, 154, 247, 0.72)",
            "rgba(224, 175, 104, 0.78)",
          ],
          borderWidth: 1,
          borderColor: chartTheme.skyColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Frame Time Cost (ms)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderBundleTab() {
  const b = state.bytes;
  if (!b) return;

  renderCanvasChart("chart-bundle-size", {
    type: "bar",
    data: {
      labels: ["Raw / Minified", "Gzip Compression", "Brotli Compression"],
      datasets: [
        {
          label: "Journey Total (WASM + JS glue)",
          data: [
            (b.journey.wasmRawBytes + b.journey.jsGlueRawBytes) / 1024,
            b.journey.totalTransferGzipBytes / 1024,
            b.journey.totalTransferBrotliBytes / 1024,
          ],
          backgroundColor: chartTheme.journeyColor,
        },
        {
          label: "TinyTS (Unified Bundle)",
          data: [
            b.tinyts.bundleRawBytes / 1024,
            b.tinyts.bundleGzipBytes / 1024,
            b.tinyts.bundleBrotliBytes / 1024,
          ],
          backgroundColor: chartTheme.tinytsColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Size in Kilobytes (KB)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jL = state.journeyRun?.loadProfile;
  const tL = state.tinytsRun?.loadProfile;

  const jFetch = jL?.wasmFetchMs || 0;
  const jCompile = jL?.wasmCompileMs || 0;
  const jInst = jL?.wasmInstantiateMs || 0;
  const jFirstFrame = jL?.timeToFirstFrameMs || 0;

  const tParse = tL?.jsParseDurationMs || 0;
  const tFirstFrame = tL?.timeToFirstFrameMs || 0;

  renderCanvasChart("chart-bundle-load", {
    type: "bar",
    data: {
      labels: ["Journey (Rust/WASM)", "TinyTS (TypeScript)"],
      datasets: [
        {
          label: "Download / Fetch",
          data: [jFetch, 0],
          backgroundColor: "rgba(122, 162, 247, 0.45)",
        },
        {
          label: "Compile WASM / Parse JS",
          data: [jCompile, tParse],
          backgroundColor: "rgba(187, 154, 247, 0.62)",
        },
        {
          label: "WASM Instantiate",
          data: [jInst, 0],
          backgroundColor: "rgba(247, 118, 142, 0.72)",
        },
        {
          label: "Time to First Frame",
          data: [
            jFirstFrame - (jFetch + jCompile + jInst),
            tFirstFrame - tParse,
          ],
          backgroundColor: chartTheme.warningColor,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Time in Milliseconds (ms)",
            color: chartTheme.textColor,
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { color: chartTheme.textColor },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });

  const jM = state.journeyRun?.memoryProfile;
  const tM = state.tinytsRun?.memoryProfile;

  renderCanvasChart("chart-bundle-mem-checkpoints", {
    type: "bar",
    data: {
      labels: ["Idle Base Heap", "Peak Load (65k)", "After Stop/Teardown"],
      datasets: [
        {
          label: "Journey (WASM Linear Memory + Host JS)",
          data: [
            ((jM?.wasmLinearMemoryInitialBytes || 0) +
              (jM?.jsHeapAtIdleBytes || 0)) /
              1024 /
              1024,
            ((jM?.wasmLinearMemoryAt65kBytes || 0) +
              (jM?.jsHeapAt65kBytes || 0)) /
              1024 /
              1024,
            ((jM?.wasmLinearMemoryAt65kBytes || 0) +
              (jM?.jsHeapAfterStopBytes || 0)) /
              1024 /
              1024,
          ],
          backgroundColor: chartTheme.journeyColor,
        },
        {
          label: "TinyTS (JS V8 Heap)",
          data: [
            (tM?.jsHeapAtIdleBytes || 0) / 1024 / 1024,
            (tM?.jsHeapAt65kBytes || 0) / 1024 / 1024,
            (tM?.jsHeapAfterStopBytes || 0) / 1024 / 1024,
          ],
          backgroundColor: chartTheme.tinytsColor,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: chartTheme.textColor } },
        y: {
          grid: { color: chartTheme.gridColor },
          ticks: { color: chartTheme.textColor },
          title: {
            display: true,
            text: "Memory in Megabytes (MB)",
            color: chartTheme.textColor,
          },
        },
      },
      plugins: { legend: { labels: { color: chartTheme.textColor } } },
    },
  });
}

function handleCsvExport() {
  if (!state.journeyRun || !state.tinytsRun) return;

  let csvContent = "";
  csvContent +=
    [
      "Engine",
      "Version",
      "Profile",
      "Suite",
      "Condition",
      "WorkloadKind",
      "EntityCount",
      "Frames",
      "MeanFrameTimeMs",
      "P50FrameTimeMs",
      "P95FrameTimeMs",
      "P99FrameTimeMs",
      "MeanFPS",
      "Notes",
    ].join(",") + "\n";

  const addRunToCsv = (run: BenchmarkRun) => {
    run.conditions.forEach((cond: BenchCondition) => {
      const stats = computeStats(cond.frames);
      const row = [
        run.engine,
        (run as any).benchmarkVersion || "legacy",
        (run as any).profile || "",
        cond.suiteId,
        cond.conditionName,
        (cond as any).workloadKind || "",
        cond.entityTarget,
        cond.frames.length,
        stats.mean.toFixed(3),
        stats.p50.toFixed(3),
        stats.p95.toFixed(3),
        stats.p99.toFixed(3),
        stats.fps.toFixed(2),
        (cond as any).notes || "",
      ]
        .map(csvEscape)
        .join(",");
      csvContent += row + "\n";
    });
  };

  addRunToCsv(state.journeyRun);
  addRunToCsv(state.tinytsRun);

  downloadBlob(
    `gogs_benchmark_summary_${new Date().toISOString().split("T")[0]}.csv`,
    csvContent,
    "text/csv;charset=utf-8",
  );
}

function handleRawJsonExport() {
  if (!state.journeyRun || !state.tinytsRun) return;

  const payload = {
    exportedAt: new Date().toISOString(),
    journey: state.journeyRun,
    tinyts: state.tinytsRun,
  };

  downloadBlob(
    `gogs_benchmark_raw_${new Date().toISOString().split("T")[0]}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  const faviconLink =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (faviconLink) faviconLink.href = FAVICON_DATA;

  const fontStyle = document.createElement("style");
  fontStyle.textContent = `@font-face { font-family: "TinyTS"; src: url(${FONT_DATA}); font-weight: 400; font-style: normal; font-display: block; }`;
  document.head.appendChild(fontStyle);

  const urlParams = new URLSearchParams(window.location.search);
  const sharedId = urlParams.get("id");
  if (sharedId) {
    try {
      const res = await fetch(`/s/${sharedId}`);
      if (res.ok) {
        const payload = await res.json();
        loadJsonPayload(payload);
      }
    } catch (err) {
      console.error("Failed to load shared benchmark:", err);
    }
  }

  const controls = document.querySelector(".button-sidebar");
  const sidebar = document.querySelector(".sidebar");
  if (controls && sidebar && controls.parentElement !== sidebar) {
    sidebar.prepend(controls);
  }

  const landing = document.getElementById("landing-panel");
  const dashboard = document.querySelector(".dashboard-content");
  if (landing && dashboard && landing.parentElement !== dashboard) {
    dashboard.prepend(landing);
  }

  updateDashboard();

  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      const target = btn.getAttribute("data-tab") || "particles";
      btn.classList.add("active");

      const panels = document.querySelectorAll(".tab-panel");
      panels.forEach((p) => p.classList.remove("active"));
      document.getElementById(`panel-${target}`)?.classList.add("active");

      state.activeTab = target;
      updateDashboard();
    });
  });

  const subTabButtons = document.querySelectorAll(
    "#particles-collision-tabs .sub-tab-btn",
  );
  subTabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      subTabButtons.forEach((b) => b.classList.remove("active"));
      const col = btn.getAttribute("data-collision") as any;
      btn.classList.add("active");
      state.particles.collision = col;
      updateDashboard();
    });
  });

  const sizeSelect = document.getElementById(
    "particles-entity-select",
  ) as HTMLSelectElement;
  if (sizeSelect) {
    sizeSelect.addEventListener("change", () => {
      state.particles.entityCount = parseInt(sizeSelect.value);
      updateDashboard();
    });
  }

  const setupFileUpload = (id: string) => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) {
      input.addEventListener("change", (e) => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target?.result as string);
            loadJsonPayload(parsed);
          } catch (err) {
            alert(`Failed to parse benchmark JSON file: ${err}`);
          }
        };
        reader.readAsText(file);
      });
    }
  };
  setupFileUpload("upload-json");

  document
    .getElementById("btn-export")
    ?.addEventListener("click", handleCsvExport);
  document
    .getElementById("btn-export-json")
    ?.addEventListener("click", handleRawJsonExport);

  document.fonts.ready.then(() => {
    const el = document.getElementById("app-loading");
    if (el) el.classList.add("hide");
  });

  (window as any).runAutomation = runAutomation;
});
