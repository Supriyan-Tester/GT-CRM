/*
 * Collect popup: collects ONE payment for ONE bill.
 * Used by the delivery (worker/collect-sheet.html) and sales (sales/collect-sheet.html) screens.
 *
 * Usage:
 *   CollectPopup.open({
 *     customerCode, invoiceNumber, invoiceId,      // invoiceId is "NEW" when the bill is not in Accounts yet
 *     maxAmount, startAmount, startMethod, startNote,
 *     allowPayLater, photoRequired, photoOnlyWithPayLater, correctsId,
 *     callApi: function (path, body) { return promise },
 *     onSaved: function (result) {}
 *   });
 *
 * result = { invoiceId, amount, label, hasPhoto, payLater }
 * Look is driven by the theme variables in shared/theme.css (--card, --primary, ...).
 */
(function () {
  var METHOD_NAMES = { cash: "Cash", upi: "UPI", bank_transfer: "Bank" };
  var METHOD_ICONS = { cash: "💵", upi: "📱", bank_transfer: "🏦" };
  var SPLIT_METHODS = ["cash", "upi", "bank_transfer"];
  var MAX_PHOTO_BYTES = 25 * 1024 * 1024;

  var STYLE = [
    ".cp-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}",
    ".cp-sheet{background:var(--card,#fff);color:var(--text,#0f172a);width:100%;max-width:460px;max-height:96%;overflow:auto;border-radius:20px 20px 0 0;padding:16px 16px 0;display:grid;gap:12px;font-family:inherit}",
    "@media(min-width:700px){.cp-overlay{align-items:center}.cp-sheet{border-radius:20px}}",
    ".cp-sheet h3{margin:0;font-size:18px}.cp-sub{color:var(--muted,#64748b);font-size:13px}",
    ".cp-label{font-size:13px;font-weight:700;margin-bottom:6px;display:block}",
    ".cp-row{display:flex;gap:8px;align-items:center}",
    ".cp-input,.cp-select{width:100%;min-width:0;box-sizing:border-box;min-height:46px;border:1px solid var(--border,var(--line,#e3e7ec));border-radius:12px;padding:9px 12px;background:var(--bg,#f7f8fa);color:var(--text,#0f172a);font:inherit;font-size:17px}",
    ".cp-btn{border:0;border-radius:12px;min-height:46px;padding:0 16px;font:inherit;font-weight:700;background:var(--primary,var(--pri,#0f766e));color:var(--on-primary,var(--on-pri,#fff));cursor:pointer}",
    ".cp-btn.cp-ghost{background:var(--bg,#f7f8fa);color:var(--text,#0f172a);border:1px solid var(--border,var(--line,#e3e7ec))}",
    ".cp-btn:disabled{opacity:.5;cursor:not-allowed}",
    ".cp-seg{display:flex;background:var(--bg,#f7f8fa);border:1px solid var(--border,var(--line,#e3e7ec));border-radius:12px;padding:3px}",
    ".cp-seg button{flex:1;border:0;background:none;color:var(--text,#0f172a);padding:9px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}",
    ".cp-seg button.on{background:var(--primary,var(--pri,#0f766e));color:var(--on-primary,var(--on-pri,#fff))}",
    ".cp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px}",
    ".cp-tile{border:1.5px solid var(--border,var(--line,#e3e7ec));background:var(--card,#fff);color:var(--text,#0f172a);border-radius:12px;padding:10px 4px;font:inherit;font-weight:600;display:grid;gap:2px;justify-items:center;cursor:pointer}",
    ".cp-tile.on{border-color:var(--primary,var(--pri,#0f766e));background:var(--t-primary,var(--pri-soft,#e6f4f1))}",
    ".cp-split{display:none;gap:8px}.cp-split.on{display:grid}",
    ".cp-split label{display:grid;grid-template-columns:86px minmax(0,1fr);align-items:center;gap:8px;font-weight:600}",
    ".cp-msg{font-size:13px;color:var(--muted,#64748b);min-height:18px}",
    ".cp-msg.ok{color:var(--success,var(--teal,#16a34a));font-weight:700}.cp-msg.bad,.cp-error{color:var(--danger,var(--red,#dc2626))}",
    ".cp-error{font-size:13px;font-weight:600;min-height:16px}",
    ".cp-note{display:none}.cp-note.on{display:block}",
    ".cp-photo-box{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
    ".cp-preview{display:none;align-items:center;gap:10px}.cp-preview.on{display:flex}",
    ".cp-preview img{width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid var(--border,var(--line,#e3e7ec))}",
    ".cp-link{background:none;border:0;color:var(--primary,var(--pri,#0f766e));font:inherit;font-weight:700;cursor:pointer;padding:0}",
    ".cp-footer{display:grid;grid-template-columns:1fr 2fr;gap:8px;position:sticky;bottom:0;background:var(--card,#fff);margin:0 -16px;padding:10px 16px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,var(--line,#e3e7ec))}"
  ].join("\n");

  function addStyleOnce() {
    if (document.getElementById("cpStyle")) return;
    var styleTag = document.createElement("style");
    styleTag.id = "cpStyle";
    styleTag.textContent = STYLE;
    document.head.appendChild(styleTag);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function formatMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toPaise(value) {
    return Math.round(Number(value) * 100);
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Phone photos are shrunk to at most 1600 px (JPEG) before upload.
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      var objectUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        try {
          var scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          readFileAsDataUrl(file).then(resolve);
        }
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        readFileAsDataUrl(file).then(resolve);
      };
      image.src = objectUrl;
    });
  }

  function open(options) {
    addStyleOnce();
    var maxAmount = Number(options.maxAmount) || 0;
    var state = {
      isSplit: false,
      method: options.startMethod && METHOD_NAMES[options.startMethod] ? options.startMethod : "cash",
      isPayLater: false,
      photoFile: null,
      photoPreviewUrl: "",
      uploadedPath: "",
      createdInvoiceId: "",
      busy: false,
      requestKey: window.crypto && crypto.randomUUID ? crypto.randomUUID() : "COL-" + Date.now() + "-" + Math.random().toString(36).slice(2)
    };

    var overlay = document.createElement("div");
    overlay.className = "cp-overlay";
    var tilesHtml = SPLIT_METHODS.map(function (method) {
      return '<button type="button" class="cp-tile" data-method="' + method + '"><span>' + METHOD_ICONS[method] + "</span>" + METHOD_NAMES[method] + "</button>";
    }).join("");
    if (options.allowPayLater) {
      tilesHtml += '<button type="button" class="cp-tile" data-method="pay_later"><span>🧾</span>Pay Later</button>';
    }
    var splitHtml = SPLIT_METHODS.map(function (method, position) {
      return '<label><span>' + METHOD_ICONS[method] + " " + METHOD_NAMES[method] + '</span><input class="cp-input" data-split="' + method + '" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label>';
    }).join("");

    overlay.innerHTML =
      '<div class="cp-sheet" role="dialog" aria-modal="true">' +
        "<div><h3>Invoice " + escapeHtml(options.invoiceNumber) + '</h3><div class="cp-sub">Outstanding ' + formatMoney(maxAmount) + "</div></div>" +
        '<div><span class="cp-label" id="cpAmountLabel">Amount received</span>' +
          '<div class="cp-row"><input class="cp-input" id="cpAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00">' +
          '<button type="button" class="cp-btn cp-ghost" id="cpFull">Full</button></div></div>' +
        "<div><span class=\"cp-label\">Payment method</span>" +
          '<div class="cp-seg" id="cpModeSeg" style="margin-bottom:8px"><button type="button" class="on" data-mode="single">Single</button><button type="button" data-mode="split">Split</button></div>' +
          '<div class="cp-tiles" id="cpTiles">' + tilesHtml + "</div>" +
          '<div id="cpReceivedByBox" style="display:none;margin-top:8px"><span class="cp-label">Received now paid by</span>' +
            '<select class="cp-select" id="cpReceivedBy"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank</option></select></div>' +
          '<div class="cp-split" id="cpSplitBox">' + splitHtml + "</div>" +
          '<div class="cp-msg" id="cpMessage"></div></div>' +
        '<div id="cpPhotoSection"><span class="cp-label">Bill photo <span class="cp-sub" id="cpPhotoHint"></span></span>' +
          '<div class="cp-photo-box"><button type="button" class="cp-btn cp-ghost" id="cpCamera">📷 Camera</button><button type="button" class="cp-btn cp-ghost" id="cpGallery">🖼 Gallery</button></div>' +
          '<input type="file" id="cpCameraInput" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none">' +
          '<input type="file" id="cpGalleryInput" accept="image/jpeg,image/png,image/webp" style="display:none">' +
          '<div class="cp-preview" id="cpPreview"><img id="cpPreviewImg" alt="Bill photo"><button type="button" class="cp-link" id="cpRemovePhoto">Remove</button></div></div>' +
        '<div><button type="button" class="cp-link" id="cpNoteToggle">+ Add a note (optional)</button>' +
          '<textarea class="cp-input cp-note" id="cpNote" rows="2" maxlength="250" placeholder="Reference or remarks" style="font-size:15px;margin-top:6px"></textarea></div>' +
        '<div class="cp-error" id="cpError" role="status"></div>' +
        '<div class="cp-footer"><button type="button" class="cp-btn cp-ghost" id="cpCancel">Cancel</button><button type="button" class="cp-btn" id="cpSave" disabled>Save collection</button></div>' +
      "</div>";
    document.body.appendChild(overlay);

    function find(id) { return overlay.querySelector("#" + id); }
    var amountInput = find("cpAmount");
    var messageBox = find("cpMessage");
    var saveButton = find("cpSave");
    var errorBox = find("cpError");
    var splitInputs = {};
    SPLIT_METHODS.forEach(function (method) {
      splitInputs[method] = overlay.querySelector('[data-split="' + method + '"]');
    });

    function enteredAmount() { return Number(amountInput.value) || 0; }

    function photoIsNeeded() {
      if (options.photoRequired) return true;
      return state.isPayLater && (options.invoiceId === "NEW" || enteredAmount() > 0);
    }

    function splitPayments() {
      var payments = [];
      SPLIT_METHODS.forEach(function (method) {
        var value = Number(splitInputs[method].value);
        if (value > 0) payments.push({ method: method, amount: value });
      });
      return payments;
    }

    function splitTotalPaise() {
      return splitPayments().reduce(function (sum, payment) { return sum + toPaise(payment.amount); }, 0);
    }

    // After the person types in one split box, the untouched box gets the balance. Typed boxes stay as typed.
    function autoBalance(typedMethod) {
      var typedInput = splitInputs[typedMethod];
      typedInput.dataset.typed = typedInput.value === "" ? "0" : "1";
      var typedPaise = 0;
      var autoMethods = [];
      SPLIT_METHODS.forEach(function (method) {
        var input = splitInputs[method];
        if (input.dataset.typed === "1" && input.value !== "") typedPaise += toPaise(input.value);
        else autoMethods.push(method);
      });
      var balancePaise = toPaise(enteredAmount()) - typedPaise;
      autoMethods.forEach(function (method, position) {
        var input = splitInputs[method];
        input.dataset.typed = "0";
        input.value = position === 0 && balancePaise > 0 ? (balancePaise / 100).toFixed(2) : "";
      });
    }

    function refresh() {
      var amount = enteredAmount();
      var problem = "";
      var message = "";
      var messageClass = "cp-msg";
      find("cpModeSeg").style.display = state.isPayLater ? "none" : "";
      find("cpTiles").style.display = state.isSplit ? "none" : "grid";
      find("cpSplitBox").className = "cp-split" + (state.isSplit ? " on" : "");
      find("cpReceivedByBox").style.display = state.isPayLater ? "block" : "none";
      overlay.querySelectorAll("[data-mode]").forEach(function (button) {
        button.className = (button.getAttribute("data-mode") === "split") === state.isSplit ? "on" : "";
      });
      overlay.querySelectorAll("[data-method]").forEach(function (tile) {
        var tileMethod = tile.getAttribute("data-method");
        var isOn = state.isPayLater ? tileMethod === "pay_later" : tileMethod === state.method;
        tile.className = "cp-tile" + (isOn ? " on" : "");
      });
      find("cpAmountLabel").textContent = state.isPayLater ? "Received now (0 = everything on credit)" : "Amount received";
      // options.photoOnlyWithPayLater: the photo is asked only when Pay Later is chosen (current bill in delivery).
      var photoVisible = !options.photoOnlyWithPayLater || state.isPayLater;
      find("cpPhotoSection").style.display = photoVisible ? "" : "none";
      if (!photoVisible && state.photoFile) clearPhoto();
      find("cpPhotoHint").textContent = photoIsNeeded() ? "(needed)" : "(optional)";

      if (amount > maxAmount + 0.001) problem = "Amount cannot be more than " + formatMoney(maxAmount) + ".";
      else if (state.isPayLater) {
        message = amount > 0 ? "Balance " + formatMoney(maxAmount - amount) + " goes to credit." : "Full " + formatMoney(maxAmount) + " goes to credit.";
        if (options.invoiceId !== "NEW" && amount === 0) problem = "Nothing to save. Enter the amount received now.";
      } else if (!(amount > 0)) problem = "Enter the amount received.";
      else if (state.isSplit) {
        var remaining = (toPaise(amount) - splitTotalPaise()) / 100;
        if (remaining !== 0) {
          message = "Total " + formatMoney(amount) + " · " + (remaining > 0 ? "Remaining " + formatMoney(remaining) : "Over by " + formatMoney(-remaining));
          messageClass = "cp-msg bad";
          problem = "split";
        } else if (splitPayments().length < 2) {
          message = "Use at least two payment methods.";
          messageClass = "cp-msg bad";
          problem = "split";
        } else {
          message = "✓ Matches total: " + splitPayments().map(function (payment) { return METHOD_NAMES[payment.method] + " " + formatMoney(payment.amount); }).join(" + ");
          messageClass = "cp-msg ok";
        }
      }
      if (photoIsNeeded() && !state.photoFile && !problem) problem = "Add the bill photo.";
      messageBox.className = messageClass;
      messageBox.textContent = message || (problem && problem !== "split" && amount > 0 ? problem : "");
      saveButton.disabled = state.busy || !!problem;
    }

    // On phones the keyboard covers the bottom of the screen: keep the popup inside the visible part
    // so the Cancel and Save buttons stay in view.
    function fitToVisibleScreen() {
      var visible = window.visualViewport;
      if (!visible) return;
      overlay.style.bottom = "auto";
      overlay.style.top = visible.offsetTop + "px";
      overlay.style.height = visible.height + "px";
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitToVisibleScreen);
      window.visualViewport.addEventListener("scroll", fitToVisibleScreen);
      fitToVisibleScreen();
    }
    function close() {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", fitToVisibleScreen);
        window.visualViewport.removeEventListener("scroll", fitToVisibleScreen);
      }
      document.removeEventListener("keydown", onKey);
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      overlay.remove();
    }
    function onKey(event) { if (event.key === "Escape" && !state.busy) close(); }
    document.addEventListener("keydown", onKey);

    function setPhoto(file) {
      if (!file) return;
      if (file.size > MAX_PHOTO_BYTES) {
        errorBox.textContent = "Each photo must be 25 MB or smaller.";
        return;
      }
      errorBox.textContent = "";
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoFile = file;
      state.uploadedPath = "";
      state.photoPreviewUrl = URL.createObjectURL(file);
      find("cpPreviewImg").src = state.photoPreviewUrl;
      find("cpPreview").className = "cp-preview on";
      refresh();
    }

    amountInput.oninput = function () {
      if (enteredAmount() > maxAmount) amountInput.value = maxAmount.toFixed(2);
      var decimals = amountInput.value.split(".")[1];
      if (decimals && decimals.length > 2) amountInput.value = Number(amountInput.value).toFixed(2);
      if (state.isSplit) SPLIT_METHODS.forEach(function (method) { splitInputs[method].value = ""; splitInputs[method].dataset.typed = "0"; });
      refresh();
    };
    find("cpFull").onclick = function () { amountInput.value = maxAmount.toFixed(2); amountInput.oninput(); };
    overlay.querySelectorAll("[data-mode]").forEach(function (button) {
      button.onclick = function () {
        state.isSplit = button.getAttribute("data-mode") === "split";
        SPLIT_METHODS.forEach(function (method) { splitInputs[method].value = ""; splitInputs[method].dataset.typed = "0"; });
        refresh();
      };
    });
    find("cpTiles").onclick = function (event) {
      var tile = event.target.closest("[data-method]");
      if (!tile) return;
      var chosen = tile.getAttribute("data-method");
      state.isPayLater = chosen === "pay_later";
      if (!state.isPayLater) state.method = chosen;
      refresh();
    };
    SPLIT_METHODS.forEach(function (method) {
      splitInputs[method].oninput = function () { autoBalance(method); refresh(); };
    });
    find("cpCamera").onclick = function () { find("cpCameraInput").click(); };
    find("cpGallery").onclick = function () { find("cpGalleryInput").click(); };
    find("cpCameraInput").onchange = function () { setPhoto(this.files[0]); this.value = ""; };
    find("cpGalleryInput").onchange = function () { setPhoto(this.files[0]); this.value = ""; };
    function clearPhoto() {
      if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
      state.photoFile = null;
      state.photoPreviewUrl = "";
      state.uploadedPath = "";
      find("cpPreview").className = "cp-preview";
    }
    find("cpRemovePhoto").onclick = function () {
      clearPhoto();
      refresh();
    };
    find("cpNoteToggle").onclick = function () {
      var noteBox = find("cpNote");
      noteBox.classList.toggle("on");
      if (noteBox.classList.contains("on")) noteBox.focus();
    };
    find("cpCancel").onclick = function () { if (!state.busy) close(); };

    saveButton.onclick = async function () {
      if (state.busy) return;
      state.busy = true;
      errorBox.textContent = "";
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
      try {
        var amount = enteredAmount();
        if (state.photoFile && !state.uploadedPath) {
          var uploaded = await options.callApi("/api/accounts/evidence", { data: await shrinkImage(state.photoFile) });
          state.uploadedPath = uploaded.evidencePath;
        }
        var invoiceId = options.invoiceId;
        if (invoiceId === "NEW") {
          if (!state.createdInvoiceId) {
            var created = await options.callApi("/api/accounts/delivery-invoice", {
              customerCode: options.customerCode,
              invoiceNo: options.invoiceNumber,
              evidencePath: state.uploadedPath || undefined
            });
            state.createdInvoiceId = created.invoiceId;
          }
          invoiceId = state.createdInvoiceId;
        }
        var result = { invoiceId: invoiceId, amount: amount, label: "", hasPhoto: !!state.uploadedPath, payLater: state.isPayLater };
        if (state.isPayLater && amount === 0) {
          result.label = "Pay Later";
        } else {
          var allocations = [{ invoiceId: invoiceId, amount: amount, evidencePath: state.uploadedPath || undefined }];
          var noteText = find("cpNote").value;
          if (state.isSplit) {
            var splitResponse = await options.callApi("/api/accounts/collections/split", {
              customerCode: options.customerCode,
              payments: splitPayments(),
              allocations: allocations,
              requestKey: state.requestKey,
              note: noteText,
              correctsId: options.correctsId || undefined
            });
            result.label = (splitResponse.parts || splitPayments()).map(function (part) { return METHOD_NAMES[part.method]; }).join(" + ");
          } else {
            var paidBy = state.isPayLater ? find("cpReceivedBy").value : state.method;
            await options.callApi("/api/accounts/collections", {
              customerCode: options.customerCode,
              method: paidBy,
              allocations: allocations,
              requestKey: state.requestKey,
              note: noteText,
              correctsId: options.correctsId || undefined
            });
            result.label = METHOD_NAMES[paidBy] + (state.isPayLater ? " + Credit" : "");
          }
        }
        close();
        options.onSaved(result);
      } catch (error) {
        state.busy = false;
        saveButton.textContent = "Save collection";
        errorBox.textContent = error.message || "Something went wrong";
        refresh();
      }
    };

    if (options.startAmount > 0) amountInput.value = Math.min(Number(options.startAmount), maxAmount).toFixed(2);
    else amountInput.value = maxAmount > 0 ? maxAmount.toFixed(2) : "";
    if (options.startNote) {
      find("cpNote").value = options.startNote;
      find("cpNote").classList.add("on");
    }
    refresh();
  }

  window.CollectPopup = { open: open };
})();