const loginPanel = document.querySelector("#login-panel");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const dashboardContent = document.querySelector("#dashboard-content");
const refreshButton = document.querySelector("#refresh-button");
const overallStatus = document.querySelector("#overall-status");
const overallLabel = document.querySelector("#overall-label");
const lastChecked = document.querySelector("#last-checked");
const summary = document.querySelector("#summary");
const pageTitle = document.querySelector("#page-title");
const serviceGrid = document.querySelector("#service-grid");
const cardTemplate = document.querySelector("#service-card-template");

let authorization = "";

const iconByKind = {
  dashboard: "dashboard",
  database: "database",
  model: "model",
  notebook: "notebook",
  web: "web",
};

function endpointUrl(template) {
  return template.replace("{host}", window.location.hostname);
}

function makeIconButton(icon, title, handler) {
  const button = document.createElement("button");
  button.className = "value-button";
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<svg aria-hidden="true"><use href="#icon-${icon}"></use></svg>`;
  button.addEventListener("click", handler);
  return button;
}

async function copyValue(value, button) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Copy failed");
  }
  const original = button.title;
  button.title = "Copied";
  button.setAttribute("aria-label", "Copied");
  window.setTimeout(() => {
    button.title = original;
    button.setAttribute("aria-label", original);
  }, 1200);
}

function appendValueRow(list, item, isCredential) {
  const term = document.createElement("dt");
  term.textContent = item.label;

  const detail = document.createElement("dd");
  const value = document.createElement("code");
  const secret = isCredential && item.secret === true;
  value.textContent = secret ? "********" : item.value;
  value.dataset.value = item.value;
  value.dataset.revealed = "false";
  detail.append(value);

  if (secret) {
    detail.append(
      makeIconButton("eye", `Reveal ${item.label}`, (event) => {
        const revealed = value.dataset.revealed === "true";
        value.dataset.revealed = String(!revealed);
        value.textContent = revealed ? "********" : value.dataset.value;
        event.currentTarget.innerHTML = `<svg aria-hidden="true"><use href="#icon-${revealed ? "eye" : "eye-off"}"></use></svg>`;
        event.currentTarget.title = `${revealed ? "Reveal" : "Hide"} ${item.label}`;
        event.currentTarget.setAttribute("aria-label", event.currentTarget.title);
      }),
    );
  }

  detail.append(
    makeIconButton("copy", `Copy ${item.label}`, (event) => {
      copyValue(item.value, event.currentTarget).catch(() => {});
    }),
  );
  list.append(term, detail);
}

function renderService(service) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.state = service.status;
  card.dataset.service = service.id;

  const icon = iconByKind[service.kind] || "container";
  card.querySelector(".service-icon").classList.add(`service-icon-${icon}`);
  card.querySelector(".service-icon use").setAttribute("href", `#icon-${icon}`);
  card.querySelector("h2").textContent = service.name;
  card.querySelector(".service-description").textContent = service.description;
  card.querySelector(".state-label").textContent = service.status === "up" ? "Available" : "Unavailable";
  card.querySelector(".service-detail").textContent = service.detail;

  const values = card.querySelector(".service-values");
  (service.connection || []).forEach((item) => appendValueRow(values, item, false));
  (service.credentials || []).forEach((item) => appendValueRow(values, item, true));
  values.hidden = values.children.length === 0;

  const models = card.querySelector(".model-list");
  if (Array.isArray(service.models)) {
    const label = document.createElement("strong");
    label.textContent = "Installed models";
    const content = document.createElement("p");
    content.textContent = service.models.length > 0 ? service.models.join(", ") : "None";
    models.append(label, content);
    models.hidden = false;
  }

  const link = card.querySelector(".service-link");
  if (service.endpoint?.url) {
    link.href = endpointUrl(service.endpoint.url);
    link.querySelector("span").textContent = service.endpoint.label || "Open service";
    link.hidden = false;
  }

  return card;
}

function renderStatus(result) {
  document.title = `${result.title} - Runtime Services`;
  pageTitle.textContent = result.title;
  serviceGrid.replaceChildren(...result.services.map(renderService));

  const available = result.services.filter((service) => service.status === "up").length;
  overallStatus.dataset.state = result.status === "healthy" ? "up" : "down";
  overallLabel.textContent = result.status === "healthy" ? "All systems operational" : "Attention required";
  summary.textContent = `${available} of ${result.services.length} services available`;
  lastChecked.textContent = `Updated ${new Date(result.checked_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function setLoading(loading) {
  refreshButton.disabled = loading || !authorization;
  refreshButton.dataset.loading = String(loading);
}

function showLogin(message = "") {
  authorization = "";
  loginPanel.hidden = false;
  dashboardContent.hidden = true;
  refreshButton.disabled = true;
  loginError.textContent = message || "Login failed.";
  loginError.hidden = !message;
}

function showFailure() {
  overallStatus.dataset.state = "down";
  overallLabel.textContent = "Status unavailable";
  summary.textContent = "The dashboard could not complete its health check.";
  lastChecked.textContent = "Try refreshing in a moment";
}

async function refreshStatus() {
  if (!authorization) return;
  setLoading(true);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("/api/status", {
      cache: "no-store",
      headers: {Authorization: authorization},
      signal: controller.signal,
    });
    if (response.status === 401) {
      showLogin("Incorrect username or password.");
      return;
    }
    if (!response.ok) throw new Error("Status request failed");
    const result = await response.json();
    loginPanel.hidden = true;
    dashboardContent.hidden = false;
    loginError.hidden = true;
    renderStatus(result);
  } catch (_error) {
    showFailure();
  } finally {
    window.clearTimeout(timeoutId);
    setLoading(false);
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = document.querySelector("#username").value;
  const password = document.querySelector("#password").value;
  authorization = `Basic ${btoa(`${username}:${password}`)}`;
  refreshStatus();
});

refreshButton.addEventListener("click", refreshStatus);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshStatus();
});
window.setInterval(refreshStatus, 15000);
