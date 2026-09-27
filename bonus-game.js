import { launchBonusFireworks } from "./bonus-fireworks.js";
import {
  getBonusCelebrationDurationMs,
  playBonusCelebration
} from "./bonus-celebration-sound.js";

const TIMER_SEC = window.GlobbleBonusRound?.BONUS_TIMER_SEC || 30;
const BONUS_SESSION_KEY = "globble-bonus-session-v1";
const RETURN_FROM_BONUS_KEY = "globble-return-from-bonus-v1";

const shellEl = document.getElementById("bonusShell");
const loadingEl = document.getElementById("bonusLoading");
const waitingEl = document.getElementById("bonusWaiting");
const playerLabelEl = document.getElementById("bonusPlayerLabel");
const timerEl = document.getElementById("bonusTimer");
const timerValueEl = document.getElementById("bonusTimerValue");
const globeHostEl = document.getElementById("bonusGlobeHost");
const choicesEl = document.getElementById("bonusChoices");
const statusEl = document.getElementById("bonusStatus");

let globe = null;
let timerId = null;

function suppressGameAmbient() {
  window.GlobbleBonusRound?.suppressMainAmbient?.();
  window.GlobbleBonusAmbientGuard?.suppressMainAmbient?.();
  window.GlobbleSound?.shutdownForBonus?.();
}

function releaseGameAmbient() {
  window.GlobbleBonusRound?.releaseMainAmbient?.();
  window.GlobbleBonusAmbientGuard?.releaseMainAmbient?.();
}
let timeLeft = TIMER_SEC;
let answered = false;
let session = null;
let onlineSocket = null;

