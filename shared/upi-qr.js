/* Shows the shop's UPI QR code when UPI is chosen on a collection page (delivery, sales or office).
   The QR picture is uploaded once in Admin > My profile > UPI QR code. */
(function () {
  var URL_QR = "/api/upi-qr";
  var card = null;
  function remove() { if (card) { card.remove(); card = null; } }
  function show(anchor) {
    remove();
    if (!anchor || !anchor.parentNode) return;
    var img = new Image();
    img.alt = "UPI QR code";
    img.style.cssText = "display:block;margin:8px auto 0;width:100%;max-width:260px;border-radius:10px;background:#fff;padding:8px";
    img.onload = function () {
      card = document.createElement("div");
      card.setAttribute("data-upi-qr", "1");
      card.style.cssText = "margin:10px 0;padding:12px;border:1px solid rgba(128,128,128,.35);border-radius:12px;text-align:center";
      card.innerHTML = "<b>Scan to pay by UPI</b><br><small style=\"opacity:.75\">Ask the customer to scan this, then check the payment before you continue.</small>";
      card.appendChild(img);
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    };
    img.onerror = function () {}; /* no QR uploaded yet: show nothing */
    img.src = URL_QR + "?t=" + Date.now();
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-m]");
    if (!t) return;
    if (t.getAttribute("data-m") === "upi") show(t.closest(".tiles, .cs-tiles") || t.parentNode);
    else remove();
  }, true);
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el && el.id === "method") {
      if (el.value === "upi") show(el.closest(".field") || el.parentNode);
      else remove();
    }
  });
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el && el.id === "sp_upi") {
      if (Number(el.value) > 0) show(el.closest("label") || el.parentNode);
      else remove();
    }
  });
})();
