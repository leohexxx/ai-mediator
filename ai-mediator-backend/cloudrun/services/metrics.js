// Lightweight per-instance operational metrics. CloudBase log alerts should
// aggregate these counters across instances; no case/user identifiers are kept.
var startedAt = new Date().toISOString();
var counters = {};
var gauges = {};
var timings = {};

function increment(name, value) {
  counters[name] = (counters[name] || 0) + (value == null ? 1 : value);
}

function gauge(name, value) {
  gauges[name] = Number(value) || 0;
}

function observe(name, milliseconds) {
  var current = timings[name] || { count: 0, totalMs: 0, maxMs: 0 };
  current.count++;
  current.totalMs += Number(milliseconds) || 0;
  current.maxMs = Math.max(current.maxMs, Number(milliseconds) || 0);
  timings[name] = current;
}

function snapshot() {
  var timingSnapshot = {};
  Object.keys(timings).forEach(function (name) {
    var value = timings[name];
    timingSnapshot[name] = {
      count: value.count,
      averageMs: value.count ? Math.round(value.totalMs / value.count) : 0,
      maxMs: Math.round(value.maxMs),
    };
  });
  return { startedAt: startedAt, counters: Object.assign({}, counters), gauges: Object.assign({}, gauges), timings: timingSnapshot };
}

function startStructuredLogging(intervalMs) {
  var delay = Math.max(15000, Number(intervalMs) || 60000);
  var timer = setInterval(function () {
    console.log(JSON.stringify({ event: 'operational_metrics', timestamp: new Date().toISOString(), metrics: snapshot() }));
  }, delay);
  if (timer.unref) timer.unref();
  return { close: function () { clearInterval(timer); } };
}

module.exports = { increment: increment, gauge: gauge, observe: observe, snapshot: snapshot, startStructuredLogging: startStructuredLogging };
