/* Elementos */
const darkModeToggle = document.getElementById("dark-mode-toggle");
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const filePreview = document.getElementById("file-preview");
const fileNameSpan = document.getElementById("file-name");
const fileTypeInfo = document.getElementById("file-type-info");
const previewImg = document.getElementById("img-preview");
const sizeBeforeSpan = document.getElementById("size-before");
const sizeAfterSpan = document.getElementById("size-after");
const cleanBtn = document.getElementById("clean-btn");
const downloadBtn = document.getElementById("download-btn");
const modal = document.getElementById("modal");
const modalMessage = document.getElementById("modal-message");
const modalClose = document.getElementById("modal-close");
const progressContainer = document.getElementById("progress-container");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");

/* ffmpeg.wasm (disponible desde index.html) */
const { createFFmpeg, fetchFile } = (typeof FFmpeg !== 'undefined' && FFmpeg) ? FFmpeg : {};
let ffmpeg = null;
let ffmpegLoaded = false;

/* Estado para evitar reentradas en el diálogo de archivo */
let openingFileDialog = false;
/* Supresión posterior para evitar reaperturas automáticas en algunos WebViews/móviles */
let lastDialogOpenedAt = 0; // timestamp ms.

/* Inicialización segura */
(function init() {
  // Restaurar modo oscuro de inmediato (no depender de DOMContentLoaded).
  try {
    const modo = localStorage.getItem("modo");
    if (modo === "oscuro") {
      document.body.classList.add("dark-mode");
      darkModeToggle.textContent = "☀️";
    } else {
      darkModeToggle.textContent = "🌙";
    }
  } catch (e) {
    // Ignore.
  }

  // Listeners.
  darkModeToggle.addEventListener("click", toggleDarkMode);
  darkModeToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDarkMode(); }
  });

  uploadArea.addEventListener("click", handleUploadClick);
  uploadArea.addEventListener("keydown", handleUploadKeydown);

  uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.style.background = "rgba(255, 0, 0, 0.05)"; });
  uploadArea.addEventListener("dragleave", () => { uploadArea.style.background = "transparent"; });
  uploadArea.addEventListener("drop", (e) => { e.preventDefault(); uploadArea.style.background = "transparent"; if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  // El fileInput seguirá existiendo y se usará preferentemente.
  fileInput.addEventListener("change", () => {
    // Al recibir change, se considera que el diálogo se abrió correctamente; limpiamos flags.
    openingFileDialog = false;
    lastDialogOpenedAt = Date.now();
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
      // Resetear input para permitir seleccionar el mismo archivo otra vez en el futuro.
      setTimeout(() => { try { fileInput.value = ""; } catch(e){} }, 50);
    }
  });

  cleanBtn.addEventListener("click", onCleanClick);
  downloadBtn.addEventListener("click", onDownloadClick);

  modalClose.addEventListener("click", cerrarModal);
  modalClose.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") cerrarModal(); });
  window.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });
})();

/* Dark Mode */
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  if (document.body.classList.contains("dark-mode")) {
    darkModeToggle.textContent = "☀️";
    try { localStorage.setItem("modo", "oscuro"); } catch(e) {}
  } else {
    darkModeToggle.textContent = "🌙";
    try { localStorage.setItem("modo", "claro"); } catch(e) {}
  }
}

/* Upload area handlers + fallback robusto */
function handleUploadKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handleUploadClick();
  }
}

function handleUploadClick(e) {
  const now = Date.now();
  // Supresión temporal: Si abrimos hace menos de 700ms, ignorar (evita reaperturas automáticas).
  if (now - lastDialogOpenedAt < 700) return;
  // Evitar reentradas rápidas.
  if (openingFileDialog) return;
  openingFileDialog = true;
  lastDialogOpenedAt = now;

  // Escuchar un cambio en el input original: Si ocurre, diálogo abrió correctamente.
  let opened = false;
  const onOriginalChange = () => { opened = true; cleanup(); };
  fileInput.addEventListener('change', onOriginalChange, { once: true });

  // Intentamos abrir el input "normal".
  try {
    fileInput.click();
  } catch (err) {
    // Algunos entornos bloquean .click(), seguiremos a fallback tras timeout.
  }

  // Esperamos un pequeño timeout; si no hubo cambio, lanzamos fallback.
  const timeout = 550; // ms.
  const fallbackTimer = setTimeout(() => {
    if (!opened) {
      // Crear input temporal y usarlo. El temporal limpiará flags cuando cambie.
      fallbackFileInput();
    }
    cleanup();
  }, timeout);

  function cleanup() {
    clearTimeout(fallbackTimer);
    openingFileDialog = false;
    lastDialogOpenedAt = Date.now();
    // Remover listener (si no se ejecutó ya).
    try { fileInput.removeEventListener('change', onOriginalChange); } catch(e){}
  }
}

