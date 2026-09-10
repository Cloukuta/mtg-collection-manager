/*
  ============================================================
  MTG Collection Manager
  Rapid Batch Identification + Global Capture Button
  ============================================================

  IMPORTANT:

  app.js remains the owner of:
  - camera
  - single capture
  - batch capture
  - Scryfall
  - collection
  - exports

  This file adds:
  - global capture mode
  - one capture button beside the camera
  - contact-sheet generation
  - /identify-batch
  - batch result resolution
  - add valid batch cards

  app.js must load BEFORE this file.
============================================================
*/

"use strict";


/* ============================================================
   BATCH IDENTIFICATION STATE
============================================================ */

let batchResolved = [];

let batchIdentifying = false;


/* ============================================================
   GLOBAL CAPTURE STATE
============================================================ */

let globalCaptureMode =
  "single";


/* ============================================================
   FINISH HELPERS
============================================================ */

function getBatchFinishLabel() {

  const select =
    $("batchFinish");


  return (
    select
      ?.selectedOptions
      ?.[0]
      ?.textContent
      ?.trim()
    ||
    "Unknown"
  );
}


function isFoilLikeFinish(
  finish
) {

  return (
    finish !==
    "nonfoil"
  );
}


/* ============================================================
   GLOBAL CAPTURE UI
============================================================ */

function setGlobalCaptureMode(
  mode
) {

  if (
    mode !== "single" &&
    mode !== "batch"
  ) {

    return;
  }


  globalCaptureMode =
    mode;


  syncGlobalCaptureUI();
}


function syncGlobalCaptureUI() {

  const globalBtn =
    $("globalCaptureBtn");


  const modeStatus =
    $("captureModeStatus");


  if (
    !globalBtn ||
    !modeStatus
  ) {

    return;
  }


  globalBtn.classList.remove(
    "batch-ready"
  );


  /* ========================================================
     SINGLE SCAN
  ======================================================== */

  if (
    globalCaptureMode ===
    "single"
  ) {

    modeStatus.innerHTML =
      "Mode: " +
      "<strong>&nbsp;Single Scan</strong>";


    const internalBtn =
      $("captureBtn");


    const cameraReady =
      !!(
        stream &&
        stream.active &&
        video.videoWidth
      );


    const busy =
      document.body.classList.contains(
        "scanning"
      );


    globalBtn.disabled =
      !cameraReady ||
      busy ||
      internalBtn.disabled;


    globalBtn.textContent =
      busy
        ? "Identifying…"
        : "📸 Capture & identify";


    return;
  }


  /* ========================================================
     RAPID BATCH
  ======================================================== */

  const count =
    batchSnapshots.length;


  const limit =
    getBatchLimit();


  const finish =
    getBatchFinishLabel();


  modeStatus.innerHTML =
    "Mode: " +
    "<strong>&nbsp;Rapid Batch</strong>" +
    `&nbsp; · ${finish} · ${count} / ${limit}`;


  const cameraReady =
    !!(
      stream &&
      stream.active &&
      video.videoWidth
    );


  /*
    Batch is complete.
  */

  if (
    count >= limit
  ) {

    globalBtn.disabled =
      true;


    globalBtn.textContent =
      "✓ Batch complete";


    globalBtn.classList.add(
      "batch-ready"
    );


    return;
  }


  /*
    Camera is not ready.
  */

  if (
    !cameraReady
  ) {

    globalBtn.disabled =
      true;


    globalBtn.textContent =
      "📸 Start camera first";


    return;
  }


  /*
    Batch has not been started.
  */

  if (
    !batchActive
  ) {

    globalBtn.disabled =
      true;


    globalBtn.textContent =
      "📸 Start batch first";


    return;
  }


  /*
    Batch is active.
  */

  globalBtn.disabled =
    false;


  globalBtn.textContent =
    `📸 Capture card ${count + 1} / ${limit}`;
}


/* ============================================================
   GLOBAL CAPTURE ACTION
============================================================ */

