const ISSUES_URL = "https://github.com/hectorrh11/lorro-launcher/issues/new";

const buildBody = () =>
  [
    "### Describe tu comentario",
    "",
    "",
    "### Informacion del sistema",
    "",
    `- Lorro Launcher: ${navigator.userAgent}`,
    "",
    "<!-- Este comentario es publico en GitHub y lo gestiona Lorro. No se envia a Lorro. -->",
  ].join("\n");

let feedbackButton: HTMLButtonElement | null = null;
let feedbackButtonSuppressed = false;

const applyFeedbackButtonVisibility = () => {
  if (!feedbackButton) return;
  feedbackButton.style.display = feedbackButtonSuppressed ? "none" : "";
};

export function setLorroFeedbackButtonSuppressed(suppressed: boolean) {
  feedbackButtonSuppressed = suppressed;
  applyFeedbackButtonVisibility();
}

export function installLorroFeedbackButton() {
  if (window.location.hash.startsWith("#/big-picture")) return;
  if (document.getElementById("lorro-feedback-button")) return;

  const mount = () => {
    const button = document.createElement("button");
    button.id = "lorro-feedback-button";
    button.type = "button";
    button.textContent = "Comentarios";
    button.title =
      "Abrir un comentario en GitHub. Lo ve la comunidad de Lorro, no Lorro.";
    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      bottom: "56px",
      zIndex: "2147483000",
      padding: "8px 14px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.16)",
      background: "#211e1b",
      color: "#ece7df",
      font: "500 13px system-ui, -apple-system, 'Segoe UI', sans-serif",
      cursor: "pointer",
      boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
      opacity: "0.92",
    });
    button.addEventListener("mouseenter", () => {
      button.style.opacity = "1";
    });
    button.addEventListener("mouseleave", () => {
      button.style.opacity = "0.92";
    });
    button.addEventListener("click", () => {
      const url = `${ISSUES_URL}?title=${encodeURIComponent(
        "[Comentario] "
      )}&body=${encodeURIComponent(buildBody())}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    document.body.appendChild(button);
    feedbackButton = button;
    applyFeedbackButtonVisibility();
  };

  if (document.body) mount();
  else window.addEventListener("DOMContentLoaded", mount, { once: true });
}