function fallbackFileInput() {
  // Si ya existe un diálogo en proceso, no crear otro.
  if (openingFileDialog) {
    // Si ya hay apertura, ignorar.
  }
  const temp = document.createElement("input");
  temp.type = "file";
  temp.style.position = "fixed";
  temp.style.left = "-10000px";
  temp.style.top = "auto";
  temp.style.opacity = "0";
  temp.addEventListener("change", () => {
    openingFileDialog = false;
    lastDialogOpenedAt = Date.now();
    if (temp.files && temp.files[0]) handleFile(temp.files[0]);
    setTimeout(() => temp.remove(), 200);
  }, { once: true });
  // En caso de que el usuario cancele sin seleccionar, limpiar el flag al perder foco.
  temp.addEventListener("blur", () => { openingFileDialog = false; lastDialogOpenedAt = Date.now(); }, { once: true });
  document.body.appendChild(temp);
  // Algunos entornos requieren un pequeño delay antes de click.
  setTimeout(() => {
    try { temp.click(); } catch(e) { openingFileDialog = false; lastDialogOpenedAt = Date.now(); }
  }, 20);
}

/* Manejo de archivo seleccionado */
let selectedFile = null;
let cleanedBlob = null;

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  cleanedBlob = null;

  // Nombre: Se protege mediante CSS; aquí ponemos texto seguro.
  fileNameSpan.textContent = file.name;
  fileTypeInfo.textContent = `Tipo MIME: ${file.type || 'desconocido'} — Tamaño: ${formatBytes(file.size)}`;
  sizeBeforeSpan.textContent = formatBytes(file.size);
  sizeAfterSpan.textContent = "—";
  filePreview.classList.remove("hidden");
  // Animación: fade-container.visible.
  filePreview.classList.add("visible");
  cleanBtn.classList.remove("hidden");
  downloadBtn.classList.add("hidden");
  downloadBtn.classList.remove("visible");
  previewImg.style.display = "none";
  resetProgress();

  /* Quitar foco del área de subida para evitar que en algunos navegadores un retorno de foco provoque reapertura del diálogo */
  try { uploadArea.blur(); } catch(e){}

  // Si es imagen, preview.
  if ((file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
    const r = new FileReader();
    r.onerror = () => { previewImg.style.display = "none"; };
    r.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.style.display = "block";
    };
    r.readAsDataURL(file);
  }
}

/* Botones (limpiar / descargar) */
async function onCleanClick() {
  if (!selectedFile) { mostrarModal("Selecciona un archivo primero.", false); return; }
  mostrarModal("Iniciando limpieza...", true);
  setProgress(0, "Preparando...");
  const mime = selectedFile.type || getMimeFromName(selectedFile.name);

  try {
    if (mime && mime.startsWith("image/")) {
      setProgress(5, "Limpiando imagen...");
      cleanedBlob = await cleanImage(selectedFile, mime, setProgress);
      setProgress(100, "Imagen limpia.");
      mostrarModal("Imagen limpiada correctamente.", true);
    } else if (mime === "application/pdf") {
      setProgress(5, "Procesando PDF...");
      cleanedBlob = await cleanPDF(selectedFile, setProgress);
      setProgress(100, "PDF procesado.");
      mostrarModal("PDF procesado; campos comunes limpiados.", true);
    } else if ((mime && (mime.startsWith("audio/") || mime.startsWith("video/"))) ||
               /\.(mp3|mp4|mov|m4a|wav)$/i.test(selectedFile.name)) {
      setProgress(5, "Cargando ffmpeg...");
      await ensureFFmpeg(setProgress);
      setProgress(20, "Limpiando multimedia...");
      cleanedBlob = await cleanWithFFmpeg(selectedFile, setProgress);
      setProgress(100, "Multimedia limpia.");
      mostrarModal("Archivo multimedia limpiado (experimental).", true);
    } else {
      mostrarModal("Tipo no soportado en esta versión local.", false);
      setProgress(0, "No procesado");
      return;
    }

    if (cleanedBlob) {
      sizeAfterSpan.textContent = formatBytes(cleanedBlob.size);
      downloadBtn.classList.remove("hidden");
      setTimeout(() => downloadBtn.classList.add("visible"), 150);
    }

  } catch (err) {
    console.error(err);
    mostrarModal("Error durante limpieza: " + (err && err.message ? err.message : String(err)), false);
    setProgress(0, "Error");
  }
}