function globalCapture() {

  const globalBtn =
    $("globalCaptureBtn");


  if (
    !globalBtn ||
    globalBtn.disabled
  ) {

    return;
  }


  /* ========================================================
     SINGLE
  ======================================================== */

  if (
    globalCaptureMode ===
    "single"
  ) {

    const internalBtn =
      $("captureBtn");


    if (
      !internalBtn ||
      internalBtn.disabled
    ) {

      return;
    }


    internalBtn.click();


    setTimeout(
      syncGlobalCaptureUI,
      0
    );


    return;
  }


  /* ========================================================
     RAPID BATCH
  ======================================================== */

  const batchBtn =
    $("batchCaptureBtn");


  if (
    !batchBtn ||
    batchBtn.disabled
  ) {

    return;
  }


  /*
    Any new capture invalidates
    previous batch identification.
  */

  if (
    batchResolved.length
  ) {

    resetBatchIdentification();
  }


  batchBtn.click();


  if (
    navigator.vibrate
  ) {

    navigator.vibrate(
      35
    );
  }


  setTimeout(
    syncGlobalCaptureUI,
    0
  );


  setTimeout(
    syncGlobalCaptureUI,
    100
  );
}


/* ============================================================
   BATCH IDENTIFY BUTTON STATE
============================================================ */

function syncBatchIdentifyUI() {

  const identifyBtn =
    $("identifyBatchBtn");


  const addBtn =
    $("addBatchBtn");


  if (
    !identifyBtn
  ) {

    return;
  }


  const limit =
    getBatchLimit();


  const count =
    batchSnapshots.length;


  identifyBtn.disabled =
    batchIdentifying ||
    count !== limit;


  identifyBtn.textContent =
    batchIdentifying
      ? "Identifying…"
      : "Identify batch";


  if (
    addBtn
  ) {

    const validCount =
      batchResolved.filter(
        (item) =>
          item.card
      ).length;


    addBtn.disabled =
      batchIdentifying ||
      validCount === 0;


    addBtn.style.display =
      batchResolved.length
        ? "block"
        : "none";


    addBtn.textContent =
      validCount
        ? `Add ${validCount} valid card${validCount === 1 ? "" : "s"}`
        : "Add valid cards";
  }


  syncGlobalCaptureUI();
}


/* ============================================================
   RESET IDENTIFICATION RESULTS
============================================================ */

function resetBatchIdentification() {

  batchResolved =
    [];


  const results =
    $("batchResults");


  if (
    results
  ) {

    results.innerHTML =
      "";
  }


  const addBtn =
    $("addBatchBtn");


  if (
    addBtn
  ) {

    addBtn.style.display =
      "none";


    addBtn.disabled =
      true;
  }


  syncBatchIdentifyUI();
}


/* ============================================================
   LOAD BLOB INTO IMAGE
============================================================ */

async function imageFromBlob(
  blob
) {

  const url =
    URL.createObjectURL(
      blob
    );


  try {

    const img =
      new Image();


    img.src =
      url;


    await img.decode();


    return img;

  } finally {

    URL.revokeObjectURL(
      url
    );
  }
}


/* ============================================================
   BUILD CONTACT SHEET
============================================================ */

