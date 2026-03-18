interface ESDTimerEntry {
  callback: (...args: unknown[]) => void;
  params: unknown[];
}

interface ESDWorkerInstance extends Worker {
  timerId: number;
  timers: Record<number, ESDTimerEntry>;
}

interface ESDTimerMessage {
  type?: string;
  id: number;
}

const ESDDefaultTimeouts = {
  timeout: 0,
  interval: 10,
} as const;

Object.freeze(ESDDefaultTimeouts);

// Worker function body is extracted via .toString() at runtime.
// The interior is not type-checked by TS since it runs inside a Web Worker scope.
function timerFn() {
  const timers: Record<number, ReturnType<typeof setTimeout>> = {};
  const debug = false;
  const supportedCommands = ["setTimeout", "setInterval", "clearTimeout", "clearInterval"];

  function log() {
    console.log("Worker-Info::Timers", timers);
  }

  function clearTimerAndRemove(id: number) {
    if (timers[id]) {
      if (debug) console.log("clearTimerAndRemove", id, timers[id], timers);
      clearTimeout(timers[id]);
      delete timers[id];
      postMessage({ type: "clearTimer", id: id });
      if (debug) log();
    }
  }

  onmessage = function (e: MessageEvent) {
    if (supportedCommands.includes(e.data.type) && timers[e.data.id]) {
      clearTimerAndRemove(e.data.id);
    }
    if (e.data.type === "setTimeout") {
      timers[e.data.id] = setTimeout(
        () => {
          postMessage({ id: e.data.id });
          clearTimerAndRemove(e.data.id);
        },
        Math.max(e.data.delay || 0),
      );
    } else if (e.data.type === "setInterval") {
      timers[e.data.id] = setInterval(
        () => {
          postMessage({ id: e.data.id });
        },
        Math.max(e.data.delay || ESDDefaultTimeouts.interval),
      );
    }
  };
}

const ESDTimerWorker = new Worker(
  URL.createObjectURL(
    new Blob(
      [
        timerFn
          .toString()
          .replace(/^[^{]*{\s*/, "")
          .replace(/\s*}[^}]*$/, ""),
      ],
      { type: "text/javascript" },
    ),
  ),
) as ESDWorkerInstance;

ESDTimerWorker.timerId = 1;
ESDTimerWorker.timers = {};

function _setTimer(callback: (...args: unknown[]) => void, delay: number, type: string, params: unknown[]): number {
  const id = ESDTimerWorker.timerId++;
  ESDTimerWorker.timers[id] = { callback, params };
  ESDTimerWorker.onmessage = (e: MessageEvent<ESDTimerMessage>) => {
    const entry = ESDTimerWorker.timers[e.data.id];
    if (entry) {
      if (e.data.type === "clearTimer") {
        delete ESDTimerWorker.timers[e.data.id];
      } else {
        const cb = entry.callback;
        if (cb && typeof cb === "function") cb(...entry.params);
      }
    }
  };
  ESDTimerWorker.postMessage({ type, id, delay });
  return id;
}

function _setTimeoutESD(callback: (...args: unknown[]) => void, delay = 0, ...params: unknown[]): number {
  return _setTimer(callback, delay, "setTimeout", params);
}

function _setIntervalESD(callback: (...args: unknown[]) => void, delay = 0, ...params: unknown[]): number {
  return _setTimer(callback, delay, "setInterval", params);
}

function _clearTimeoutESD(id: number): void {
  ESDTimerWorker.postMessage({ type: "clearTimeout", id });
  delete ESDTimerWorker.timers[id];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).setTimeout = _setTimeoutESD;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).setInterval = _setIntervalESD;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).clearTimeout = _clearTimeoutESD;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).clearInterval = _clearTimeoutESD;
