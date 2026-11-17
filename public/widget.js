/*!
 * Rokovnik widget: kalendar zajednice na vašoj stranici.
 *
 *   <script async src="https://<rokovnik>/widget.js" data-rokovnik="fsb"></script>
 *
 * Kalendar se pojavljuje na mjestu oznake <script>. Umjesto toga možete staviti
 * <div data-rokovnik="fsb"></div> gdje god želite i učitati skriptu jednom.
 *
 * Postavke (atributi data-...):
 *   data-rokovnik   adresa zajednice (obavezno), npr. "fsb"
 *   data-prikaz     "popis" (zadano) ili "mjesec"
 *   data-vrsta      "rokovi" ili "dogadaji" (zadano: sve)
 *   data-broj       najviše stavki u popisu, 1-50 (zadano 12)
 *   data-kontrole   "ne" sakriva filtre i izbor prikaza
 *   data-tema       "tamna"
 *   data-boja       boja isticanja, npr. "#0a7d4f"
 *   data-visina     fiksna visina u pikselima; bez toga se visina sama prilagođava sadržaju
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : location.origin;
  var frames = (window.__rokovnikFrames = window.__rokovnikFrames || {});
  var counter = (window.__rokovnikCounter = window.__rokovnikCounter || 0);

  function mount(el) {
    if (el.getAttribute("data-rokovnik-mounted")) return;
    var slug = (el.getAttribute("data-rokovnik") || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return;
    el.setAttribute("data-rokovnik-mounted", "1");

    var id = "rk-" + ++counter;
    window.__rokovnikCounter = counter;
    var q = new URLSearchParams();
    q.set("wid", id);
    var d = el.dataset;
    if (d.prikaz === "mjesec") q.set("prikaz", "mjesec");
    if (d.vrsta === "rokovi" || d.vrsta === "dogadaji") q.set("vrsta", d.vrsta);
    if (d.broj && /^\d{1,2}$/.test(d.broj)) q.set("broj", d.broj);
    if (d.kontrole === "ne") q.set("kontrole", "ne");
    if (d.tema === "tamna") q.set("tema", "tamna");
    if (d.boja && /^#?[0-9a-fA-F]{6}$/.test(d.boja)) q.set("boja", d.boja.replace("#", ""));

    var fixed = d.visina && /^\d{2,4}$/.test(d.visina) ? Number(d.visina) : 0;
    var frame = document.createElement("iframe");
    frame.src = origin + "/ugradi/" + slug + "?" + q.toString();
    frame.title = "Kalendar događaja i rokova";
    frame.loading = "lazy";
    frame.style.cssText = "display:block;width:100%;border:0;height:" + (fixed || 420) + "px;color-scheme:normal";
    if (!fixed) frames[id] = frame;

    if (el.tagName === "SCRIPT") el.parentNode.insertBefore(frame, el);
    else el.appendChild(frame);
  }

  function mountAll() {
    var nodes = document.querySelectorAll("[data-rokovnik]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (!window.__rokovnikListening) {
    window.__rokovnikListening = true;
    window.addEventListener("message", function (e) {
      var m = e.data;
      if (!m || m.type !== "rokovnik:visina" || typeof m.height !== "number") return;
      var frame = frames[m.id];
      // Poruku prihvaćamo samo od okvira koji smo sami postavili.
      if (!frame || e.source !== frame.contentWindow) return;
      frame.style.height = Math.max(120, Math.min(m.height, 6000)) + "px";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
  // Za stranice koje sadržaj dodaju naknadno: window.Rokovnik.osvjezi()
  window.Rokovnik = { osvjezi: mountAll };
})();