async function buildBatchContactSheet() {

  const count =
    batchSnapshots.length;


  if (
    !count
  ) {

    throw new Error(
      "No batch cards captured."
    );
  }


  /*
    Layout:

    4 cards = 2 columns
    6 cards = 3 columns
    8 cards = 4 columns
  */

  const columns =
    count <= 4
      ? 2
      : count <= 6
        ? 3
        : 4;


  const rows =
    Math.ceil(
      count /
      columns
    );


  /*
    Keep each individual card large enough
    for collector numbers and set codes.
  */

  const cardWidth =
    420;


  const cardHeight =
    Math.round(
      cardWidth *
      88 /
      63
    );


  const labelHeight =
    48;


  const gap =
    16;


  const outer =
    18;


  const cellWidth =
    cardWidth;


  const cellHeight =
    labelHeight +
    cardHeight;


  const canvas =
    $("batchSheet");


  canvas.width =
    outer * 2 +
    columns * cellWidth +
    (
      columns - 1
    ) * gap;


  canvas.height =
    outer * 2 +
    rows * cellHeight +
    (
      rows - 1
    ) * gap;


  const ctx =
    canvas.getContext(
      "2d"
    );


  ctx.fillStyle =
    "#111111";


  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  ctx.textAlign =
    "center";


  ctx.textBaseline =
    "middle";


  ctx.font =
    "700 26px system-ui, sans-serif";


  /* ========================================================
     DRAW EACH CARD
  ======================================================== */

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const row =
      Math.floor(
        i /
        columns
      );


    const col =
      i %
      columns;


    const x =
      outer +
      col *
      (
        cellWidth +
        gap
      );


    const y =
      outer +
      row *
      (
        cellHeight +
        gap
      );


    /* CARD NUMBER LABEL */

    ctx.fillStyle =
      "#f3f3f3";


    ctx.fillRect(
      x,
      y,
      cardWidth,
      labelHeight
    );


    ctx.fillStyle =
      "#111111";


    ctx.fillText(
      `CARD ${i + 1}`,
      x +
      cardWidth / 2,
      y +
      labelHeight / 2
    );


    /* LOAD CARD IMAGE */

    const img =
      await imageFromBlob(
        batchSnapshots[i].blob
      );


    ctx.fillStyle =
      "#000000";


    ctx.fillRect(
      x,
      y + labelHeight,
      cardWidth,
      cardHeight
    );


    /*
      Crop to the MTG portrait ratio while
      preserving as much of the card as possible.
    */

    const srcAR =
      img.naturalWidth /
      img.naturalHeight;


    const dstAR =
      cardWidth /
      cardHeight;


    let sx =
      0;


    let sy =
      0;


    let sw =
      img.naturalWidth;


    let sh =
      img.naturalHeight;


    if (
      srcAR >
      dstAR
    ) {

      sw =
        img.naturalHeight *
        dstAR;


      sx =
        (
          img.naturalWidth -
          sw
        ) /
        2;

    } else if (
      srcAR <
      dstAR
    ) {

      sh =
        img.naturalWidth /
        dstAR;


      sy =
        (
          img.naturalHeight -
          sh
        ) /
        2;
    }


    ctx.drawImage(
      img,

      sx,
      sy,
      sw,
      sh,

      x,
      y + labelHeight,
      cardWidth,
      cardHeight
    );
  }


  /* ========================================================
     CONVERT CONTACT SHEET TO JPEG
  ======================================================== */

  return new Promise(
    (
      resolve,
      reject
    ) => {

      canvas.toBlob(
        (blob) => {

          if (
            !blob
          ) {

            reject(
              new Error(
                "Could not create batch contact sheet."
              )
            );


            return;
          }


          resolve(
            blob
          );
        },

        "image/jpeg",

        0.86
      );
    }
  );
}


/* ============================================================
   RESOLVE GEMINI RESULT USING SCRYFALL
============================================================ */

async function resolveBatchRead(
  read
) {

  let card =
    null;


  /*
    PRIMARY:
    set code + collector number.
  */

  if (
    read?.set_code &&
    read?.collector_number
  ) {

    card =
      await scryExact(
        read.set_code,
        read.collector_number,
        read.language
      );
  }


  /*
    FALLBACK:
    name.
  */

  if (
    !card &&
    read?.name
  ) {

    card =
      await scryNamed(
        read.name
      );
  }


  return card;
}


/* ============================================================
   RENDER BATCH RESULTS
============================================================ */

