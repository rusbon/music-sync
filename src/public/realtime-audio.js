navigator.mediaDevices.enumerateDevices().then((e) => {
  console.log(e);
});

const isChrome = !!window.chrome;

const audioCtx = new AudioContext();
const audioElement = document.querySelector("#aud");
const playElement = document.querySelector("#playAudio");
const spanDelay = document.querySelector("#spanDelay");
const divBlink = document.querySelector("#divBlink");
const btnDebug = document.querySelector("#debug");

const source = audioCtx.createMediaElementSource(audioElement);

// Create a gain node
const gainNode = audioCtx.createGain();
const delayNode = audioCtx.createDelay();
const testNode = audioCtx.crete;

// Create variables to store mouse pointer Y coordinate
// and HEIGHT of screen
let curY;
const HEIGHT = window.innerHeight;

// document.onmousemove = updatePage;

function updatePage(e) {
  curY = e.pageY;
  delayNode.delayTime.value = curY / HEIGHT;
  //   gainNode.gain.value = curY / HEIGHT;
}

// source.connect(gainNode);
// gainNode.connect(audioCtx.destination);

source.connect(delayNode);
delayNode.connect(audioCtx.destination);

const MAX_BUFFER = 5;
let medianOffset;
let medianDelay;
let currentOffset = 0;
let currentDelay = 0;
let d2 = 0;
let syncTime = 0;
let offsetBuf = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let delayBuf = [0, 0, 0, 0, 0];
let playtime = 0;

btnDebug.addEventListener("click", async () => {
  audioElement.play().then(() => {
    audioElement.currentTime = 270;
  });
});

playElement.addEventListener("click", async () => {
  // checkLoad();

  // await sync();
  // let adjustedPlaytime = playtime;
  // // adjustedPlaytime = adjustedPlaytime - currentOffset * -1 + currentDelay / 2;
  // adjustedPlaytime = adjustedPlaytime + currentDelay;
  // audioElement.currentTime = adjustedPlaytime / 1000;

  // const startTime = performance.now();
  audioCtx.resume();
  // const endTime = performance.now();
  // console.log(`play trigger delay : ${endTime - startTime}`);
});

const playSync = async () => {
  // checkLoad();

  spanDelay.classList.add("red");
  divBlink.classList.remove("blink");
  await sync();
  let adjustedPlaytime = playtime;
  // let adjustedPlaytime = 40000;

  /**
   * Plotted delay whistle
   * 10000 : 400
   * 20000 : 600
   * 30000 : 800
   * 40000 : 1000
   */

  /**
   * Plotted delay stayin alive
   * 30000 : 800
   * 40000 : 1000
   * 50000 : 1200
   */

  /**
   * chrome - audacity
   * 35   : 34.7    : -0.3
   * 62   : 61.114  : -0.9
   * 120  : 118.6   : -1.4
   * 169  : 168.8   : -0.2
   * 210  : 209.7   : -0.3
   * 240  : 238.7   : -1.3
   * 260  : 259.1   : -0.9
   * 265  : 263.9   : -1.1
   * 270  : 270.0   : 0
   * 275  : 273.9   : -1.1
   */

  /**
   * firefox - audacity
   * 35   : 34.4    : -0.6
   * 62   : 60.90   : -1.1
   * 120  : 118.2   : -1.8
   * 169  : 166.6   : -2.4
   */

  // adjustedPlaytime = adjustedPlaytime - currentOffset * -1 + currentDelay / 2;

  // adjustedPlaytime = adjustedPlaytime + currentDelay / 2;

  adjustedPlaytime = adjustedPlaytime + currentDelay;

  // adjustedPlaytime = adjustedPlaytime - d2;

  // audioElement.currentTime = adjustedPlaytime / 1000;

  const startTime = new Date();
  audioElement.play().then(() => {
    const endTime = new Date();
    let playDelay = endTime.getTime() - startTime.getTime();
    console.log(`play trigger delay : ${playDelay}`);
    if (isChrome) playDelay = playDelay - chromeDelay(adjustedPlaytime);
    audioElement.currentTime = (adjustedPlaytime + playDelay) / 1000;
    spanDelay.classList.remove("red");

    spanDelay.innerHTML = JSON.stringify({
      playtime,
      adjustedPlaytime,
      currentDelay,
      currentOffset,
      playDelay,
      isChrome,
      chromeDelay: chromeDelay(adjustedPlaytime),
    });

    setTimeout(() => {
      divBlink.classList.add("blink");
    }, 1000 - (adjustedPlaytime % 1000));
  });
};

setInterval(async () => {
  // await sync();
  // let adjustedPlaytime = playtime;
  // adjustedPlaytime = adjustedPlaytime - currentOffset * -1 + currentDelay / 2;
  // audioElement.currentTime = adjustedPlaytime / 1000;
}, 500);

const checkLoad = () => {
  if (audioElement.readyState !== 4) {
    audioElement.load();
  }
};

const chromeDelay = (playtime = 0) => {
  return playtime * 0.02 + 200;
};

const loadAudio = (id) => {
  audioElement.src = `/load/${id}`;
  audioElement.load();
};

const sync = async () => {
  let offset = 0;
  let delay = 0;
  let t0 = new Date().getTime();
  let t1 = 0;
  let t2 = 0;
  let t3 = 0;

  await fetch("http://192.168.1.80:3000/sync", { method: "POST" });
  await fetch("http://192.168.1.80:3000/sync", { method: "POST" });
  const resp = await fetch("http://192.168.1.80:3000/sync", { method: "POST" });
  const e = await resp.json();

  t3 = new Date().getTime();
  t1 = e.ts;
  t2 = e.ts;

  offset = (t1 - t0 + (t2 - t3)) / 2;
  delay = t3 - t0 - (t2 - t1);
  d2 = t3 - t2 + offset;
  syncTime = t3;

  //   console.log({ t0, t1, t2, t3, offset, delay });
  appendOffset(offset);
  appendDelay(delay);
  playtime = e.playtime;
};

const appendOffset = (val) => {
  offsetBuf.shift();
  offsetBuf.push(val);
  currentOffset = val;
  temp = Array(...offsetBuf).sort((a, b) => a - b);
  medianOffset = temp[3];
};

const appendDelay = (val) => {
  delayBuf.shift();
  delayBuf.push(val);
  currentDelay = val;
  temp = Array(...delayBuf).sort((a, b) => a - b);
  medianDelay = temp[3];
};

setInterval(() => {
  // console.log({ offsetBuf, delayBuf, medianOffset, medianDelay });
  console.log({
    offsetBuf,
    // delayBuf,
    // medianOffset,
    // medianDelay,
    // currentOffset,
    // currentDelay,
    // playtime,
  });
}, 2000);

const sse = new EventSource("/sse/1234");
sse.onmessage = (ev) => {
  const data = JSON.parse(ev.data);
  console.log(data);

  switch (data.type) {
    case "play":
    case "sync":
      playSync();
      break;
    case "pause":
      audioElement.pause();
      break;
    case "change":
      loadAudio(data.val);
      break;
    case "stop":
    default:
      audioElement.pause();
      audioElement.currentTime = 0;
      break;
  }
};
