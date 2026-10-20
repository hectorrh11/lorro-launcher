const KEY = "lorro-performance-mode";

export const isPerformanceMode = () => localStorage.getItem(KEY) === "1";

export const applyPerformanceMode = () => {
  document.body.classList.toggle("lorro-performance-mode", isPerformanceMode());
};

export const setPerformanceMode = (value: boolean) => {
  localStorage.setItem(KEY, value ? "1" : "0");
  applyPerformanceMode();
};

export const applyLorroRewards = () => {
  const raw = localStorage.getItem("lorro-rewards");
  const rewards: string[] = raw ? JSON.parse(raw) : [];
  document.body.classList.toggle("lorro-reward-gold", rewards.includes("gold"));
  document.body.classList.toggle(
    "lorro-reward-emerald",
    rewards.includes("emerald")
  );
};