function loadSession() {
  try {
    const raw = sessionStorage.getItem(BONUS_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(next) {
  session = next;
  try {
    sessionStorage.setItem(BONUS_SESSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(BONUS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function isLocalPreviewHost() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return true;
  }
  try {
    return new URLSearchParams(location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

async function createPreviewSession() {
  const response = await fetch("./data/bonus-country-data.json");
  if (!response.ok) {
    throw new Error("Bonus country data is missing. Run npm run build:bonus-countries.");
  }
  const countryData = await response.json();
  const question = window.GlobbleBonusRound.generateBonusQuestion(countryData);
  const preview = {
    mode: "practice",
    returnUrl: "./practice.html",
    submittingPlayer: 0,
    activePlayerIndex: 0,
    playerNames: ["Player 1", "Player 2"],
    results: [null, null],
    question,
    gameSnapshot: {
      players: [{ name: "Player 1" }, { name: "Player 2" }]
    },
    preview: true
  };
  saveSession(preview);
  return preview;
}

function showPanel(mode) {
  loadingEl.hidden = mode !== "loading";
  waitingEl.hidden = mode !== "waiting";
  shellEl.hidden = mode !== "play";
}

function returnUrl() {
  return session?.returnUrl || (session?.mode === "online" ? "./game-online.html" : "./practice.html");
}

function showFatalError(message) {
  showPanel("loading");
  loadingEl.replaceChildren();
  const text = document.createElement("p");
  text.textContent = message || "Something went wrong.";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bonus-return-btn";
  btn.textContent = "Return to game";
  btn.addEventListener("click", () => {
    clearSession();
    releaseGameAmbient();
    location.href = returnUrl();
  });
  loadingEl.append(text, btn);
}

function formatPlayerName(index, names) {
  return names?.[index] || `Player ${index + 1}`;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startTimer(onExpire) {
  stopTimer();
  timeLeft = TIMER_SEC;
  timerValueEl.textContent = String(timeLeft);
  timerEl.classList.toggle("is-low", timeLeft <= 10);
  timerId = window.setInterval(() => {
    timeLeft -= 1;
    timerValueEl.textContent = String(Math.max(0, timeLeft));
    timerEl.classList.toggle("is-low", timeLeft <= 10);
    if (timeLeft <= 0) {
      stopTimer();
      onExpire();
    }
  }, 1000);
}

function renderChoices(question, onPick) {
  choicesEl.replaceChildren();
  question.choices.forEach((choice, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bonus-choice";
    btn.textContent = choice.name;
    btn.addEventListener("click", () => onPick(index));
    choicesEl.appendChild(btn);
  });
}

function revealAnswer(question, pickedIndex) {
  const buttons = choicesEl.querySelectorAll(".bonus-choice");
  buttons.forEach((btn, index) => {
    btn.disabled = true;
    if (index === question.correctIndex) {
      btn.classList.add("is-correct");
    } else if (index === pickedIndex) {
      btn.classList.add("is-wrong");
    }
  });
}

function flashWrongChoice(question, pickedIndex) {
  const buttons = choicesEl.querySelectorAll(".bonus-choice");
  buttons.forEach((btn, index) => {
    if (index === pickedIndex) {
      btn.classList.add("is-wrong");
      window.setTimeout(() => btn.classList.remove("is-wrong"), 700);
    }
  });
}

async function ensureGlobe() {
  if (globe) {
    return true;
  }
  try {
    const { BonusGlobe, BONUS_GLOBE_DRAG_VERSION } = await import("./bonus-globe.js?v=globe-arcball12");
    if (globeHostEl && BONUS_GLOBE_DRAG_VERSION) {
      globeHostEl.dataset.globeDragVersion = BONUS_GLOBE_DRAG_VERSION;
    }
    globe = new BonusGlobe(globeHostEl);
    await globe.ready();
    return true;
  } catch (err) {
    console.error(err);
    globeHostEl.innerHTML =
      '<p class="bonus-globe-fallback">Globe unavailable — use the choices below.</p>';
    return false;
  }
}

function finishPreviewBonus() {
  releaseGameAmbient();
  clearSession();
  location.replace("./practice.html");
}

async function finishPracticeAndReturn() {
  if (session?.preview) {
    finishPreviewBonus();
    return;
  }
  releaseGameAmbient();
  const snap = session.gameSnapshot;
  snap.players[0].score += Number(session.results[0] || 0);
  snap.players[1].score += Number(session.results[1] || 0);
  snap.currentPlayer = session.submittingPlayer === 0 ? 1 : 0;
  snap.totalSubmitCount = snap.totalSubmitCount || 0;

  const resumeKey = `globble-practice-resume:${new URL(session.returnUrl, location.href).pathname}`;
  sessionStorage.setItem(
    resumeKey,
    JSON.stringify({
      version: 2,
      pendingReturn: true,
      savedAt: Date.now(),
      snapshot: snap
    })
  );
  clearSession();
  try {
    sessionStorage.setItem(RETURN_FROM_BONUS_KEY, "1");
  } catch {
    /* ignore */
  }
  location.replace(session.returnUrl || "./practice.html");
}

function finishOnlineAndReturn() {
  releaseGameAmbient();
  clearSession();
  try {
    sessionStorage.setItem(RETURN_FROM_BONUS_KEY, "1");
  } catch {
    /* ignore */
  }
  location.replace(returnUrl());
}

function pickChoice(choiceIndex) {
  if (answered || !session?.question) {
    return;
  }
  stopTimer();
  const isCorrect = choiceIndex === session.question.correctIndex;
  if (!isCorrect) {
    flashWrongChoice(session.question, choiceIndex);
    globe?.flashMarker("wrong");
    window.setTimeout(() => handleAnswer(choiceIndex), 700);
    return;
  }
  handleAnswer(choiceIndex);
}

async function handleAnswer(choiceIndex) {
  if (answered || !session?.question) {
    return;
  }
  answered = true;
  stopTimer();

  const points = window.GlobbleBonusRound.scoreBonusAnswer(session.question, choiceIndex);
  const correct = points > 0;
  revealAnswer(session.question, choiceIndex);
  globe?.flashMarker(correct ? "correct" : "wrong");
  statusEl.textContent = correct ? `Correct! +${points} points.` : "Not quite — 0 points.";
  statusEl.className = `bonus-status ${correct ? "is-success" : "is-error"}`;
  const postAnswerDelayMs = correct ? getBonusCelebrationDurationMs() : 1200;

  if (correct) {
    launchBonusFireworks();
    playBonusCelebration();
  }

  if (session.mode === "online") {
    try {
      await submitOnlineAnswer(choiceIndex);
    } catch (err) {
      statusEl.textContent = `${err.message || "Could not save answer."} Returning to game…`;
      statusEl.className = "bonus-status is-error";
    }
    window.setTimeout(finishOnlineAndReturn, postAnswerDelayMs);
    return;
  }

  session.results[session.activePlayerIndex] = points;
  if (session.activePlayerIndex === session.submittingPlayer) {
    session.activePlayerIndex = session.submittingPlayer === 0 ? 1 : 0;
    saveSession(session);
    window.setTimeout(() => startPlayerTurn(), postAnswerDelayMs);
    return;
  }

  window.setTimeout(finishPracticeAndReturn, postAnswerDelayMs);
}

function handleTimeout() {
  if (answered) {
    return;
  }
  const wrongIndex = session.question.choices.findIndex(
    (_, index) => index !== session.question.correctIndex
  );
  flashWrongChoice(session.question, wrongIndex);
  globe?.flashMarker("wrong");
  statusEl.textContent = "Time's up — 0 points.";
  statusEl.className = "bonus-status is-error";
  window.setTimeout(() => {
    handleAnswer(wrongIndex >= 0 ? wrongIndex : 0);
  }, 700);
}

async function startPlayerTurn() {
  answered = false;
  statusEl.textContent = "";
  statusEl.className = "bonus-status";
  playerLabelEl.textContent = `${formatPlayerName(session.activePlayerIndex, session.playerNames)} — find the country`;
  showPanel("play");
  renderChoices(session.question, pickChoice);
  startTimer(handleTimeout);

  const hasGlobe = await ensureGlobe();
  if (hasGlobe && session.question) {
    globe.setTarget(session.question.lat, session.question.lng);
  }
}

function connectOnline() {
  return new Promise((resolve, reject) => {
    const wsUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    onlineSocket = socket;
    let joined = false;
    let latestState = null;

    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };

    const tryResolve = () => {
      if (joined && latestState) {
        cleanup();
        resolve({ socket, gameState: latestState });
      }
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      reject(
        new Error(
          "Connection timed out. Online bonus needs the full server (npm run start:online)."
        )
      );
    }, 12000);

    const onError = () => {
      cleanup();
      reject(new Error("Connection failed."));
    };

    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "authed") {
        socket.send(JSON.stringify({ type: "enterGame", gameId: session.gameId }));
        return;
      }
      if (msg.type === "joined") {
        joined = true;
        tryResolve();
        return;
      }
      if (msg.type === "state" && msg.payload) {
        latestState = msg.payload;
        tryResolve();
        return;
      }
      if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.error || "Could not connect."));
      }
    };

    socket.addEventListener("open", () => {
      const token = window.GlobbleAccounts?.getToken?.() || "";
      socket.send(JSON.stringify({ type: "auth", token }));
    });
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function submitOnlineAnswer(choiceIndex) {
  return new Promise((resolve, reject) => {
    if (!onlineSocket || onlineSocket.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected."));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      onlineSocket.removeEventListener("message", onMessage);
      reject(new Error("Server did not respond."));
    }, 12000);

    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "bonusResult" || msg.type === "state") {
        clearTimeout(timeoutId);
        onlineSocket.removeEventListener("message", onMessage);
        resolve(msg);
      } else if (msg.type === "error") {
        clearTimeout(timeoutId);
        onlineSocket.removeEventListener("message", onMessage);
        reject(new Error(msg.error || "Bonus answer failed."));
      }
    };
    onlineSocket.addEventListener("message", onMessage);
    onlineSocket.send(
      JSON.stringify({
        type: "bonusAnswer",
        choiceIndex
      })
    );
  });
}

function syncSessionFromOnlineState(gameState) {
  const bs = gameState?.bonusState;
  if (!bs || bs.complete) {
    return false;
  }
  session.myPlayerIndex = gameState.myPlayerIndex;
  session.activePlayerIndex = bs.activePlayerIndex;
  session.submittingPlayer = bs.submittingPlayer;
  session.playerNames = gameState.playerNames || session.playerNames;
  session.question = bs.question || session.question;
  saveSession(session);
  return true;
}

async function initOnlineBonus() {
  showPanel("waiting");
  waitingEl.textContent = "Connecting to your match…";
  let connection;
  try {
    connection = await connectOnline();
  } catch (err) {
    showFatalError(err.message || "Could not connect.");
    return;
  }

  if (!syncSessionFromOnlineState(connection.gameState)) {
    clearSession();
    releaseGameAmbient();
    location.href = returnUrl();
    return;
  }

  const myIndex = session.myPlayerIndex;
  const bs = connection.gameState.bonusState;
  if (bs.answers?.[myIndex] != null) {
    clearSession();
    releaseGameAmbient();
    location.href = returnUrl();
    return;
  }

  if (bs.activePlayerIndex !== myIndex) {
    clearSession();
    releaseGameAmbient();
    location.href = returnUrl();
    return;
  }

  startPlayerTurn();
}

async function init() {
  suppressGameAmbient();
  window.addEventListener("pagehide", releaseGameAmbient, { once: true });
  try {
    session = loadSession();
    if (!session?.question) {
      if (isLocalPreviewHost()) {
        session = await createPreviewSession();
      } else {
        showFatalError(
          "No bonus round in progress. Start one from Practice or an online match."
        );
        return;
      }
    }

    // Practice bonus needs CDN assets for the globe — skip cleanly when offline.
    if (session.mode === "practice" && typeof navigator !== "undefined" && navigator.onLine === false) {
      if (session.preview) {
        finishPreviewBonus();
      } else {
        statusEl.textContent = "Bonus round skipped (offline). Returning…";
        await finishPracticeAndReturn();
      }
      return;
    }

    if (session.mode === "online") {
      await initOnlineBonus();
      return;
    }

    await startPlayerTurn();
  } catch (err) {
    console.error(err);
    showFatalError(err.message || "Could not start the bonus round.");
  }
}

init();
