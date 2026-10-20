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
      bottom: "18px",
      zIndex: "2147483000",
      padding: "10px 16px",
      borderRadius: "999px",
      border: "1px solid #7c5cff",
      background: "#150f2b",
      color: "#e9e4ff",
      font: "600 13px 'Noto Sans', sans-serif",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(0,0,0,.45)",
      opacity: "0.9",
    });
    button.addEventListener("mouseenter", () => {
      button.style.opacity = "1";
    });
    button.addEventListener("mouseleave", () => {
      button.style.opacity = "0.9";
    });
    button.addEventListener("click", () => {
      const url = `${ISSUES_URL}?title=${encodeURIComponent(
        "[Comentario] "
      )}&body=${encodeURIComponent(buildBody())}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    document.body.appendChild(button);
  };

  if (document.body) mount();
  else window.addEventListener("DOMContentLoaded", mount, { once: true });
}
