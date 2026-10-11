export function readDemoValue(key: string): unknown {
  const value = window.localStorage.getItem(key);
  return value === null ? null : JSON.parse(value);
}

export function writeDemoValue(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