function renderBatchResults() {

  const container =
    $("batchResults");


  if (
    !container
  ) {

    return;
  }


  container.innerHTML =
    "";


  batchResolved.forEach(
    (
      item,
      index
    ) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        `batch-result ${
          item.card
            ? "ok"
            : "bad"
        }`;


      /* IMAGE */

      const img =
        document.createElement(
          "img"
        );


      img.alt =
        "";


      if (
        item.card
      ) {

        const src =
          cardImg(
            item.card
          );


        if (
          src
        ) {

          img.src =
            src;
        }
      }


      /* META */

      const meta =
        document.createElement(
          "div"
        );


      const title =
        document.createElement(
          "div"
        );


      title.className =
        "batch-result-name";


      if (
        item.card
      ) {

        title.textContent =
          `✓ ${index + 1}. ${item.card.name}`;

      } else {

        title.textContent =
          `⚠ ${index + 1}. Could not resolve`;
      }


      const sub =
        document.createElement(
          "div"
        );


      sub.className =
        "batch-result-sub";


      if (
        item.card
      ) {

        const confidence =
          item.read?.confidence != null
            ? ` · ${Math.round(
                item.read.confidence *
                100
              )}%`
            : "";


        sub.textContent =
          `${(
            item.card.set ||
            ""
          ).toUpperCase()} ` +

          `#${item.card.collector_number} · ` +

          `${(
            item.card.lang ||
            item.read?.language ||
            "en"
          ).toUpperCase()} · ` +

          `${getBatchFinishLabel()}${confidence}`;

      } else {

        const readName =
          item.read?.name ||
          "Unknown name";


        const set =
          item.read?.set_code
            ? item.read.set_code.toUpperCase()
            : "?";


        const num =
          item.read?.collector_number ||
          "?";


        sub.textContent =
          `${readName} · ${set} #${num}`;
      }


      meta.appendChild(
        title
      );


      meta.appendChild(
        sub
      );


      row.appendChild(
        img
      );


      row.appendChild(
        meta
      );


      container.appendChild(
        row
      );
    }
  );
}


/* ============================================================
   IDENTIFY ENTIRE BATCH
============================================================ */

async function identifyBatch() {

  const limit =
    getBatchLimit();


  if (
    batchSnapshots.length !==
    limit
  ) {

    setStatus(
      `Capture all ${limit} cards before identifying the batch.`
    );


    return;
  }


  if (
    batchIdentifying
  ) {

    return;
  }


  batchIdentifying =
    true;


  batchResolved =
    [];


  syncBatchIdentifyUI();


  document.body.classList.add(
    "scanning"
  );


  setStatus(
    `Preparing ${limit}-card batch…`
  );


  try {

    /* CONTACT SHEET */

    const sheetBlob =
      await buildBatchContactSheet();


    setStatus(
      `Identifying ${limit} cards with one Gemini request…`
    );


    /* WORKER */

    const r =
      await fetch(
        getWorkerUrl() +
        "/identify-batch",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "image/jpeg",

            "x-app-token":
              getToken()
          },

          body:
            sheetBlob
        }
      );


    let j;


    try {

      j =
        await r.json();

    } catch {

      throw new Error(
        `Worker returned invalid JSON (${r.status})`
      );
    }


    if (
      !r.ok ||
      j.error
    ) {

      setStatus(
        "Batch identify failed: " +
        (
          j.error ||
          r.status
        )
      );


      return;
    }


    const payload =
      j.result ||
      j;


    const reads =
      Array.isArray(
        payload.cards
      )
        ? payload.cards
        : [];


    if (
      !reads.length
    ) {

      setStatus(
        "Gemini returned no cards for this batch."
      );


      return;
    }


    setStatus(
      `Gemini read ${reads.length} cards. Resolving exact printings…`
    );


    /*
      Convert response array into slot lookup.

      This ensures CARD 1 always maps to slot 1,
      even if Gemini changes the order.
    */

    const bySlot =
      new Map();


    reads.forEach(
      (
        read,
        index
      ) => {

        const slot =
          Number(
            read.slot
          ) ||
          index + 1;


        bySlot.set(
          slot,
          read
        );
      }
    );


    const resolved =
      [];


    /*
      Resolve cards sequentially.

      This is intentionally conservative
      with Scryfall requests.
    */

    for (
      let slot = 1;
      slot <= limit;
      slot++
    ) {

      const read =
        bySlot.get(
          slot
        ) ||
        {
          slot,
          name: null,
          set_code: null,
          collector_number: null,
          language: "en",
          confidence: 0
        };


      const card =
        await resolveBatchRead(
          read
        );


      resolved.push({
        slot,
        read,
        card
      });
    }


    batchResolved =
      resolved;


    renderBatchResults();


    const valid =
      batchResolved.filter(
        (item) =>
          item.card
      ).length;


    const failed =
      batchResolved.length -
      valid;


    setStatus(
      failed
        ? `Batch identified: ${valid} resolved, ${failed} need review.`
        : `Batch identified: all ${valid} cards resolved.`
    );


    /*
      Haptic feedback when available.
    */

    if (
      navigator.vibrate
    ) {

      navigator.vibrate(
        [
          50,
          60,
          80
        ]
      );
    }

  } catch (
    error
  ) {

    console.error(
      "Batch identify error:",
      error
    );


    setStatus(
      "Batch identify failed: " +
      error.message
    );

  } finally {

    batchIdentifying =
      false;


    document.body.classList.remove(
      "scanning"
    );


    syncBatchIdentifyUI();
  }
}


