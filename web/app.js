const config = window.__APP_CONFIG__;
const httpStatusNode = document.getElementById("http-status");
const wsStatusNode = document.getElementById("ws-status");
const httpEndpointNode = document.getElementById("http-endpoint");
const wsEndpointNode = document.getElementById("ws-endpoint");
const eventsListNode = document.getElementById("events-list");
const reloadButton = document.getElementById("reload-button");
const toastRoot = document.getElementById("toast-root");

let socket;
let reconnectTimer;

const httpEventsURL = new URL(config.analyticsHttpUrl, window.location.origin);
const wsEventsURL = config.analyticsWsUrl.startsWith("__CLIENT_WS_ORIGIN__")
  ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/v1/ws`
  : config.analyticsWsUrl;

httpEndpointNode.textContent = httpEventsURL.toString();
wsEndpointNode.textContent = wsEventsURL;

reloadButton.addEventListener("click", () => {
  loadEvents();
});

async function loadEvents() {
  setHTTPStatus("Загрузка...", "pending");

  try {
    const response = await fetch(httpEventsURL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const events = normalizeEvents(payload);
    renderEvents(events);
    setHTTPStatus(`Загружено: ${events.length}`, "success");
  } catch (error) {
    console.error("failed to load events", error);
    renderEmptyState("Не удалось загрузить события");
    setHTTPStatus("Ошибка загрузки", "error");
  }
}

function connectWebSocket() {
  clearTimeout(reconnectTimer);
  setWSStatus("Подключение...", "pending");

  socket = new WebSocket(wsEventsURL);

  socket.addEventListener("open", () => {
    setWSStatus("Подключено", "success");
  });

  socket.addEventListener("message", (event) => {
    const nextEvent = extractIncomingEvent(event.data);
    if (!nextEvent) {
      return;
    }

    prependEvent(nextEvent);
    showToast(nextEvent);
  });

  socket.addEventListener("close", () => {
    setWSStatus("Переподключение...", "pending");
    reconnectTimer = window.setTimeout(connectWebSocket, 3000);
  });

  socket.addEventListener("error", () => {
    setWSStatus("Ошибка соединения", "error");
    socket.close();
  });
}

function normalizeEvents(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.events)) {
    return payload.events;
  }

  return [];
}

function renderEvents(events) {
  if (events.length === 0) {
    renderEmptyState("Событий пока нет");
    return;
  }

  eventsListNode.innerHTML = "";
  events.forEach((item) => {
    eventsListNode.appendChild(createEventNode(item));
  });
}

function prependEvent(item) {
  const emptyState = eventsListNode.querySelector(".events-empty");
  if (emptyState) {
    emptyState.remove();
  }

  eventsListNode.prepend(createEventNode(item));
}

function renderEmptyState(message) {
  eventsListNode.innerHTML = "";

  const item = document.createElement("li");
  item.className = "events-empty";
  item.textContent = message;
  eventsListNode.appendChild(item);
}

function createEventNode(item) {
  const eventNode = document.createElement("li");
  eventNode.className = "event-item";

  const title = document.createElement("strong");
  title.className = "event-title";
  title.textContent = extractTitle(item);

  const meta = document.createElement("span");
  meta.className = "event-meta";
  meta.textContent = extractTimestamp(item);

  const body = document.createElement("pre");
  body.className = "event-body";
  body.textContent = JSON.stringify(item, null, 2);

  eventNode.append(title, meta, body);
  return eventNode;
}

function parseEventPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

function extractIncomingEvent(raw) {
  const payload = parseEventPayload(raw);

  if (payload?.type === "new-event" && payload?.data) {
    return payload.data;
  }

  if (payload?.type && payload?.type !== "new-event") {
    return null;
  }

  return payload;
}

function extractTitle(item) {
  return (
    item?.title ||
    item?.event_type ||
    item?.type ||
    item?.event ||
    item?.name ||
    item?.message ||
    "Новое событие"
  );
}

function extractTimestamp(item) {
  const value =
    item?.created_at ||
    item?.createdAt ||
    item?.timestamp ||
    item?.date ||
    new Date().toISOString();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

function showToast(item) {
  const toast = document.createElement("article");
  toast.className = "toast";

  const title = document.createElement("strong");
  title.className = "toast-title";
  title.textContent = "Пришёл новый event";

  const subtitle = document.createElement("span");
  subtitle.className = "toast-subtitle";
  subtitle.textContent = `${extractTitle(item)} • ${extractTimestamp(item)}`;

  const preview = document.createElement("pre");
  preview.className = "toast-preview";
  preview.textContent = JSON.stringify(item, null, 2);

  toast.append(title, subtitle, preview);
  toastRoot.prepend(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-fade");
  }, 5000);

  window.setTimeout(() => {
    toast.remove();
  }, 6800);
}

function setHTTPStatus(text, state) {
  httpStatusNode.textContent = text;
  httpStatusNode.dataset.state = state;
}

function setWSStatus(text, state) {
  wsStatusNode.textContent = text;
  wsStatusNode.dataset.state = state;
}

loadEvents();
connectWebSocket();
