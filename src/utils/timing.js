const { performance } = require('perf_hooks');

function sanitizeToken(name) {
  return String(name || 'step').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

function createTimer() {
  const start = performance.now();
  const marks = [];
  let last = start;

  function mark(name) {
    const now = performance.now();
    const dur = now - last;
    marks.push({ name: sanitizeToken(name), dur });
    last = now;
    return dur;
  }

  function total() {
    return performance.now() - start;
  }

  function header() {
    const parts = marks.map((m) => `${m.name};dur=${m.dur.toFixed(1)}`);
    parts.push(`total;dur=${total().toFixed(1)}`);
    return parts.join(', ');
  }

  function summary() {
    return {
      steps: marks.map((m) => ({ name: m.name, ms: Number(m.dur.toFixed(1)) })),
      totalMs: Number(total().toFixed(1)),
    };
  }

  return { mark, header, summary };
}

module.exports = { createTimer };