function onDownloadClick() {
  if (!cleanedBlob) { mostrarModal("Primero elimina los metadatos.", false); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(cleanedBlob);
  a.download = "archivo-limpio" + getExtension(selectedFile.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/* Utilidades */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 B";
  const k = 1024; const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
function getExtension(filename) {
  const idx = filename.lastIndexOf(".");
  return idx !== -1 ? filename.slice(idx) : "";
}
function getMimeFromName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4", mov: "video/quicktime", wav: "audio/wav", m4a: "audio/mp4" };
  return map[ext] || "";
}

/* Progress UI */
function setProgress(percent, text) {
  progressContainer.classList.remove("hidden");
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  progressFill.style.width = p + "%";
  progressText.textContent = text || "";
  if (p >= 100) {
    setTimeout(() => progressContainer.classList.add("hidden"), 800);
  }
}
function resetProgress() {
  progressFill.style.width = "0%";
  progressText.textContent = "";
}

/* Imagen: Limpieza (piexif + canvas) */
function cleanImage(file, mime, progressCb = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = (e) => {
      try {
        const dataURL = e.target.result;
        // JPEG: piexif.
        if ((mime === "image/jpeg" || /\.jpe?g$/i.test(file.name)) && window.piexif && typeof piexif.remove === "function") {
          try {
            progressCb(25, "Removiendo EXIF...");
            const cleanDataURL = piexif.remove(dataURL);
            const blob = dataURLToBlob(cleanDataURL);
            resolve(blob);
            return;
          } catch (ex) {
            console.warn("piexif falló:", ex);
            // Continúa a fallback canvas.
          }
        }
        // Fallback: Canvas para PNG/WEBP/GIF o si piexif falla.
        progressCb(40, "Renderizando en canvas...");
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const outType = (mime && mime !== "image/gif") ? mime : "image/png";
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("No se pudo generar imagen limpia."));
            }, outType);
          } catch (err) { reject(err); }
        };
        img.onerror = () => reject(new Error("No se pudo cargar la imagen en memoria."));
        img.src = dataURL;
      } catch (err) { reject(err); }
    };
    reader.readAsDataURL(file);
  });
}
function dataURLToBlob(dataurl) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/* PDF: Limpieza con pdf-lib */
async function cleanPDF(file, progressCb = () => {}) {
  progressCb(10, "Leyendo PDF...");
  const arrayBuffer = await file.arrayBuffer();
  const { PDFDocument } = window.PDFLib || {};
  if (!PDFDocument) throw new Error("pdf-lib no cargado.");
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  progressCb(40, "Limpiando campos...");
  try {
    pdfDoc.setTitle("");
    pdfDoc.setAuthor("");
    pdfDoc.setSubject("");
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer("");
    pdfDoc.setCreator("");
    pdfDoc.setCreationDate(undefined);
    pdfDoc.setModificationDate(undefined);
  } catch (e) { console.warn("No se pudieron limpiar algunos campos:", e); }
  progressCb(80, "Guardando PDF...");
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

/* ffmpeg.wasm: Carga + limpieza multimedia */
async function ensureFFmpeg(progressCb = () => {}) {
  if (ffmpegLoaded) return;
  try {
    progressCb(5, "Inicializando ffmpeg...");
    if (typeof createFFmpeg !== "function") throw new Error("ffmpeg no disponible");
    ffmpeg = createFFmpeg({ log: false });
    await ffmpeg.load();
    ffmpegLoaded = true;
    progressCb(20, "ffmpeg cargado");
  } catch (err) {
    ffmpegLoaded = false;
    console.error("ffmpeg error:", err);
    throw err;
  }
}

async function cleanWithFFmpeg(file, progressCb = () => {}) {
  if (!ffmpegLoaded || !ffmpeg) throw new Error("ffmpeg no cargado.");
  const name = file.name;
  const ext = getExtension(name) || '';
  const inName = "input" + ext;
  const outName = "output" + ext;

  progressCb(30, "Cargando archivo a FS...");
  const data = await fetchFile(file);
  ffmpeg.FS('writeFile', inName, data);

  try {
    progressCb(45, "Ejecutando ffmpeg (removiendo metadata)...");
    await ffmpeg.run('-i', inName, '-map_metadata', '-1', '-c', 'copy', outName);
  } catch (err) {
    console.warn("Comando copy falló, transcodificando como fallback", err);
    const lower = ext.toLowerCase();
    if (lower.includes('mp3')) {
      await ffmpeg.run('-i', inName, '-map_metadata', '-1', '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outName);
    } else if (lower.includes('mp4') || lower.includes('mov') || lower.includes('m4a')) {
      await ffmpeg.run('-i', inName, '-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', outName);
    } else {
      await ffmpeg.run('-i', inName, '-map_metadata', '-1', outName);
    }
  }

  progressCb(80, "Recuperando output...");
  const outData = ffmpeg.FS('readFile', outName);
  try { ffmpeg.FS('unlink', inName); } catch(e){/*Ignore*/};
  try { ffmpeg.FS('unlink', outName); } catch(e){/*Ignore*/};
  progressCb(95, "Generando blob...");
  return new Blob([outData.buffer], { type: file.type || 'application/octet-stream' });
}

/* Modal */
function mostrarModal(mensaje, exito = true) {
  modalMessage.textContent = mensaje;
  // Establecer clase de acuerdo al resultado.
  modalMessage.className = exito ? "success" : "error";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => cerrarModal(), 3500);
}
function cerrarModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
    }
