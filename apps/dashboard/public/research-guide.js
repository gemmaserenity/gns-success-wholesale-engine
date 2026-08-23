const search = document.querySelector("#field-search");
const rows = [...document.querySelectorAll(".field-table tbody tr")];
const blocks = [...document.querySelectorAll(".mapping-block")];
const summary = document.querySelector("#search-summary");

function filterFieldMap() {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  rows.forEach((row) => {
    const matches = terms.every((term) => row.textContent.toLowerCase().includes(term));
    row.classList.toggle("search-hidden", !matches);
    if (matches) visible += 1;
  });
  blocks.forEach((block) => block.classList.toggle("filtered-empty", !block.querySelector("tbody tr:not(.search-hidden)")));
  summary.textContent = terms.length ? `${visible} matching field${visible === 1 ? "" : "s"}` : `${rows.length} mapped fields and evidence rules`;
}

search.addEventListener("input", filterFieldMap);
document.querySelector("#clear-search").addEventListener("click", () => {
  search.value = "";
  filterFieldMap();
  search.focus();
});
document.querySelector("#print-guide").addEventListener("click", () => window.print());
filterFieldMap();
