const KEY = "lorro-performance-mode";

export const isPerformanceMode = () => localStorage.getItem(KEY) === "1";

export const applyPerformanceMode = () => {
  document.body.classList.toggle("lorro-performance-mode", isPerformanceMode());
};

export const setPerformanceMode = (value: boolean) => {
  localStorage.setItem(KEY, value ? "1" : "0");
  applyPerformanceMode();
};