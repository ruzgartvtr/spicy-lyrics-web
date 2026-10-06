import { activeLineIndex, syllableFill } from "./lyrics.js";

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function paintSyllable(node, syllable, timeMs) {
  const amount = syllableFill(syllable, timeMs);
  const fill = node.querySelector(".slw-fill");
  fill.style.width = `${amount * 100}%`;
  node.dataset.fill = amount.toFixed(3);
}

function buildSyllable(doc, syllable, index, siblings) {
  const node = el(doc, "span", "slw-syl");
  if (!syllable.partOfWord && index < siblings.length - 1) node.classList.add("slw-gap");
  const base = el(doc, "span", "slw-base");
  base.textContent = syllable.text;
  const fill = el(doc, "span", "slw-fill");
  const fillText = el(doc, "span", "slw-fill-text");
  fillText.textContent = syllable.text;
  fill.append(fillText);
  node.append(base, fill);
  return node;
}

function buildLine(doc, line, onSeek) {
  const row = el(doc, "div", "slw-line");
  if (line.opposite) row.classList.add("slw-opposite");
  if (line.intro) row.classList.add("slw-intro");
  row.dir = "auto";
  const lead = el(doc, "div", "slw-lead");
  const nodes = line.syllables.map((syllable, index) => {
    const node = buildSyllable(doc, syllable, index, line.syllables);
    lead.append(node);
    return node;
  });
  row.append(lead);
  const backgroundNodes = [];
  for (const bg of line.background) {
    const bgRow = el(doc, "div", "slw-bgline");
    const syllables = bg.syllables.map((syllable, index) => {
      const node = buildSyllable(doc, syllable, index, bg.syllables);
      bgRow.append(node);
      return node;
    });
    backgroundNodes.push(syllables);
    row.append(bgRow);
  }
  if (!line.static && !line.intro) {
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    const seek = () => onSeek?.(line.startMs);
    row.addEventListener("click", seek);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        seek();
      }
    });
  }
  return { row, nodes, backgroundNodes };
}

export function mountLyrics(scroll, model, onSeek) {
  const doc = scroll.ownerDocument;
  scroll.replaceChildren();
  const built = model.lines.map((line) => buildLine(doc, line, onSeek));
  for (const line of built) scroll.append(line.row);

  let lastActive = -2;
  return {
    paint(timeMs) {
      const active = model.type === "Static" ? -1 : activeLineIndex(model.lines, timeMs);
      built.forEach((line, index) => {
        line.row.classList.toggle("is-active", index === active);
        line.row.classList.toggle("is-sung", active >= 0 && index < active);
        line.row.classList.toggle("is-future", active >= 0 && index > active);
        const lineTime = model.type === "Static" ? Number.POSITIVE_INFINITY : timeMs;
        line.nodes.forEach((node, syllableIndex) => {
          paintSyllable(node, model.lines[index].syllables[syllableIndex], lineTime);
        });
        line.backgroundNodes.forEach((nodes, bgIndex) => {
          nodes.forEach((node, syllableIndex) => {
            paintSyllable(node, model.lines[index].background[bgIndex].syllables[syllableIndex], lineTime);
          });
        });
      });
      if (active !== lastActive && active >= 0) {
        lastActive = active;
        built[active].row.scrollIntoView({ block: "center", inline: "nearest" });
      }
    },
  };
}

export function renderCredit(footer, attribution, songWriters) {
  const doc = footer.ownerDocument;
  footer.replaceChildren();
  const line = el(doc, "p", "slw-credit-line");
  line.append("Lyrics from ");
  const provider = el(doc, "strong");
  provider.textContent = attribution?.provider || "Lyrics provider";
  line.append(provider);
  if (attribution?.uploader) {
    line.append(" · uploaded by ");
    line.append(creditLink(doc, attribution.uploader));
  }
  if (attribution?.maker) {
    line.append(" · made by ");
    line.append(creditLink(doc, attribution.maker));
  }
  footer.append(line);
  if (songWriters?.length) {
    const writers = el(doc, "p", "slw-writers");
    writers.textContent = songWriters.join(", ");
    footer.append(writers);
  }
}

function creditLink(doc, person) {
  if (!person.url) {
    const span = el(doc, "span");
    span.textContent = person.username;
    return span;
  }
  const link = el(doc, "a");
  link.href = person.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = person.username;
  return link;
}

export function showMessage(scroll, text) {
  const doc = scroll.ownerDocument;
  scroll.replaceChildren();
  const message = el(doc, "p", "slw-message");
  message.textContent = text;
  scroll.append(message);
}
