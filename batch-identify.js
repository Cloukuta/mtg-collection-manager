/* Rapid Batch identification extension.
 *
 * This file intentionally sits on top of the existing app.js so the working
 * single-card scanner stays untouched while batch identification is tested.
 */

"use strict";

let batchResolved = [];
let batchIdentifying = false;

function getBatchFinishLabel() {
  const select = $("batchFinish");
  return select?.selectedOptions?.[0]?.textContent?.trim() || "Unknown";
}

function isFoilLikeFinish(finish) {
  return finish !== "nonfoil";
}

function syncBatchIdentifyUI() {
  const identifyBtn = $("identifyBatchBtn");
  const addBtn = $("addBatchBtn");

  if (!identifyBtn) return;

  const limit = getBatchLimit();
  const count = batchSnapshots.length;

  identifyBtn.disabled =
    batchIdentifying ||
    count !== limit;

  identifyBtn.textContent = batchIdentifying
    ? "Identifying…"
    : "Identify batch";

  if (addBtn) {
    const validCount = batchResolved.filter((item) => item.card).length;

    addBtn.disabled =
      batchIdentifying ||
      validCount === 0;

    addBtn.style.display =
      batchResolved.length ? "block" : "none";

    addBtn.textContent = validCount
      ? `Add ${validCount} valid card${validCount === 1 ? "" : "s"}`
      : "Add valid cards";
  }
}

function resetBatchIdentification() {
  batchResolved = [];

  const results = $("batchResults");

  if (results) {
    results.innerHTML = "";
  }

  const addBtn = $("addBatchBtn");

  if (addBtn) {
    addBtn.style.display = "none";
    addBtn.disabled = true;
  }

  syncBatchIdentifyUI();
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();

    img.src = url;

    await img.decode();

    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function buildBatchContactSheet() {
  const count = batchSnapshots.length;

  if (!count) {
    throw new Error("No batch cards captured.");
  }

  const columns =
    count <= 4
      ? 2
      : count <= 6
        ? 3
        : 4;

  const rows =
    Math.ceil(count / columns);

  const cardWidth = 420;

  const cardHeight =
    Math.round(
      cardWidth * 88 / 63
    );

  const labelHeight = 48;
  const gap = 16;
  const outer = 18;

  const cellWidth =
    cardWidth;

  const cellHeight =
    labelHeight + cardHeight;

  const canvas =
    $("batchSheet");

  canvas.width =
    outer * 2 +
    columns * cellWidth +
    (columns - 1) * gap;

  canvas.height =
    outer * 2 +
    rows * cellHeight +
    (rows - 1) * gap;

  const ctx =
    canvas.getContext("2d");

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

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const row =
      Math.floor(i / columns);

    const col =
      i % columns;

    const x =
      outer +
      col * (cellWidth + gap);

    const y =
      outer +
      row * (cellHeight + gap);

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
      x + cardWidth / 2,
      y + labelHeight / 2
    );

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

    const srcAR =
      img.naturalWidth /
      img.naturalHeight;

    const dstAR =
      cardWidth /
      cardHeight;

    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;

    if (srcAR > dstAR) {
      sw =
        img.naturalHeight *
        dstAR;

      sx =
        (
          img.naturalWidth -
          sw
        ) / 2;

    } else if (srcAR < dstAR) {

      sh =
        img.naturalWidth /
        dstAR;

      sy =
        (
          img.naturalHeight -
          sh
        ) / 2;
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

  return new Promise(
    (resolve, reject) => {

      canvas.toBlob(
        (blob) => {

          if (!blob) {
            reject(
              new Error(
                "Could not create batch contact sheet."
              )
            );

            return;
          }

          resolve(blob);
        },

        "image/jpeg",

        0.86
      );
    }
  );
}

async function resolveBatchRead(read) {
  let card = null;

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

function renderBatchResults() {
  const container =
    $("batchResults");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  batchResolved.forEach(
    (item, index) => {

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


      const img =
        document.createElement(
          "img"
        );

      img.alt = "";


      if (item.card) {

        const src =
          cardImg(item.card);

        if (src) {
          img.src = src;
        }
      }


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


      if (item.card) {

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


      if (item.card) {

        const confidence =
          item.read?.confidence != null
            ? ` · ${Math.round(
                item.read.confidence * 100
              )}%`
            : "";

        sub.textContent =
          `${(
            item.card.set || ""
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


  if (batchIdentifying) {
    return;
  }


  batchIdentifying = true;

  batchResolved = [];

  syncBatchIdentifyUI();


  document.body.classList.add(
    "scanning"
  );

  setStatus(
    `Preparing ${limit}-card batch…`
  );


  try {

    const sheetBlob =
      await buildBatchContactSheet();


    setStatus(
      `Identifying ${limit} cards with one Gemini request…`
    );


    const r =
      await fetch(
        getWorkerUrl() +
        "/identify-batch",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "image/jpeg",

            "x-app-token":
              getToken()
          },

          body: sheetBlob
        }
      );


    const j =
      await r.json();


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


    if (!reads.length) {

      setStatus(
        "Gemini returned no cards for this batch."
      );

      return;
    }


    setStatus(
      `Gemini read ${reads.length} cards. Resolving exact printings…`
    );


    const bySlot =
      new Map();


    reads.forEach(
      (read, index) => {

        const slot =
          Number(read.slot) ||
          index + 1;

        bySlot.set(
          slot,
          read
        );
      }
    );


    const resolved = [];


    for (
      let slot = 1;
      slot <= limit;
      slot++
    ) {

      const read =
        bySlot.get(slot) ||
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

  } catch (error) {

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

function addResolvedBatch() {
  const validItems =
    batchResolved.filter(
      (item) =>
        item.card
    );


  if (!validItems.length) {

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
    ({ card }) => {

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
          cardImg(card)
      };


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


      if (existing) {

        existing.qty += 1;

      } else {

        collected.push({
          qty: 1,
          foil,
          finish,
          card: c
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


  clearBatch();

  resetBatchIdentification();


  setStatus(
    unresolved
      ? `Added ${added} cards. ${unresolved} unresolved card${unresolved === 1 ? " was" : "s were"} not added.`
      : `Added all ${added} cards from the batch.`
  );
}


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


/*
  Any new capture invalidates
  previous identification results.
*/

$("batchCaptureBtn")
  ?.addEventListener(
    "click",
    () => {

      if (
        batchResolved.length
      ) {
        resetBatchIdentification();
      }

      setTimeout(
        syncBatchIdentifyUI,
        0
      );

      setTimeout(
        syncBatchIdentifyUI,
        150
      );
    }
  );


$("clearBatchBtn")
  ?.addEventListener(
    "click",
    () => {

      setTimeout(
        resetBatchIdentification,
        0
      );
    }
  );


$("batchSize")
  ?.addEventListener(
    "change",
    () => {

      setTimeout(
        resetBatchIdentification,
        0
      );
    }
  );


$("startBatchBtn")
  ?.addEventListener(
    "click",
    () => {

      setTimeout(
        syncBatchIdentifyUI,
        0
      );
    }
  );


const batchCounterEl =
  $("batchCounter");


if (batchCounterEl) {

  new MutationObserver(
    syncBatchIdentifyUI
  ).observe(
    batchCounterEl,
    {
      childList: true,
      characterData: true,
      subtree: true
    }
  );
}


syncBatchIdentifyUI();