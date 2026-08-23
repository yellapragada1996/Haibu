// Minimal markdown → HTML converter for Haibu's own Terms of Service document.
// Handles exactly the constructs used in haibu-terms-of-service-combined.md:
// headings (#/##/###), **bold**, `code`, [text](url) links, bullet lists, and
// paragraphs. Output is safe HTML (input text is escaped before transforms).

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let s = escapeHtml(text);
  // links before bold (links can contain bold markers rarely; do links first)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    if (url.startsWith("#")) return label; // internal anchor → plain text
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }

    // headings
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length; // 1,2,3
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // bullet list
    if (/^-\s+/.test(trimmed)) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inline(trimmed.replace(/^-\s+/, ""))}</li>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      out.push("<hr />");
      i++;
      continue;
    }

    // blockquote (single-paragraph ">" lines)
    if (/^>/.test(trimmed)) {
      closeList();
      const quote: string[] = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    // table (| a | b | with an optional |---|---| separator row)
    if (/^\|/.test(trimmed)) {
      closeList();
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        rows.push(lines[i].trim());
        i++;
      }
      const cells = (r: string) =>
        r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const hasHeaderSep =
        rows.length >= 2 && /^\|[\s:|-]+\|$/.test(rows[1]);
      let html = "<table><thead><tr>";
      for (const c of cells(rows[0])) html += `<th>${inline(c)}</th>`;
      html += "</tr></thead><tbody>";
      const start = hasHeaderSep ? 2 : 1;
      for (let r = start; r < rows.length; r++) {
        html += "<tr>";
        for (const c of cells(rows[r])) html += `<td>${inline(c)}</td>`;
        html += "</tr>";
      }
      html += "</tbody></table>";
      out.push(html);
      continue;
    }

    // paragraph — accumulate consecutive non-empty, non-special lines
    closeList();
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^-\s+/.test(lines[i].trim()) &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }

  closeList();
  return out.join("\n");
}