/* ============================================================
   ADD RESOLVED BATCH TO COLLECTION
============================================================ */

function addResolvedBatch() {

  const validItems =
    batchResolved.filter(
      (item) =>
        item.card
    );


  if (
    !validItems.length
  ) {

    setStatus(
      "There are no resolved cards to add."
    );


    return;
  }


  const finish =
    $("batchFinish").value;


  const foil =
    isFoilLikeFinish(
      finish
    );


  validItems.forEach(
    ({
      card
    }) => {

      const c = {

        id:
          card.id,

        name:
          card.name,

        set:
          card.set,

        set_name:
          card.set_name,

        collector_number:
          card.collector_number,

        rarity:
          card.rarity,

        lang:
          card.lang ||
          "en",

        img:
          cardImg(
            card
          )
      };


      /*
        Merge only cards with:

        same Scryfall ID
        AND
        same finish.
      */

      const existing =
        collected.find(
          (entry) => {

            const entryFinish =
              entry.finish ||
              (
                entry.foil
                  ? "foil"
                  : "nonfoil"
              );


            return (
              entry.card.id ===
                c.id &&

              entryFinish ===
                finish
            );
          }
        );


      if (
        existing
      ) {

        existing.qty +=
          1;

      } else {

        collected.push({
          qty:
            1,

          foil,

          finish,

          card:
            c
        });
      }
    }
  );


  saveCollection();


  renderList();


  const added =
    validItems.length;


  const unresolved =
    batchResolved.length -
    added;


  /*
    Clear snapshots after adding.
  */

  clearBatch();


  resetBatchIdentification();


  setStatus(
    unresolved
      ? `Added ${added} cards. ${unresolved} unresolved card${unresolved === 1 ? " was" : "s were"} not added.`
      : `Added all ${added} cards from the batch.`
  );


  syncGlobalCaptureUI();
}


/* ============================================================
   IDENTIFY / ADD BUTTON LISTENERS
============================================================ */

$("identifyBatchBtn")
  ?.addEventListener(
    "click",
    identifyBatch
  );


$("addBatchBtn")
  ?.addEventListener(
    "click",
    addResolvedBatch
  );


/* ============================================================
   GLOBAL CAPTURE LISTENER
============================================================ */

$("globalCaptureBtn")
  ?.addEventListener(
    "click",
    globalCapture
  );


/* ============================================================
   MODE CHANGE FROM ACCORDION
============================================================ */

window.addEventListener(
  "mtg-capture-mode",
  (
    event
  ) => {

    const mode =
      event.detail?.mode;


    if (
      mode === "single" ||
      mode === "batch"
    ) {

      setGlobalCaptureMode(
        mode
      );
    }
  }
);


/* ============================================================
   WATCH INTERNAL SINGLE CAPTURE BUTTON

   app.js changes captureBtn.disabled while:
   - camera starts
   - Gemini runs
   - Gemini finishes

   The global button mirrors that state.
============================================================ */

const internalSingleBtn =
  $("captureBtn");


if (
  internalSingleBtn
) {

  new MutationObserver(
    syncGlobalCaptureUI
  ).observe(
    internalSingleBtn,
    {
      attributes:
        true,

      attributeFilter: [
        "disabled"
      ]
    }
  );
}


