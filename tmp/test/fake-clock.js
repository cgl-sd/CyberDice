/** 测试用假时钟：同步推进时间与定时器，便于确定性测试状态机 */
function createFakeClock(startAt) {
  let t = startAt || 0;
  let seq = 0;
  const timers = new Map();

  return {
    now: function () {
      return t;
    },
    setTimeout: function (fn, ms) {
      seq += 1;
      timers.set(seq, { fn: fn, at: t + (ms || 0) });
      return seq;
    },
    clearTimeout: function (id) {
      timers.delete(id);
    },
    /** 推进时间，按到期顺序同步触发定时器 */
    advance: function (ms) {
      const end = t + ms;
      for (;;) {
        let nextId = null;
        let nextAt = Infinity;
        timers.forEach(function (tm, id) {
          if (tm.at <= end && tm.at < nextAt) {
            nextAt = tm.at;
            nextId = id;
          }
        });
        if (nextId === null) {
          break;
        }
        const tm = timers.get(nextId);
        timers.delete(nextId);
        t = Math.max(t, tm.at);
        tm.fn();
      }
      t = end;
    },
    pendingCount: function () {
      return timers.size;
    },
  };
}

module.exports = { createFakeClock };