/* ============================================================
   WATCH INTERNAL BATCH CAPTURE BUTTON
============================================================ */

const internalBatchBtn =
  $("batchCaptureBtn");


if (
  internalBatchBtn
) {

  new MutationObserver(
    syncGlobalCaptureUI
  ).observe(
    internalBatchBtn,
    {
      attributes:
        true,

      attributeFilter: [
        "disabled"
      ]
    }
  );
}


/* ============================================================
   BATCH COUNTER WATCHER
============================================================ */

const batchCounterEl =
  $("batchCounter");


if (
  batchCounterEl
) {

  new MutationObserver(
    () => {

      syncBatchIdentifyUI();

      syncGlobalCaptureUI();

    }
  ).observe(
    batchCounterEl,
    {
      childList:
        true,

      characterData:
        true,

      subtree:
        true
    }
  );
}


/* ============================================================
   BATCH FINISH CHANGE
============================================================ */

$("batchFinish")
  ?.addEventListener(
    "change",
    () => {

      syncGlobalCaptureUI();

    }
  );


/* ============================================================
   BATCH SIZE CHANGE
============================================================ */

$("batchSize")
  ?.addEventListener(
    "change",
    () => {

      setTimeout(
        () => {

          resetBatchIdentification();

          syncGlobalCaptureUI();

        },
        0
      );
    }
  );


/* ============================================================
   START / STOP BATCH
============================================================ */

$("startBatchBtn")
  ?.addEventListener(
    "click",
    () => {

      /*
        app.js listener runs first because app.js
        was loaded before this file.

        setTimeout ensures we read the resulting
        batchActive state after app.js changed it.
      */

      setTimeout(
        () => {

          syncBatchIdentifyUI();

          syncGlobalCaptureUI();

        },
        0
      );
    }
  );


/* ============================================================
   INTERNAL BATCH CAPTURE
============================================================ */

$("batchCaptureBtn")
  ?.addEventListener(
    "click",
    () => {

      /*
        If the user captures another image after
        identification, discard previous results.
      */

      if (
        batchResolved.length
      ) {

        resetBatchIdentification();
      }


      setTimeout(
        () => {

          syncBatchIdentifyUI();

          syncGlobalCaptureUI();

        },
        0
      );


      setTimeout(
        () => {

          syncBatchIdentifyUI();

          syncGlobalCaptureUI();

        },
        150
      );
    }
  );


/* ============================================================
   CLEAR BATCH
============================================================ */

$("clearBatchBtn")
  ?.addEventListener(
    "click",
    () => {

      /*
        app.js asks for confirmation first.

        We delay this because if the user presses
        Cancel, batchSnapshots will remain unchanged.
      */

      setTimeout(
        () => {

          if (
            batchSnapshots.length === 0
          ) {

            resetBatchIdentification();
          }


          syncGlobalCaptureUI();

        },
        0
      );
    }
  );


/* ============================================================
   CAMERA CONTROLS
============================================================ */

$("startBtn")
  ?.addEventListener(
    "click",
    () => {

      /*
        Camera permission/play() is asynchronous.
        Check more than once while the camera starts.
      */

      setTimeout(
        syncGlobalCaptureUI,
        100
      );


      setTimeout(
        syncGlobalCaptureUI,
        500
      );


      setTimeout(
        syncGlobalCaptureUI,
        1200
      );
    }
  );


$("refreshCameraBtn")
  ?.addEventListener(
    "click",
    () => {

      setTimeout(
        syncGlobalCaptureUI,
        100
      );


      setTimeout(
        syncGlobalCaptureUI,
        500
      );


      setTimeout(
        syncGlobalCaptureUI,
        1200
      );
    }
  );


/* ============================================================
   WATCH SCANNING CLASS

   app.js adds/removes body.scanning while Gemini is working.
============================================================ */

new MutationObserver(
  syncGlobalCaptureUI
).observe(
  document.body,
  {
    attributes:
      true,

    attributeFilter: [
      "class"
    ]
  }
);


/* ============================================================
   INITIAL STATE
============================================================ */

syncBatchIdentifyUI();

syncGlobalCaptureUI();